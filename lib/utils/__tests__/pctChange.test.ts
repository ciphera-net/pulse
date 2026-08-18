import { describe, it, expect } from 'vitest'
import { pctChange, guardedPctChange, guardedPointChange } from '../pctChange'

describe('pctChange', () => {
  it('returns null when both are zero', () => {
    expect(pctChange(0, 0)).toBeNull()
  })

  it('returns "new" when previous is zero and current is not', () => {
    expect(pctChange(5, 0)).toEqual({ type: 'new' })
  })

  it('computes rounded percentage change', () => {
    expect(pctChange(150, 100)).toEqual({ type: 'pct', value: 50 })
    expect(pctChange(50, 100)).toEqual({ type: 'pct', value: -50 })
    expect(pctChange(101, 300)).toEqual({ type: 'pct', value: -66 })
  })
})

describe('guardedPctChange', () => {
  it('suppresses the badge below the minimum base', () => {
    // 1 → 3 visitors is "↑200%" — noise, not signal
    expect(guardedPctChange(3, 1, 1)).toBeNull()
    expect(guardedPctChange(90, 9, 9)).toBeNull()
  })

  it('passes through at or above the minimum base', () => {
    expect(guardedPctChange(20, 10, 10)).toEqual({ type: 'pct', value: 100 })
    expect(guardedPctChange(50, 100, 100)).toEqual({ type: 'pct', value: -50 })
  })

  it('suppresses "new" badges on an insufficient base', () => {
    // previous metric 0 but the whole window had < minBase visitors
    expect(guardedPctChange(5, 0, 3)).toBeNull()
  })

  it('respects a custom minimum base', () => {
    expect(guardedPctChange(3, 1, 5, 5)).toEqual({ type: 'pct', value: 200 })
    expect(guardedPctChange(3, 1, 4, 5)).toBeNull()
  })

  it('still returns null when both values are zero on a big base', () => {
    expect(guardedPctChange(0, 0, 100)).toBeNull()
  })
})

describe('guardedPointChange', () => {
  // The rate-delta helper the dashboard's bounce-rate tile now rides (F4):
  // a rate moves in percentage POINTS. Until 18-08-2026 this had no tests at
  // all — the review round flagged that a regression in it would ship silently.

  it('returns the delta in points, rounded to one decimal', () => {
    expect(guardedPointChange(25, 20, 100)).toEqual({ type: 'pp', value: 5 })
    expect(guardedPointChange(20, 25, 100)).toEqual({ type: 'pp', value: -5 })
    expect(guardedPointChange(20.55, 20.4, 100)).toEqual({ type: 'pp', value: 0.2 })
  })

  it('suppresses the badge below the minimum base', () => {
    expect(guardedPointChange(100, 0, 9)).toBeNull()
  })

  it('returns null (not "new") when nothing moved or the base is a rate appearing from nowhere', () => {
    expect(guardedPointChange(20, 20, 100)).toBeNull()
    // sub-0.05 movement rounds to 0 and must not render a "↑0pp" badge
    expect(guardedPointChange(20.04, 20, 100)).toBeNull()
  })
})

describe('dashboard F4 wiring', () => {
  // The F4 fix is one argument: the previous-period useStats call must carry
  // the SAME filters as the current period — omitting it compared a filtered
  // current window against an unfiltered previous one (a true +13% rendered
  // −46% red). There is no test harness for the page component, so this pins
  // the wiring at the source level: narrow, and honest about what it checks —
  // the argument's presence, which is exactly what a future miscopy drops.
  it('prevStats carries filtersParam', async () => {
    const fs = await import('node:fs')
    const src = fs.readFileSync('app/sites/[id]/page.tsx', 'utf8')
    const call = src.match(/const \{ data: prevStats \} = useStats\(([^)]*)\)/)
    expect(call, 'prevStats useStats call not found').not.toBeNull()
    expect(call![1]).toContain('filtersParam')
  })
})
