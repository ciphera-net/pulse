import { describe, expect, it } from 'vitest'
import { PERIOD_PRESETS } from '@/lib/constants/periods'
import { isUrlPeriod, parsePeriod, periodToDateRange, type Period } from '@/lib/hooks/periodUrl'

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
