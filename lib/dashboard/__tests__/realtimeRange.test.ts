import { describe, expect, it } from 'vitest'
import {
  DASHBOARD_REALTIME_MINUTES,
  REALTIME_EMPTY_LINE,
  REALTIME_MODES,
  REALTIME_ROLLING_MINUTES,
  isRealtimePeriod,
  periodOnLeavingRealtime,
} from '../realtimeRange'
import { PERIODS, type Period } from '@/lib/hooks/periodUrl'
import { PERIOD_PRESETS } from '@/lib/constants/periods'

describe('the realtime window', () => {
  // * Owner, 25-09-2026, after seeing it beside the orb's own count: "the orb should show
  // * last 5 min & also the realtime should show 5 mins." 5 is also the API's floor
  // * (pulse-backend utils_extra.go liveWindowMin) — the orb and the view agree on purpose,
  // * so nobody later "fixes" them apart again.
  it('is five minutes, matching the API floor', () => {
    expect(DASHBOARD_REALTIME_MINUTES).toBe(5)
  })

  it('is a first-class URL period', () => {
    expect(PERIODS.has('realtime' as Period)).toBe(true)
  })

  // * The orb is the only way in (owner decision 25-09-2026) — realtime is never a row in
  // * the switcher's twelve, so it must not appear in the shared preset list either.
  it('is not a switcher row', () => {
    expect(PERIOD_PRESETS.some((p) => p.key === 'realtime')).toBe(false)
  })

  it('declares its rolling width, and nothing else', () => {
    expect(REALTIME_ROLLING_MINUTES).toEqual({ realtime: 5 })
  })

  it('recognises only realtime as live', () => {
    expect(isRealtimePeriod('realtime')).toBe(true)
    for (const p of ['30', '7', 'today', 'custom', 'all'] as Period[]) {
      expect(isRealtimePeriod(p)).toBe(false)
    }
  })

  // * Realtime is a MODE, not a view somebody picked for next time (fixed 23-09-2026 —
  // * it used to be written to memory, so a later visit could open live with nobody
  // * asking). REALTIME_MODES is the one set every page's memory gate reads.
  it('is the whole set of live modes', () => {
    expect(REALTIME_MODES).toEqual(['realtime'])
  })

  it("says what an empty window means, in the owner's words", () => {
    expect(REALTIME_EMPTY_LINE).toBe('Nobody on the site in the last 5 minutes.')
  })
})

// ─── Leaving realtime returns you to where you were ──────────────────────────
//
// Order: the session's own previous view, then the stored view (never realtime itself),
// then the fallback. Glancing at the live view is a DETOUR, and a detour that silently
// rewrites where you were is a bug (owner, 23-09-2026).
describe('leaving realtime', () => {
  it('returns to the view the reader was on this session', () => {
    expect(periodOnLeavingRealtime({ period: '7' }, { period: '30' }, '30')).toEqual({ period: '7' })
  })

  // * A custom span is not identified by its token alone — restoring 'custom' without its
  // * dates would send the reader to a differently-dated window under the same label,
  // * which is worse than the bug being fixed because it looks right.
  it('carries the dates back for a custom previous view', () => {
    const range = { start: '2026-09-01', end: '2026-09-15' }
    expect(periodOnLeavingRealtime({ period: 'custom', range }, { period: '30' }, '30')).toEqual({
      period: 'custom',
      range,
    })
  })

  // * No session history: the tab opened straight onto ?period=realtime, or was reloaded
  // * while live. The reader's own stored view is the closest honest answer — and for a
  // * recipient of a shared live link it is the RIGHT answer, since the sender's session
  // * history is none of their business.
  it('falls back to the remembered view when the session has none', () => {
    expect(periodOnLeavingRealtime(null, { period: '7' }, '30')).toEqual({ period: '7' })
  })

  it('falls back to the given default when nothing is remembered either', () => {
    expect(periodOnLeavingRealtime(null, null, '30')).toEqual({ period: '30' })
  })

  // * Defence in depth. A stored realtime would be a bug elsewhere (REALTIME_MODES exists
  // * to stop it ever being written), but honouring it here too would put the reader
  // * straight back into the view they were trying to leave — the control would look
  // * broken rather than the storage.
  it('refuses a remembered realtime', () => {
    expect(periodOnLeavingRealtime(null, { period: 'realtime' }, '30')).toEqual({ period: '30' })
  })
})
