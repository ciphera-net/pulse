// @vitest-environment node
//
// The planner, gate 5 (§3.12b): steps tile the range, parts stay inside BOTH
// caps (5,000 rows and 768 KiB of UTF-8, measured on the exact body), the plan
// caps hold, and the fingerprint is stable and is SHA-256 over the ordered
// per-part digests.
//
// Mutations these kill:
//   - sizing a part by `string.length` (the CJK case packs past the byte cap);
//   - a fingerprint over anything but the ordered part digests (it is
//     recomputed here, independently, with node:crypto);
//   - steps that leave a gap or overlap.

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ImportError } from '../../errors'
import type { AggregateRows, DimensionRow } from '../../types'
import { sortRows } from '../aggregate'
import { addDays } from '../dates'
import { PLAN_LIMITS, batchBody, buildPlan, utf8Bytes, type PlanLimits } from '../plan'

function rows(over: Partial<AggregateRows> = {}): AggregateRows {
  const r: AggregateRows = { daily: [], monthly: [], dimensions: [], acquisition: [], ...over }
  sortRows(r)
  return r
}

function daily(date: string, visitors = 1) {
  return { date, visitors, visits: visitors, pageviews: visitors, src_bounces: null, src_engagement_seconds: null }
}

function page(date: string, value: string, visitors = 1): DimensionRow {
  return { date, dimension: 'page', parent: '', value, visitors, visits: visitors, pageviews: visitors }
}

const limits = (over: Partial<PlanLimits>): PlanLimits => ({ ...PLAN_LIMITS, ...over })

async function failure(p: Promise<unknown>): Promise<ImportError> {
  try {
    await p
  } catch (e) {
    if (e instanceof ImportError) return e
    throw e
  }
  throw new Error('expected the plan to fail')
}

function assertTiles(plan: Awaited<ReturnType<typeof buildPlan>>) {
  expect(plan.steps[0].start).toBe(plan.range_start)
  expect(plan.steps.at(-1)?.end).toBe(plan.range_end)
  for (let i = 1; i < plan.steps.length; i++) {
    expect(plan.steps[i].start, `step ${i}`).toBe(addDays(plan.steps[i - 1].end, 1))
  }
  for (const s of plan.steps) {
    expect(s.start <= s.end).toBe(true)
    expect(s.parts).toBeGreaterThanOrEqual(1)
  }
  // The parts are exactly (step, 0…parts-1), in order.
  const expected = plan.steps.flatMap((s, i) => Array.from({ length: s.parts }, (_, p) => `${i}/${p}`))
  expect(plan.parts.map((p) => `${p.step}/${p.part}`)).toEqual(expected)
}

describe('buildPlan: steps and parts', () => {
  it('uses the spec caps', () => {
    expect(PLAN_LIMITS).toEqual({ partRows: 5000, partBytes: 768 * 1024, steps: 5000, partsPerStep: 50, parts: 10000 })
  })

  it('puts a small file in one step of one part covering the days its rows cover', async () => {
    const plan = await buildPlan(rows({ daily: [daily('2026-03-01'), daily('2026-03-03')], dimensions: [page('2026-03-02', '/')] }))
    expect(plan.range_start).toBe('2026-03-01')
    expect(plan.range_end).toBe('2026-03-03')
    expect(plan.steps).toEqual([{ start: '2026-03-01', end: '2026-03-03', parts: 1 }])
    expect(plan.totals).toEqual({ rows: { daily: 2, monthly: 0, dimensions: 1, acquisition: 0 }, visitors: 2, pageviews: 2 })
  })

  it('tiles the range with no gap and no overlap, across days with no data', async () => {
    const d: ReturnType<typeof daily>[] = []
    for (let i = 0; i < 60; i += 3) d.push(daily(addDays('2026-01-01', i)))
    const plan = await buildPlan(rows({ daily: d }), limits({ partRows: 4 }))
    expect(plan.steps.length).toBeGreaterThan(3)
    assertTiles(plan)
  })

  it('splits a day too big for one part into a step of its own, never a day across two steps', async () => {
    const dims: DimensionRow[] = []
    for (let i = 0; i < 25; i++) dims.push(page('2026-03-02', `/p${String(i).padStart(2, '0')}`))
    const plan = await buildPlan(
      rows({ daily: [daily('2026-03-01'), daily('2026-03-02'), daily('2026-03-03')], dimensions: dims }),
      limits({ partRows: 10 }),
    )
    assertTiles(plan)
    const big = plan.steps.find((s) => s.start <= '2026-03-02' && s.end >= '2026-03-02')
    expect(big).toEqual({ start: '2026-03-02', end: '2026-03-02', parts: 3 })
    for (const p of plan.parts) expect(p.rows).toBeLessThanOrEqual(10)
    // Every row went out exactly once.
    expect(plan.parts.reduce((n, p) => n + p.rows, 0)).toBe(3 + 25)
  })

  it('keeps every body within the byte cap measured in UTF-8, not in string length', async () => {
    // Paths of 3-byte characters: `.length` counts a third of their bytes.
    const dims: DimensionRow[] = []
    for (let i = 0; i < 200; i++) dims.push(page('2026-03-01', `/${'中'.repeat(40)}/${i}`))
    const cap = 4096
    const plan = await buildPlan(rows({ dimensions: dims }), limits({ partBytes: cap }))
    let multiByte = false
    for (const p of plan.parts) {
      const body = batchBody(p.step, p.part, plan.fingerprint, p.rowsJson)
      const bytes = new TextEncoder().encode(body).length
      expect(bytes).toBeLessThanOrEqual(cap)
      if (bytes > body.length * 1.5) multiByte = true
    }
    expect(multiByte).toBe(true)
    expect(plan.parts.length).toBeGreaterThan(5)
  })

  it('packs parts tightly: the next row would not have fitted', async () => {
    const dims: DimensionRow[] = []
    for (let i = 0; i < 300; i++) dims.push(page('2026-03-01', `/page/${i}/${'x'.repeat(i % 50)}`))
    const cap = 8192
    const plan = await buildPlan(rows({ dimensions: dims }), limits({ partBytes: cap }))
    const parsed = plan.parts.map((p) => JSON.parse(p.rowsJson) as { dimensions: unknown[] })
    for (let i = 0; i + 1 < plan.parts.length; i++) {
      const p = plan.parts[i]
      const next = JSON.stringify(parsed[i + 1].dimensions[0])
      const withNext = utf8Bytes(batchBody(p.step, p.part, plan.fingerprint, p.rowsJson)) + 1 + utf8Bytes(next)
      expect(withNext, `part ${i}`).toBeGreaterThan(cap)
    }
  })

  it('places a month\'s row in the step holding the month\'s first day in range', async () => {
    const plan = await buildPlan(
      rows({
        daily: [daily('2026-02-20'), daily('2026-03-01'), daily('2026-03-31')],
        monthly: [{ month: '2026-03-01', visitors: 9, full_month: true }],
      }),
      limits({ partRows: 1 }),
    )
    const holder = plan.parts.find((p) => p.rowsJson.includes('"monthly"'))
    const step = plan.steps[holder?.step ?? -1]
    expect(step.start <= '2026-03-01' && step.end >= '2026-03-01').toBe(true)
  })

  it('refuses an empty set of rows as no_data_in_range', async () => {
    expect((await failure(buildPlan(rows()))).code).toBe('no_data_in_range')
  })
})

