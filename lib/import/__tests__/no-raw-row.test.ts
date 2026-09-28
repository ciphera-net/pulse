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
//
// 🔑 M12 (§3.12m12 M12-k): the batch gained a fifth table, `events`, which is
// an AGGREGATE (a source label and a count per day), not an event. The key ban
// below matches "event" anywhere, so it is narrowed deliberately and exactly:
// the literal key `events` is allowed as a TABLE name directly under `rows`,
// and nowhere else. A row's own keys, a nested key, `event_id`, `event_type`,
// `event_name`, `raw_events`: all still fail, and a case below proves it.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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

/**
 * The one exception to FORBIDDEN_KEY: the aggregate `events` table's own name,
 * and only where a table name sits (a key of `rows`). Everything under it is
 * walked like every other table.
 */
const AGGREGATE_TABLE_KEYS: ReadonlySet<string> = new Set(['events'])

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
  // The top level and each table name, checked here; everything below a table walked.
  for (const k of Object.keys(parsed)) keys.add(k)
  for (const [table, list] of Object.entries(rows)) {
    if (!AGGREGATE_TABLE_KEYS.has(table)) keys.add(table)
    walk(list, keys, strings)
  }
  for (const [k, v] of Object.entries(parsed)) if (k !== 'rows') walk(v, keys, strings)
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
  it('still refuses every other "event" key: the narrowing admits exactly the aggregate table\'s name (M12-k)', () => {
    const fp = 'a'.repeat(64)
    const ok = batchBody(0, 0, fp, '{"events":[{"date":"2026-03-01","source_name":"Signup","visitors":1,"count":1}]}')
    expect(() => assertOnlyWireFields(ok, [])).not.toThrow()
    // A raw event row: an extra key inside the aggregate table.
    const withId = batchBody(0, 0, fp, '{"events":[{"date":"2026-03-01","source_name":"Signup","visitors":1,"count":1,"event_id":"x"}]}')
    expect(() => assertOnlyWireFields(withId, [])).toThrow()
    // A table that is not one of the five, whatever it is named.
    for (const table of ['raw_events', 'event', 'events_raw']) {
      const other = batchBody(0, 0, fp, `{"${table}":[{"date":"2026-03-01"}]}`)
      expect(() => assertOnlyWireFields(other, []), table).toThrow()
    }
    // "events" as a key anywhere below a table name is still banned.
    expect(() => {
      const keys = new Set<string>()
      walk([{ events: 1 }], keys, [])
      for (const k of keys) expect(k).not.toMatch(FORBIDDEN_KEY)
    }).toThrow()
    // A timestamp finer than a day, even inside the aggregate table, is still refused.
    const instant = batchBody(0, 0, fp, '{"events":[{"date":"2026-03-01T09:00:00Z","source_name":"Signup","visitors":1,"count":1}]}')
    expect(() => assertOnlyWireFields(instant, [])).toThrow()
  })

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

  it('the raw source\'s batches carry none of its real export\'s ids or hosts, and its event names only as an aggregate label (M8, M12)', async () => {
    // The published query's output from a real self-hosted instance: every row
    // carries a session id and a visit id (uuids) and a hostname. All of it
    // must stop at the fold. Custom events carry their names, which since M12
    // travel as `events[].source_name` (a label per day and a count) and in no
    // other place.
    const csv = readFileSync(fileURLToPath(new URL('../sources/__tests__/fixtures/umami-published-query.csv', import.meta.url)), 'utf8')
    const [header, ...lines] = csv.trim().split('\n')
    const columns = header.split(',')
    const inFile = new Set<string>()
    const names = new Set<string>()
    for (const line of lines) {
      const f = line.split(',')
      for (const c of ['session_id', 'visit_id', 'hostname']) if (f[columns.indexOf(c)]) inFile.add(f[columns.indexOf(c)])
      const name = f[columns.indexOf('event_name')]
      if (name) names.add(name)
    }
    expect(inFile.size).toBeGreaterThan(30)
    expect(names.size).toBe(4)
    const file = new File([csv], 'umami-export.csv')
    const { summary, parts } = await runPipeline({ source: 'umami', files: [file], clip: null, timeZone: 'UTC', siteDomain: null, events: true })
    expect(parts.length).toBeGreaterThan(0)
    const labels: string[] = []
    for (const p of parts) {
      assertOnlyWireFields(batchBody(p.step, p.part, summary.fingerprint, p.rowsJson), [...inFile])
      const rows = JSON.parse(p.rowsJson) as Record<string, Record<string, unknown>[]>
      for (const [table, list] of Object.entries(rows)) {
        for (const row of list) {
          for (const [k, v] of Object.entries(row)) {
            if (typeof v === 'string' && names.has(v)) expect(`${table}.${k}`).toBe('events.source_name')
          }
          if (table === 'events') labels.push(row.source_name as string)
        }
      }
    }
    expect(labels.sort()).toEqual([...names].sort())
  })

  it('the reference source\'s batches carry only the wire fields too', async () => {
    const { summary, parts } = await runPipeline({ source: 'plausible', files: [plausibleFixtureFile()], clip: null, timeZone: 'UTC', siteDomain: null, events: true })
    // The fixture's hostnames and referrer URLs are read from the file and must stop at the fold.
    const inFile = ['example.com', 'blog.example.com', 'https://www.google.com/']
    for (const p of parts) assertOnlyWireFields(batchBody(p.step, p.part, summary.fingerprint, p.rowsJson), inFile)
  })
})
