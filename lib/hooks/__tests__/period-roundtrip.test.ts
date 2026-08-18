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

  for (const preset of urlPresets) {
    it(`?period=${preset.key} re-derives the range "${preset.label}" resolved`, () => {
      expect(parsePeriod(preset.key)).toBe(preset.key as Period)
      expect(periodToDateRange(preset.key as Period)).toEqual(preset.resolve())
    })
  }
})
