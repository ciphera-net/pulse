import { describe, expect, it } from 'vitest'
import { PERIOD_PRESETS } from '@/lib/constants/periods'
import { isUrlPeriod, parsePeriod, periodToDateRange, shiftDateRange, type Period } from '@/lib/hooks/periodUrl'
import { getDateRange } from '@/lib/utils/format'
import { siteWallClockNow } from '@/lib/utils/siteTime'

// The DateRangePicker fires ONLY onPeriodChange for URL-round-trippable
// presets, trusting the URL layer to re-derive the same range the picker
// resolved. That trust is exactly this equivalence: for every such key,
// parsePeriod must accept it and periodToDateRange must produce the range the
// preset itself resolves. If a picker preset ever diverges from the URL
// layer's resolution, a preset click would silently show different data than
// a reload of the resulting URL.
describe('URL-round-trippable presets resolve identically via the URL layer', () => {
  const urlPresets = PERIOD_PRESETS.filter((p) => isUrlPeriod(p.key))

  it('covers a meaningful share of the picker', () => {
    expect(urlPresets.length).toBeGreaterThanOrEqual(5)
  })

  it('EVERY global preset is a URL period — a key outside the grammar double-writes and lands as ?period=custom', () => {
    // The Phase 2 review reproduced the failure: for a non-URL key the picker
    // fires onPeriodChange + onDateRangeChange back-to-back, the second write
    // clobbers the first in the shared query-params merge, and the preset's
    // label degrades to a raw date span. Keeping the vocabularies identical
    // makes that path unreachable.
    for (const p of PERIOD_PRESETS) {
      expect(isUrlPeriod(p.key), `preset "${p.key}" (${p.label}) must be in the URL period grammar`).toBe(true)
    }
  })

  for (const preset of urlPresets) {
    it(`?period=${preset.key} re-derives the range "${preset.label}" resolved`, () => {
      expect(parsePeriod(preset.key)).toBe(preset.key as Period)
      expect(periodToDateRange(preset.key as Period)).toEqual(preset.resolve())
    })
  }
})

// ---------------------------------------------------------------------------
// Presets resolve on the SITE's wall clock, not the viewer's (18-09-2026).
//
// Fixture: the site is Asia/Karachi (UTC+5, no DST) and has already reached
// 2026-09-19 00:30 at the real instant 2026-09-18T19:30:00Z — the SAME
// instant is still the evening of 2026-09-18 for a viewer in Europe/Brussels
// (CEST, UTC+2, ~21:30 local). Every assertion below is built from
// `siteWallClockNow('Asia/Karachi', AT)`, never from the test runner's own
// `new Date()` — this file runs once under the suite's default pinned TZ
// (America/New_York, see vitest.setup.ts) and is re-run under
// PULSE_TEST_TZ=Europe/Brussels and PULSE_TEST_TZ=Pacific/Auckland (the repo's
// TZ-pin lever — vitest.setup.ts reads PULSE_TEST_TZ, not TZ, so it is the
// variable that actually swaps the runtime zone here). Every number below is
// independent of the runtime zone by construction: siteWallClockNow's local
// getters round-trip through whatever zone the process is in and always
// yield the SITE's y/m/d/h/mi back out.
// ---------------------------------------------------------------------------
describe("date-range presets resolve on the site's wall clock (18-09-2026)", () => {
  const AT = new Date('2026-09-18T19:30:00Z')
  const siteNow = siteWallClockNow('Asia/Karachi', AT)

  it('the fixture really does land on two different calendar days', () => {
    // Sanity check on the fixture itself, not the code under test: proves
    // the scenario is genuinely cross-midnight, not just cross-timezone.
    expect(siteNow.getFullYear()).toBe(2026)
    expect(siteNow.getMonth()).toBe(8) // September, 0-indexed
    expect(siteNow.getDate()).toBe(19)
    expect(siteNow.getHours()).toBe(0)
    expect(siteNow.getMinutes()).toBe(30)
  })

  it('"today" is the site\'s 2026-09-19, not the viewer\'s 2026-09-18', () => {
    expect(periodToDateRange('today', siteNow)).toEqual({ start: '2026-09-19', end: '2026-09-19' })
  })

  it('"yesterday" is 2026-09-18 (the site\'s yesterday)', () => {
    expect(periodToDateRange('yesterday', siteNow)).toEqual({ start: '2026-09-18', end: '2026-09-18' })
  })

  it('"last month" is the whole of August 2026', () => {
    expect(periodToDateRange('last-month', siteNow)).toEqual({ start: '2026-08-01', end: '2026-08-31' })
  })

  it('getDateRange(7) ends on the site\'s today, 2026-09-19', () => {
    expect(getDateRange(7, siteNow)).toEqual({ start: '2026-09-13', end: '2026-09-19' })
  })

  it('shiftDateRange refuses to move a range past the site\'s today', () => {
    // A 7-day window already ending on the site's today: shifting it one
    // more span forward would ask for days the site has not reached yet.
    const thisWeek = { start: '2026-09-13', end: '2026-09-19' }
    expect(shiftDateRange(thisWeek, 1, siteNow)).toBeNull()
    // The paired positive: shifting BACK is always fine, and lands exactly
    // one span earlier — "always refuse" would pass the negative alone.
    expect(shiftDateRange(thisWeek, -1, siteNow)).toEqual({ start: '2026-09-06', end: '2026-09-12' })
  })

  it('a range ending exactly on the site\'s today is the forward boundary, not one day short or long', () => {
    const today = { start: '2026-09-19', end: '2026-09-19' }
    expect(shiftDateRange(today, 1, siteNow)).toBeNull()
    expect(shiftDateRange(today, -1, siteNow)).toEqual({ start: '2026-09-18', end: '2026-09-18' })
  })
})
