// ─── The plan: steps, parts, and the fingerprint of a file ────────────────
//
// M2-c: an upload is ONE fixed plan, computed here before the first write.
// A step is a contiguous day range; a part is one batch; the server's cursor is
// (step, part), 0-based. Steps tile [range_start, range_end] with no gap and no
// overlap, which is what the server's tiling guard checks.
//
// How days become steps: consecutive days share one step (one part) for as long
// as they fit in a single part; a day that does not fit in an empty part gets a
// step of its own, split across as many parts as it needs. So a day is never
// split across two steps — a finished step is always whole days, which is what
// the server's partial `import_through` relies on after a failure.
//
// Caps (M2-e, M2-c):
//   - a part holds at most 5,000 rows across the five tables AND at most
//     768 KiB, well inside the server's 1 MiB body reader;
//   - a plan has at most 5,000 steps, 50 parts per step and 10,000 parts, else
//     `plan_too_large` (the server's own code, raised before anything is sent).
//
// 🔴 A PART IS SIZED AS THE UTF-8 BYTES OF THE EXACT BODY THAT WILL BE SENT,
// measured with TextEncoder. `string.length` counts UTF-16 code units: a path in
// Chinese or Arabic is two or three times its `.length` in bytes, and a part
// packed by `.length` sails past the server's 1 MiB reader as a 413 the retry
// policy cannot recover from. Each body is re-measured after it is built.
//
// 🔴 THE FINGERPRINT IS SHA-256 OVER THE CANONICAL ROWS OF EACH PART, THEN OVER
// THE ORDERED PART DIGESTS (crypto.subtle has no incremental digest). Rows are
// serialised with a fixed key order and sorted by client key, so the same file
// gives the same fingerprint on every run and in every browser — which is how a
// resumed upload proves it is the same file (M2-j), and how the server refuses
// a different file's batches on an existing import (M2-r).

import { ImportError } from '../errors'
import type { AggregateRows, PlanStep, PlanTotals, TableName } from '../types'
import { TABLES } from '../types'
import { addDays, monthEnd, monthStart } from './dates'

export interface PlanLimits {
  partRows: number
  partBytes: number
  steps: number
  partsPerStep: number
  parts: number
}

export const PLAN_LIMITS: Readonly<PlanLimits> = {
  partRows: 5_000,
  partBytes: 768 * 1024,
  steps: 5_000,
  partsPerStep: 50,
  parts: 10_000,
}

/** One batch, held by the worker until the orchestrator asks for it. */
export interface PlanPart {
  step: number
  part: number
  /** The canonical `rows` object, exactly as it appears inside the body. */
  rowsJson: string
  rows: number
}

export interface BuiltPlan {
  range_start: string
  range_end: string
  steps: PlanStep[]
  parts: PlanPart[]
  fingerprint: string
  totals: PlanTotals
}

const FINGERPRINT_PLACEHOLDER = '0'.repeat(64)

/** The exact body of batch (step, part): what is sized, and what is sent. */
export function batchBody(step: number, part: number, fingerprint: string, rowsJson: string): string {
  return `{"step":${step},"part":${part},"fingerprint":"${fingerprint}","rows":${rowsJson}}`
}

/** One row as it goes on the wire: M2-r's fields in M2-r's order, nothing else. */
export function serializeRow(table: TableName, row: AggregateRows[TableName][number]): string {
  switch (table) {
    case 'daily': {
      const r = row as AggregateRows['daily'][number]
      return JSON.stringify({
        date: r.date,
        visitors: r.visitors,
        visits: r.visits,
        pageviews: r.pageviews,
        src_bounces: r.src_bounces,
        src_engagement_seconds: r.src_engagement_seconds,
      })
    }
    case 'monthly': {
      const r = row as AggregateRows['monthly'][number]
      return JSON.stringify({ month: r.month, visitors: r.visitors, full_month: r.full_month })
    }
    case 'dimensions': {
      const r = row as AggregateRows['dimensions'][number]
      return JSON.stringify({
        date: r.date,
        dimension: r.dimension,
        parent: r.parent,
        value: r.value,
        visitors: r.visitors,
        visits: r.visits,
        pageviews: r.pageviews,
      })
    }
    case 'acquisition': {
      const r = row as AggregateRows['acquisition'][number]
      return JSON.stringify({
        date: r.date,
        referrer: r.referrer,
        utm_source: r.utm_source,
        utm_medium: r.utm_medium,
        utm_campaign: r.utm_campaign,
        src_source: r.src_source,
        src_medium: r.src_medium,
        src_campaign: r.src_campaign,
        src_channel_group: r.src_channel_group,
        visitors: r.visitors,
        visits: r.visits,
        pageviews: r.pageviews,
      })
    }
    case 'events': {
      const r = row as AggregateRows['events'][number]
      return JSON.stringify({ date: r.date, source_name: r.source_name, visitors: r.visitors, count: r.count })
    }
  }
}

