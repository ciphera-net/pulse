import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import DateRangePicker from '@/components/ui/DateRangePicker'

// A URL-round-trippable preset click writes ONLY the period. Firing the range
// callback too made every preset land as ?period=custom&start=…&end=… on
// pages that wire onDateRangeChange to a custom write: the trigger label
// degraded to a date span, and shared links froze instead of rolling forward.
// Exotic keys that cannot live in the URL keep the double write so they work.
describe('DateRangePicker preset clicks', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setup() {
    const onPeriodChange = vi.fn()
    const onDateRangeChange = vi.fn()
    render(
      <DateRangePicker
        period="30"
        dateRange={{ start: '2026-07-20', end: '2026-08-18' }}
        onPeriodChange={onPeriodChange}
        onDateRangeChange={onDateRangeChange}
      />,
    )
    // Open the dropdown via the trigger (labelled with the current preset).
    fireEvent.click(screen.getByRole('button', { name: /last 30 days/i }))
    return { onPeriodChange, onDateRangeChange }
  }

  it('a URL preset fires only onPeriodChange', () => {
    const { onPeriodChange, onDateRangeChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: /^last 7 days$/i }))
    vi.advanceTimersByTime(200)
    expect(onPeriodChange).toHaveBeenCalledWith('7')
    expect(onDateRangeChange).not.toHaveBeenCalled()
  })

  it('every global preset now single-writes — last-week joined the URL grammar (Phase 2)', () => {
    // This used to assert the double write for 'last-week'. The Phase 2 review
    // proved the double write CLOBBERS the period in the shared query-params
    // merge (?period=custom wins, the label degrades to a date span), so every
    // global preset key became a first-class URL period. The double-write path
    // now exists only for page-scoped extraPresets outside the grammar.
    const { onPeriodChange, onDateRangeChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: /^last week$/i }))
    vi.advanceTimersByTime(200)
    expect(onPeriodChange).toHaveBeenCalledWith('last-week')
    expect(onDateRangeChange).not.toHaveBeenCalled()
  })

  it('excludePresets removes the keys a page cannot honor', () => {
    const onPeriodChange = vi.fn()
    render(
      <DateRangePicker
        period="30"
        dateRange={{ start: '2026-07-20', end: '2026-08-18' }}
        onPeriodChange={onPeriodChange}
        onDateRangeChange={vi.fn()}
        excludePresets={['1h', '24h']}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /last 30 days/i }))
    expect(screen.queryByRole('button', { name: /last 1 hour/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /last 24 hours/i })).toBeNull()
    expect(screen.getByRole('button', { name: /^last 7 days$/i })).toBeTruthy()
  })
})
