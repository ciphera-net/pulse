// An in-memory import API that implements the M2-r wire contract STRICTLY, as
// a Transport. Every request body is checked field for field (unknown fields
// refused, like the server's DisallowUnknownFields), the cursor rules are the
// server's (apply at the cursor, `already_applied` below it, 409 above it),
// and the tiling, fingerprint, window and cap checks are M2-r's. So a test
// that passes against it has exercised the client's side of the real contract,
// and a client that drifted from the contract fails here first.
//
// Faults can be injected per request: answer with anything, or apply the
// request and then LOSE the response (the timeout-after-commit case that makes
// exactly-once matter).

import type { Transport, TransportRequest, TransportResponse } from '../../client'
import { addDays } from '../../core/dates'
import { DIMENSIONS, WIRE_FIELDS, type ImportStatus, type TableName } from '../../types'

export type Fault = { respond: TransportResponse } | { dropResponse: true }

interface Stored {
  id: string
  siteId: string
  source: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  error_code: string | null
  source_timezone: string
  range_start: string
  range_end: string
  plan: { start: string; end: string; parts: number }[]
  cursor: { step: number; part: number }
  fingerprint: string
  totals: unknown
  browserSkipped: Record<string, number>
  serverSkipped: Record<string, number>
  visits_are_visitors: boolean
  rows: Record<TableName, Record<string, unknown>[]>
  created_at: string
  started_at: string | null
  progressed_at: string | null
  finished_at: string | null
}

const CREATE_FIELDS = [
  'source',
  'source_timezone',
  'range_start',
  'range_end',
  'plan',
  'fingerprint',
  'totals',
  'skipped',
  'visits_are_visitors',
]

const json = (status: number, body: unknown): TransportResponse => ({ status, body, retryAfterSeconds: null })
const err = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  json(status, { error: `fake: ${code}`, code, ...extra })

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const isCount = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1_000_000_000
const sameKeys = (o: Record<string, unknown>, keys: readonly string[]) => {
  const k = Object.keys(o)
  return k.length === keys.length && keys.every((x) => k.includes(x))
}

export class FakeImportServer {
  siteId = 'site-1'
  siteTimezone = 'Europe/Brussels'
  /** The upload window's additive `site_domain` (M9-j'); null omits the field entirely, as an older server would. */
  siteDomain: string | null = 'example.com'
  allowedFrom: string | null = '2025-01-01'
  allowedThrough: string | null = '2026-09-26'
  /** Skip counts the server "drops" from each applied batch, to exercise the server skip report. */
  skipPerBatch: Record<string, number> = {}
  readonly requests: TransportRequest[] = []
  readonly imports = new Map<string, Stored>()
  /** Called before each request is handled; return a fault to inject one. */
  fault: ((req: TransportRequest, index: number) => Fault | null) | null = null
  private nextId = 1

  readonly transport: Transport = async (req) => {
    const index = this.requests.length
    this.requests.push(req)
    const f = this.fault?.(req, index) ?? null
    if (f && 'respond' in f) return f.respond
    const res = this.handle(req)
    if (f && 'dropResponse' in f) return { status: 0, body: null, retryAfterSeconds: null }
    return res
  }

  /** The one import on the site that is not cancelled, if any. */
  live(): Stored | null {
    for (const i of this.imports.values()) if (i.siteId === this.siteId && i.status !== 'cancelled') return i
    return null
  }

  statusOf(i: Stored): ImportStatus {
    return {
      id: i.id,
      source: i.source,
      kind: 'upload_aggregate',
      status: i.status,
      error_code: i.error_code,
      source_timezone: i.source_timezone,
      range_start: i.range_start,
      range_end: i.range_end,
      steps_total: i.plan.length,
      cursor: { ...i.cursor },
      fingerprint: i.fingerprint,
      totals: i.totals,
      skipped: { browser: { ...i.browserSkipped }, server: { ...i.serverSkipped } },
      visits_are_visitors: i.visits_are_visitors,
      import_through: i.status === 'completed' ? i.range_end : null,
      created_at: i.created_at,
      started_at: i.started_at,
      progressed_at: i.progressed_at,
      finished_at: i.finished_at,
    }
  }

