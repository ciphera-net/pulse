import { describe, expect, it } from 'vitest'
import {
  DASHBOARD_EPHEMERAL_PERIODS,
  DASHBOARD_REALTIME_MINUTES,
  DASHBOARD_REALTIME_PRESETS,
  DASHBOARD_ROLLING_MINUTES,
  isRealtimePeriod,
  periodOnLeavingRealtime,
} from '../realtimeRange'
import { PERIODS, type Period } from '@/lib/hooks/periodUrl'
import { PERIOD_PRESETS } from '@/lib/constants/periods'

describe('the dashboard realtime window', () => {
  // * 🔴 A preset key outside the URL grammar makes the picker double-write period AND a
  // * custom range; the second write clobbers the first, so the choice lands as
  // * ?period=custom and the label degrades to a raw date span. Silent, and it would look
  // * like the Realtime entry simply not working.
  it('is a first-class URL period', () => {
    expect(PERIODS.has('realtime' as Period)).toBe(true)
  })

  // * ...but NOT a global preset. The Period grammar is shared with funnels, search, CDN
  // * and uptime, none of which can serve a live window. A global entry would appear in
  // * their pickers and resolve to something they cannot honour.
  it('is not in the global preset list', () => {
    expect(PERIOD_PRESETS.some((p) => p.key === 'realtime')).toBe(false)
  })

  it('is declared as a page-scoped preset with a rolling window', () => {
    expect(DASHBOARD_REALTIME_PRESETS.presets.map((p) => p.key)).toEqual(['realtime'])
    expect(DASHBOARD_ROLLING_MINUTES.realtime).toBe(DASHBOARD_REALTIME_MINUTES)
  })

  // * The chart window and the orb's count answer DIFFERENT questions — "what happened in
  // * the last half hour" versus "who is here now" (the tracker's own five-minute presence
  // * window). Pinned so nobody later "fixes" them into agreement.
  it('is a thirty-minute window, distinct from the five-minute presence window', () => {
    expect(DASHBOARD_REALTIME_MINUTES).toBe(30)
    expect(DASHBOARD_REALTIME_MINUTES).not.toBe(5)
  })

  it('recognises only realtime as live', () => {
    expect(isRealtimePeriod('realtime')).toBe(true)
    for (const p of ['30m', '1h', '24h', 'today', '30', 'custom'] as Period[]) {
      expect(isRealtimePeriod(p)).toBe(false)
    }
  })
})

// ─── Leaving realtime returns you to where you were ──────────────────────────
//
// 🔴 Reported by the owner, 23-09-2026: "when clicking on the realtime visitor &
// then going out of that view, it goes back to 30 days... it should go back to
// the view the user was on."
//
// Glancing at the live view is a DETOUR. A detour that silently rewrites where
// you were is a bug — the reader loses their place and has to re-pick it.
//
// MUTATION CHECK: return `{ period: fallback }` unconditionally and the first
// three go red.
describe('leaving realtime', () => {
  it('returns to the view the reader was on', () => {
    expect(periodOnLeavingRealtime({ period: '7' }, '30', '30')).toEqual({ period: '7' })
  })

  // * A custom span is not identified by its token: restoring 'custom' without
  // * its dates sends the reader to a differently-dated window under the same
  // * label, which is worse than the bug being fixed because it looks right.
  it('carries the dates back for a custom span', () => {
    const range = { start: '2026-09-01', end: '2026-09-15' }
    expect(periodOnLeavingRealtime({ period: 'custom', range }, '30', '30'))
      .toEqual({ period: 'custom', range })
  })

  // * No session history: the tab opened straight onto ?period=realtime, or was
  // * reloaded while live. Falling back to this page's own stored preference is
  // * the closest honest answer — and for a recipient of a shared live link it
  // * is the RIGHT answer, since the sender's history is none of their business.
  it('falls back to the reader own remembered view', () => {
    expect(periodOnLeavingRealtime(null, '7', '30')).toEqual({ period: '7' })
  })

  it('falls back to the default when nothing is remembered', () => {
    expect(periodOnLeavingRealtime(null, null, '30')).toEqual({ period: '30' })
  })

  // * Defence in depth. realtime is declared ephemeral so it should never be in
  // * memory at all — but if that guard ever broke, returning it here would put
  // * the reader back into the view they were trying to leave, and the control
  // * would look broken rather than the storage.
  it('never restores realtime itself', () => {
    expect(periodOnLeavingRealtime(null, 'realtime', '30')).toEqual({ period: '30' })
  })

  it('declares realtime ephemeral so it is never stored as a view', () => {
    expect(DASHBOARD_EPHEMERAL_PERIODS).toContain('realtime')
  })
})