const encoder = new TextEncoder()

/** UTF-8 byte length of `s` — never `s.length`, which counts UTF-16 code units. */
export function utf8Bytes(s: string): number {
  return encoder.encode(s).length
}

interface Row {
  table: TableName
  json: string
  bytes: number
}

/** A part being filled. Tracks its exact serialised size as rows are added. */
class PartBuffer {
  readonly tables: Record<TableName, Row[]> = { daily: [], monthly: [], dimensions: [], acquisition: [], events: [] }
  rows = 0
  private rowBytes: Record<TableName, number> = { daily: 0, monthly: 0, dimensions: 0, acquisition: 0, events: 0 }

  constructor(
    readonly step: number,
    readonly part: number,
  ) {}

  /** The body's size in bytes if `extra` rows were added. */
  sizeWith(extra: readonly Row[]): number {
    const counts: Record<TableName, number> = {
      daily: this.tables.daily.length,
      monthly: this.tables.monthly.length,
      dimensions: this.tables.dimensions.length,
      acquisition: this.tables.acquisition.length,
      events: this.tables.events.length,
    }
    const bytes = { ...this.rowBytes }
    for (const r of extra) {
      counts[r.table]++
      bytes[r.table] += r.bytes
    }
    // `{"daily":[a,b],"dimensions":[c]}`: braces, then per non-empty table its
    // quoted name, colon, brackets, the rows and the commas between them, and
    // the commas between tables. Every character here is ASCII.
    let size = 2
    let nonEmpty = 0
    for (const t of TABLES) {
      if (counts[t] === 0) continue
      nonEmpty++
      size += t.length + 2 + 1 + 2 + bytes[t] + (counts[t] - 1)
    }
    if (nonEmpty > 1) size += nonEmpty - 1
    return utf8Bytes(batchBody(this.step, this.part, FINGERPRINT_PLACEHOLDER, '')) + size
  }

  add(rows: readonly Row[]): void {
    for (const r of rows) {
      this.tables[r.table].push(r)
      this.rowBytes[r.table] += r.bytes
    }
    this.rows += rows.length
  }

  get empty(): boolean {
    return this.rows === 0
  }

  rowsJson(): string {
    const parts: string[] = []
    for (const t of TABLES) {
      const list = this.tables[t]
      if (list.length === 0) continue
      parts.push(`"${t}":[${list.map((r) => r.json).join(',')}]`)
    }
    return `{${parts.join(',')}}`
  }
}

function tooLarge(message: string, limit: number, observed: number): ImportError {
  return new ImportError('plan_too_large', message, { detail: { limit, observed } })
}

/**
 * Packs the rows into steps and parts and fingerprints them. `rows` must be
 * folded (one row per client key) and sorted — what AggregateBuilder.build()
 * and RawFolder.finish() return.
 */