  private handle(req: TransportRequest): TransportResponse {
    const [path, query] = req.path.split('?')
    const m = /^\/sites\/([^/]+)\/data-imports(?:\/([^/]+))?(?:\/(batches))?$/.exec(path)
    if (!m) return err(404, 'not_found')
    const site = decodeURIComponent(m[1])
    if (site !== this.siteId) return err(404, 'not_found')
    const sub = m[2] ? decodeURIComponent(m[2]) : null

    if (req.method === 'GET' && sub === 'upload-window') return this.window(new URLSearchParams(query))
    if (req.method === 'POST' && sub === null && !m[3]) return this.create(req.body)
    const imp = sub ? this.imports.get(sub) : undefined
    if (!imp || imp.siteId !== site || imp.status === 'cancelled') return err(404, 'not_found')
    if (req.method === 'POST' && m[3]) return this.batch(imp, req.body)
    if (req.method === 'GET' && !m[3]) return json(200, this.statusOf(imp))
    if (req.method === 'DELETE' && !m[3]) {
      imp.status = 'cancelled'
      return { status: 204, body: null, retryAfterSeconds: null }
    }
    return err(404, 'not_found')
  }

  private window(q: URLSearchParams): TransportResponse {
    const source = q.get('source')
    if (source !== 'plausible') return err(422, 'source_not_enabled')
    const tz = q.get('source_timezone') ?? this.siteTimezone
    const live = this.live()
    return json(200, {
      source,
      kind: 'upload_aggregate',
      site_timezone: this.siteTimezone,
      source_timezone: tz,
      allowed_from: this.allowedFrom,
      allowed_through: this.allowedThrough,
      collect: { page_paths: true, referrers: true, device_info: true, geo_data: 'full', screen_resolution: true, audience_data: true },
      existing_import: live ? this.statusOf(live) : null,
      // Additive (M9-j'); `siteDomain === null` omits the key entirely, as an
      // older server that hasn't shipped the field yet would.
      ...(this.siteDomain !== null ? { site_domain: this.siteDomain } : {}),
    })
  }

  private create(raw: string | null): TransportResponse {
    let b: Record<string, unknown>
    try {
      b = JSON.parse(raw ?? '')
    } catch {
      return err(400, 'invalid_plan')
    }
    if (!sameKeys(b, CREATE_FIELDS)) return err(400, 'invalid_plan')
    if (b.source !== 'plausible') return err(422, 'source_not_enabled')
    const live = this.live()
    if (live) return err(409, 'import_exists', { import_id: live.id })
    if (!isDate(b.range_start) || !isDate(b.range_end) || typeof b.fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(b.fingerprint)) {
      return err(400, 'invalid_plan')
    }
    const skipped = b.skipped as Record<string, unknown>
    if (typeof skipped !== 'object' || skipped === null || Object.keys(skipped).length > 32) return err(400, 'invalid_plan')
    for (const [k, v] of Object.entries(skipped)) if (!/^[a-z_]{1,40}$/.test(k) || !isCount(v)) return err(400, 'invalid_plan')
    const plan = b.plan as { start: string; end: string; parts: number }[]
    if (!Array.isArray(plan) || plan.length === 0) return err(400, 'invalid_plan')
    if (plan.length > 5000 || plan.reduce((n, s) => n + s.parts, 0) > 10000) return err(422, 'plan_too_large')
    let expect = b.range_start
    for (const s of plan) {
      if (!sameKeys(s as unknown as Record<string, unknown>, ['start', 'end', 'parts'])) return err(400, 'invalid_plan')
      if (s.start !== expect || !isDate(s.end) || s.end < s.start || !Number.isInteger(s.parts) || s.parts < 1) return err(400, 'invalid_plan')
      if (s.parts > 50) return err(422, 'plan_too_large')
      expect = addDays(s.end, 1)
    }
    if (plan[plan.length - 1].end !== b.range_end) return err(400, 'invalid_plan')
    if (this.allowedFrom === null || this.allowedThrough === null || b.range_start < this.allowedFrom || b.range_end > this.allowedThrough) {
      return err(422, 'range_outside_window', { allowed_from: this.allowedFrom, allowed_through: this.allowedThrough })
    }
    const id = `imp-${this.nextId++}`
    const stored: Stored = {
      id,
      siteId: this.siteId,
      source: b.source as string,
      status: 'pending',
      error_code: null,
      source_timezone: b.source_timezone as string,
      range_start: b.range_start,
      range_end: b.range_end,
      plan,
      cursor: { step: 0, part: 0 },
      fingerprint: b.fingerprint,
      totals: b.totals,
      browserSkipped: skipped as Record<string, number>,
      serverSkipped: {},
      visits_are_visitors: b.visits_are_visitors === true,
      rows: { daily: [], monthly: [], dimensions: [], acquisition: [] },
      created_at: '2026-09-27T00:00:00Z',
      started_at: null,
      progressed_at: null,
      finished_at: null,
    }
    this.imports.set(id, stored)
    return json(201, this.statusOf(stored))
  }