describe('buildPlan: plan caps', () => {
  it('refuses more steps than the cap', async () => {
    const d = Array.from({ length: 12 }, (_, i) => daily(addDays('2026-01-01', i)))
    const e = await failure(buildPlan(rows({ daily: d }), limits({ partRows: 1, steps: 10 })))
    expect(e.code).toBe('plan_too_large')
    expect(e.detail).toMatchObject({ limit: 10, observed: 12 })
  })

  it('refuses a day needing more parts than a step may have', async () => {
    const dims = Array.from({ length: 12 }, (_, i) => page('2026-03-01', `/p${i}`))
    const e = await failure(buildPlan(rows({ dimensions: dims }), limits({ partRows: 2, partsPerStep: 5 })))
    expect(e.code).toBe('plan_too_large')
    expect(e.detail.limit).toBe(5)
  })

  it('refuses more parts than a plan may have', async () => {
    const d = Array.from({ length: 12 }, (_, i) => daily(addDays('2026-01-01', i)))
    const e = await failure(buildPlan(rows({ daily: d }), limits({ partRows: 1, parts: 10 })))
    expect(e.code).toBe('plan_too_large')
  })

  it('refuses a single row bigger than a whole batch', async () => {
    const e = await failure(
      buildPlan(rows({ dimensions: [page('2026-03-01', '/' + 'a'.repeat(5000))] }), limits({ partBytes: 1024 })),
    )
    expect(e.code).toBe('plan_too_large')
  })
})

describe('buildPlan: the fingerprint', () => {
  const sample = () =>
    rows({
      daily: [daily('2026-03-01', 3), daily('2026-03-02', 4)],
      dimensions: Array.from({ length: 30 }, (_, i) => page(i < 15 ? '2026-03-01' : '2026-03-02', `/p${i}`, i + 1)),
    })

  it('is SHA-256 over the ordered SHA-256 digests of each part\'s canonical rows', async () => {
    const plan = await buildPlan(sample(), limits({ partRows: 7 }))
    expect(plan.parts.length).toBeGreaterThan(2)
    const outer = createHash('sha256')
    for (const p of plan.parts) outer.update(createHash('sha256').update(p.rowsJson, 'utf8').digest())
    expect(plan.fingerprint).toBe(outer.digest('hex'))
    expect(plan.fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is the same on every run for the same rows', async () => {
    const a = await buildPlan(sample())
    const b = await buildPlan(sample())
    expect(b.fingerprint).toBe(a.fingerprint)
    expect(b.parts.map((p) => p.rowsJson)).toEqual(a.parts.map((p) => p.rowsJson))
  })

  it('changes when any count changes', async () => {
    const a = await buildPlan(sample())
    const changed = sample()
    changed.dimensions[7] = { ...changed.dimensions[7], pageviews: (changed.dimensions[7].pageviews ?? 0) + 1 }
    expect((await buildPlan(changed)).fingerprint).not.toBe(a.fingerprint)
  })

  it('is carried by every body, and each body is exactly what was sized', async () => {
    const plan = await buildPlan(sample(), limits({ partRows: 7 }))
    for (const p of plan.parts) {
      const body = JSON.parse(batchBody(p.step, p.part, plan.fingerprint, p.rowsJson))
      expect(Object.keys(body)).toEqual(['step', 'part', 'fingerprint', 'rows'])
      expect(body.fingerprint).toBe(plan.fingerprint)
      expect([body.step, body.part]).toEqual([p.step, p.part])
    }
  })
})
