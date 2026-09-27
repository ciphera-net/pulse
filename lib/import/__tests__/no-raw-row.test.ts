// @vitest-environment node
//
// M2-q, the frontend half of gate 4: NO RAW ROW CAN REACH PULSE. A built batch
// carries only M2-r's fields — no session, visit or visitor id, no uuid, no
// timestamp finer than a day — and none of the ids the source file held
// appears anywhere in it. The server holds the other half (a Go test of the
// batch types' JSON field sets, plus DisallowUnknownFields).
//
// Run over both kinds of source: a raw fold (the rows that DO carry session
// and visit ids, which must stop at the fold) and the reference aggregate
// source through the whole pipeline.
//
// The mutation this kills: any field added to a batch row, or any id leaking
// into a value.

import { describe, expect, it } from 'vitest'
import { RawFolder } from '../core/fold'
import { batchBody, buildPlan } from '../core/plan'
import { SkipLedger } from '../core/skipped'
import { runPipeline } from '../pipeline'
import { BATCH_FIELDS, TABLES, WIRE_FIELDS, type TableName } from '../types'
import { plausibleFixtureFile } from './fixtures/plausible-export'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const FORBIDDEN_KEY = /session|visit_?id|visitor_?id|uuid|event|timestamp|created_at|\bip\b|user_?agent|title|hostname/i

function uuid(n: number): string {
  const h = n.toString(16).padStart(12, '0')
  return `5a1d${h.slice(0, 4)}-0000-4000-8000-${h}`
}

/** Every key at every depth, and every string value, of a parsed body. */
function walk(v: unknown, keys: Set<string>, strings: string[]) {
  if (Array.isArray(v)) for (const x of v) walk(x, keys, strings)
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      keys.add(k)
      walk(x, keys, strings)
    }
  } else if (typeof v === 'string') strings.push(v)
}

function assertOnlyWireFields(body: string, ids: string[]) {
  const parsed = JSON.parse(body) as Record<string, unknown>
  expect(Object.keys(parsed)).toEqual([...BATCH_FIELDS])
  const rows = parsed.rows as Record<string, Record<string, unknown>[]>
  for (const [table, list] of Object.entries(rows)) {
    expect(TABLES).toContain(table)
    for (const row of list) expect(Object.keys(row)).toEqual([...WIRE_FIELDS[table as TableName]])
  }
  const keys = new Set<string>()
  const strings: string[] = []
  walk(parsed, keys, strings)
  for (const k of keys) expect(k, `key ${k}`).not.toMatch(FORBIDDEN_KEY)
  for (const s of strings) {
    if (s === parsed.fingerprint) continue
    expect(s).not.toMatch(UUID)
    // Dates are days, never instants.
    expect(s).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/)
  }
  for (const id of ids) expect(body.includes(id), `id ${id} leaked`).toBe(false)
}

describe('M2-q: no raw row in a batch', () => {
  it('a raw fold\'s batches carry no session, visit or visitor id, and no uuid', async () => {
    const f = new RawFolder({ timeZone: 'Europe/Brussels', clip: null, skipped: new SkipLedger() })
    const ids: string[] = []
    for (let i = 0; i < 400; i++) {
      const visitor = uuid(i % 150)
      const visit = uuid(10_000 + (i % 220))
      ids.push(visitor, visit)
      f.add({
        at: Date.parse('2026-03-01T08:00:00Z') + i * 97_000,
        visitor,
        visit,
        page: `/p/${i % 13}`,
        acquisition: {
          referrer: 'news.example',
          utm_source: 'mail',
          utm_medium: null,
          utm_campaign: null,
          src_source: 'news.example',
          src_medium: '',
          src_campaign: '',
          src_channel_group: '',
        },
        dimensions: { country: 'BE', device: 'Desktop', browser: 'Firefox', os: 'Mac', language: 'nl-BE', screen_resolution: '1920x1080' },
        file: 'events.csv',
        line: i + 2,
      })
    }
    const plan = await buildPlan(f.finish(), { partRows: 10, partBytes: 768 * 1024, steps: 5000, partsPerStep: 50, parts: 10_000 })
    expect(plan.parts.length).toBeGreaterThan(1)
    for (const p of plan.parts) assertOnlyWireFields(batchBody(p.step, p.part, plan.fingerprint, p.rowsJson), ids)
  })

  it('the reference source\'s batches carry only the wire fields too', async () => {
    const { summary, parts } = await runPipeline({ source: 'plausible', file: plausibleFixtureFile(), clip: null, timeZone: 'UTC' })
    // The fixture's hostnames and referrer URLs are read from the file and must stop at the fold.
    const inFile = ['example.com', 'blog.example.com', 'https://www.google.com/']
    for (const p of parts) assertOnlyWireFields(batchBody(p.step, p.part, summary.fingerprint, p.rowsJson), inFile)
  })
})
