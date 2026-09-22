import { describe, expect, it } from 'vitest'
import {
  DASHBOARD_REALTIME_MINUTES,
  DASHBOARD_REALTIME_PRESETS,
  DASHBOARD_ROLLING_MINUTES,
  isRealtimePeriod,
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