export async function buildPlan(rows: AggregateRows, limits: PlanLimits = PLAN_LIMITS): Promise<BuiltPlan> {
  // The range is the days the rows actually cover.
  const dates: string[] = []
  for (const r of rows.daily) dates.push(r.date)
  for (const r of rows.dimensions) dates.push(r.date)
  for (const r of rows.acquisition) dates.push(r.date)
  for (const r of rows.events) dates.push(r.date)
  if (dates.length === 0) {
    throw new ImportError('no_data_in_range', 'There are no days to import in this file.')
  }
  let start = dates[0]
  let end = dates[0]
  for (const d of dates) {
    if (d < start) start = d
    if (d > end) end = d
  }

  const byDay = new Map<string, Row[]>()
  const place = (date: string, table: TableName, json: string) => {
    let list = byDay.get(date)
    if (!list) byDay.set(date, (list = []))
    list.push({ table, json, bytes: utf8Bytes(json) })
  }
  for (const r of rows.daily) place(r.date, 'daily', serializeRow('daily', r))
  // A month's row travels in the step holding the month's first in-range day (M2-r).
  for (const r of rows.monthly) {
    const first = monthStart(r.month) < start ? start : monthStart(r.month)
    if (first > end || monthEnd(r.month) < start) {
      throw new ImportError('no_data_in_range', `The file's month ${r.month} has no day inside the range it covers.`)
    }
    place(first, 'monthly', serializeRow('monthly', r))
  }
  for (const r of rows.dimensions) place(r.date, 'dimensions', serializeRow('dimensions', r))
  for (const r of rows.acquisition) place(r.date, 'acquisition', serializeRow('acquisition', r))
  // M12: placed last, and serialised last in each part (TABLES order), so a
  // plan with no events packs and fingerprints exactly as it did before them.
  for (const r of rows.events) place(r.date, 'events', serializeRow('events', r))

  const days = [...byDay.keys()].sort()
  const steps: PlanStep[] = []
  const parts: PlanPart[] = []
  let stepStart = start
  let current: PartBuffer | null = null
  let lastDay: string | null = null

  const closePart = (buf: PartBuffer) => {
    parts.push({ step: buf.step, part: buf.part, rowsJson: buf.rowsJson(), rows: buf.rows })
  }
  const closeStep = (endDay: string, partCount: number) => {
    steps.push({ start: stepStart, end: endDay, parts: partCount })
    stepStart = addDays(endDay, 1)
  }
  const fits = (buf: PartBuffer, extra: readonly Row[]) =>
    buf.rows + extra.length <= limits.partRows && buf.sizeWith(extra) <= limits.partBytes

  for (const day of days) {
    const dayRows = byDay.get(day) as Row[]
    if (current && fits(current, dayRows)) {
      current.add(dayRows)
      lastDay = day
      continue
    }
    if (current && lastDay) {
      closePart(current)
      closeStep(lastDay, 1)
      current = null
    }
    const stepIndex = steps.length
    const fresh = new PartBuffer(stepIndex, 0)
    if (fits(fresh, dayRows)) {
      fresh.add(dayRows)
      current = fresh
      lastDay = day
      continue
    }
    // The day alone overflows a part: it becomes its own step, split row by row.
    let buf = fresh
    for (const row of dayRows) {
      if (!fits(buf, [row])) {
        if (buf.empty) {
          throw tooLarge(`One row of ${day} is larger than a whole batch may be.`, limits.partBytes, row.bytes)
        }
        closePart(buf)
        buf = new PartBuffer(stepIndex, buf.part + 1)
      }
      buf.add([row])
    }
    closePart(buf)
    closeStep(day, buf.part + 1)
    lastDay = null
  }
  if (current) {
    closePart(current)
    closeStep(end, 1)
  } else if (steps.length > 0 && steps[steps.length - 1].end !== end) {
    // Unreachable (the last data day IS the range end), but a plan that does
    // not tile its range must never leave the browser.
    throw new ImportError('invalid_plan', 'The plan does not cover the whole range it declares.')
  }

  if (steps.length > limits.steps) {
    throw tooLarge(`This file needs ${steps.length} steps; an import may have at most ${limits.steps}.`, limits.steps, steps.length)
  }
  for (const s of steps) {
    if (s.parts > limits.partsPerStep) {
      throw tooLarge(`${s.start} needs ${s.parts} batches; a day may have at most ${limits.partsPerStep}.`, limits.partsPerStep, s.parts)
    }
  }
  if (parts.length > limits.parts) {
    throw tooLarge(`This file needs ${parts.length} batches; an import may have at most ${limits.parts}.`, limits.parts, parts.length)
  }

  const fingerprint = await fingerprintParts(parts)
  // Re-measure every body exactly as it will be sent. The packer's arithmetic
  // is checked against the real bytes, never trusted.
  for (const p of parts) {
    const bytes = utf8Bytes(batchBody(p.step, p.part, fingerprint, p.rowsJson))
    if (bytes > limits.partBytes) {
      throw tooLarge(`Batch ${p.step}/${p.part} came out at ${bytes} bytes.`, limits.partBytes, bytes)
    }
  }

  let visitors = 0
  let pageviews = 0
  for (const r of rows.daily) {
    visitors += r.visitors
    pageviews += r.pageviews
  }
  return {
    range_start: start,
    range_end: end,
    steps,
    parts,
    fingerprint,
    totals: {
      rows: {
        daily: rows.daily.length,
        monthly: rows.monthly.length,
        dimensions: rows.dimensions.length,
        acquisition: rows.acquisition.length,
        events: rows.events.length,
      },
      visitors,
      pageviews,
    },
  }
}

/** SHA-256 of each part's canonical rows, then SHA-256 of those digests in plan order; lowercase hex. */
export async function fingerprintParts(parts: readonly Pick<PlanPart, 'rowsJson'>[]): Promise<string> {
  const digests = new Uint8Array(parts.length * 32)
  for (let i = 0; i < parts.length; i++) {
    const d = await crypto.subtle.digest('SHA-256', encoder.encode(parts[i].rowsJson))
    digests.set(new Uint8Array(d), i * 32)
  }
  const all = new Uint8Array(await crypto.subtle.digest('SHA-256', digests))
  let hex = ''
  for (const b of all) hex += b.toString(16).padStart(2, '0')
  return hex
}