  private batch(imp: Stored, raw: string | null): TransportResponse {
    if (new TextEncoder().encode(raw ?? '').length > 1024 * 1024) return err(413, 'batch_too_large')
    let b: Record<string, unknown>
    try {
      b = JSON.parse(raw ?? '')
    } catch {
      return err(400, 'invalid_batch')
    }
    if (!sameKeys(b, ['step', 'part', 'fingerprint', 'rows'])) return err(400, 'invalid_batch')
    if (b.fingerprint !== imp.fingerprint) return err(409, 'plan_mismatch')
    if (imp.status === 'failed' && imp.error_code !== 'upload_abandoned') return err(409, 'import_not_active')
    const step = b.step as number
    const part = b.part as number
    const c = imp.cursor
    const next = () => (imp.cursor.step >= imp.plan.length ? null : { ...imp.cursor })
    if (imp.status === 'completed' || step < c.step || (step === c.step && part < c.part)) {
      return json(200, { already_applied: true, next: next(), status: imp.status })
    }
    if (step !== c.step || part !== c.part) return err(409, 'batch_out_of_order', { expected: { ...c } })

    const rows = b.rows as Record<string, unknown>
    if (typeof rows !== 'object' || rows === null) return err(400, 'invalid_batch')
    let total = 0
    const window = imp.plan[step]
    const keys: Record<TableName, (r: Record<string, unknown>) => string> = {
      daily: (r) => String(r.date),
      monthly: (r) => String(r.month),
      dimensions: (r) => JSON.stringify([r.date, r.dimension, r.parent, r.value]),
      acquisition: (r) => JSON.stringify([r.date, r.referrer, r.src_source, r.src_medium, r.src_campaign]),
    }
    for (const [table, list] of Object.entries(rows)) {
      if (!(table in WIRE_FIELDS) || !Array.isArray(list)) return err(400, 'invalid_batch')
      total += list.length
      const seen = new Set<string>()
      for (let index = 0; index < list.length; index++) {
        const r = list[index] as Record<string, unknown>
        if (!sameKeys(r, WIRE_FIELDS[table as TableName])) return err(400, 'invalid_batch')
        for (const [k, v] of Object.entries(r)) {
          if (['visitors', 'visits', 'pageviews', 'src_bounces', 'src_engagement_seconds'].includes(k) && v !== null && !isCount(v)) {
            return err(400, 'invalid_batch')
          }
        }
        if (table === 'dimensions' && !(DIMENSIONS as readonly string[]).includes(r.dimension as string)) return err(400, 'invalid_batch')
        const date = table === 'monthly' ? null : r.date
        if (date !== null && (!isDate(date) || date < window.start || date > window.end)) {
          return err(422, 'row_outside_step', { table, index })
        }
        const k = keys[table as TableName](r)
        if (seen.has(k)) return err(422, 'duplicate_row', { table, index })
        seen.add(k)
      }
    }
    if (total > 5000) return err(413, 'batch_too_large')

    for (const [table, list] of Object.entries(rows)) imp.rows[table as TableName].push(...(list as Record<string, unknown>[]))
    for (const [k, n] of Object.entries(this.skipPerBatch)) imp.serverSkipped[k] = (imp.serverSkipped[k] ?? 0) + n
    if (imp.status === 'pending' || imp.status === 'failed') {
      imp.status = 'running'
      imp.error_code = null
      imp.started_at ??= '2026-09-27T00:00:01Z'
    }
    imp.progressed_at = '2026-09-27T00:00:02Z'
    imp.cursor = part + 1 < imp.plan[step].parts ? { step, part: part + 1 } : { step: step + 1, part: 0 }
    if (imp.cursor.step >= imp.plan.length) {
      imp.status = 'completed'
      imp.finished_at = '2026-09-27T00:00:03Z'
    }
    const count = (t: TableName) => (Array.isArray(rows[t]) ? (rows[t] as unknown[]).length : 0)
    return json(200, {
      applied: { daily: count('daily'), monthly: count('monthly'), dimensions: count('dimensions'), acquisition: count('acquisition') },
      skipped: { ...this.skipPerBatch },
      next: next(),
      status: imp.status,
    })
  }
}
