import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { RowState } from '@/lib/view/view'
import type { Period } from '@/lib/hooks/periodUrl'

// The view switcher rebuild (PULSE-20, owner decisions 25-09-2026) replaced this
// component's whole prop surface — period/dateRange/onPeriodChange/onDateRangeChange/
// excludePresets are gone; the caller now hands it the resolved label, tick, rows and
// footnote from lib/view/view.ts (or the share page's own shareRows()), and the
// component decides nothing about data. Rewritten to that contract per
// Pulse/docs/plans/22-09-2026-unified-time-range-design.md §12 and the handover's §3
// item 6 (Pulse/docs/plans/26-09-2026-view-switcher-build-handover-2.md).
//
// Rows are literal fixtures rather than viewRows() output — lib/view/__tests__/view.ts
// owns the greying/labelling logic itself; this file only pins what the COMPONENT does
// with whatever RowState[] it is handed, so it stays green across wording changes there.
//
// framer-motion mocked with the shared settings stand-in (component-per-tag cache, so
// AnimatePresence's children render/unrender synchronously — no real exit transition to
// wait out in jsdom).
vi.mock('framer-motion', () => import('@/components/settings/__tests__/framer-mock'))

import DateRangePicker, {
  CALENDAR_COLUMN_PX,
  LIST_COLUMN_PX,
  placePanel,
  type DateRangePickerProps,
} from '@/components/ui/DateRangePicker'

const NOW = new Date('2026-09-26T12:00:00Z')

// The eleven named rows, in menu order (lib/constants/periods.ts PERIOD_PRESETS) —
// duplicated here as data, not imported, so this file does not silently start passing
// or failing because periods.ts changed a label out from under it.
const ROW_ORDER: { key: Period; label: string; section: RowState['section'] }[] = [
  { key: 'today', label: 'Today', section: 'relative' },
  { key: 'yesterday', label: 'Yesterday', section: 'relative' },
  { key: '7', label: 'Last 7 days', section: 'relative' },
  { key: '30', label: 'Last 30 days', section: 'relative' },
  { key: '3m', label: 'Last 3 months', section: 'relative' },
  { key: '12m', label: 'Last 12 months', section: 'relative' },
  { key: 'all', label: 'All time', section: 'relative' },
  { key: 'month', label: 'This month', section: 'calendar' },
  { key: 'last-month', label: 'Last month', section: 'calendar' },
  { key: 'year', label: 'This year', section: 'calendar' },
  { key: 'last-year', label: 'Last year', section: 'calendar' },
]

function allRows(overrides: Partial<Record<Period, Partial<RowState>>> = {}): RowState[] {
  return ROW_ORDER.map((r) => ({ ...r, available: true, ...(overrides[r.key] ?? {}) }))
}

type Overrides = Partial<DateRangePickerProps>

function renderPicker(overrides: Overrides = {}) {
  const onPick = vi.fn()
  const onCustom = vi.fn()
  const props: DateRangePickerProps = {
    label: 'Last 7 days',
    suffix: 'since 26 Aug',
    tick: '7',
    rows: allRows(),
    footnote: null,
    onPick,
    onCustom,
    now: NOW,
    calendar: { max: '2026-09-26', maxDays: 366, range: { start: '2026-08-20', end: '2026-09-26' } },
    ...overrides,
  }
  const utils = render(<DateRangePicker {...props} />)
  return { ...utils, onPick, onCustom, props }
}

function openPicker() {
  fireEvent.click(document.querySelector('[data-tour="date-range-picker"]')!)
}

describe('DateRangePicker closed trigger', () => {
  it('shows the label, the suffix in its own muted span, the right aria-label, and keeps data-tour', () => {
    renderPicker({ label: 'Last 7 days', suffix: 'since 26 Aug', tick: '7' })
    const trigger = document.querySelector('[data-tour="date-range-picker"]')!
    expect(trigger).toHaveAttribute('data-tour', 'date-range-picker')
    expect(trigger).toHaveAttribute('aria-label', 'Date range: Last 7 days, since 26 Aug')
    expect(trigger).toHaveTextContent('Last 7 days')

    const suffixEl = trigger.querySelector('[data-view-suffix]')
    expect(suffixEl).not.toBeNull()
    expect(suffixEl).toHaveTextContent('· since 26 Aug')
    // The suffix lives in its OWN node — not appended into the label's text — so a
    // caller that reads just the label span never sees the tail glued onto it.
    expect(suffixEl!.textContent).not.toBe(trigger.textContent)
  })
})

describe('DateRangePicker open — the list', () => {
  it('renders the eleven rows then Custom range… in order, in two divider-separated blocks, with no scroll classes', () => {
    renderPicker({ footnote: null })
    openPicker()

    const list = document.querySelector('[data-view-list]')!
    const rowKeys = Array.from(list.querySelectorAll('[data-row]')).map((el) => el.getAttribute('data-row'))
    expect(rowKeys).toEqual([...ROW_ORDER.map((r) => r.key), 'custom'])

    // Three blocks (relative rows / calendar rows / Custom range…) means exactly two
    // dividers — footnote is null here so its own border-t paragraph can't inflate the count.
    const dividers = list.querySelectorAll(':scope > div[class*="border-t"]')
    expect(dividers.length).toBe(2)
    expect(list.children.length).toBe(3)

    // The LIST is never a scroll box of its own: twelve rows, all in view. The panel around it may scroll, and
    // only where the viewport is shorter than its content (a phone with the calendar open under the list). Its
    // cap is the viewport's lower edge, set as a style from where the panel hangs, never a fixed height class.
    const popover = document.querySelector('[data-view-switcher]')!
    expect(list.className).not.toMatch(/max-h/)
    expect(list.className).not.toMatch(/overflow/)
    expect(popover.className).not.toMatch(/max-h-/)
  })

  it('ticks the applied row with aria-pressed and a visible check', () => {
    renderPicker({ tick: '7' })
    openPicker()

    const tickedRow = document.querySelector('[data-row="7"]')!
    expect(tickedRow).toHaveAttribute('aria-pressed', 'true')
    expect(tickedRow.querySelector('svg')?.getAttribute('class')).toMatch(/opacity-100/)

    const untickedRow = document.querySelector('[data-row="30"]')!
    expect(untickedRow).toHaveAttribute('aria-pressed', 'false')
    expect(untickedRow.querySelector('svg')?.getAttribute('class')).toMatch(/opacity-0/)
  })

  it('greys an unavailable row: disabled, titled with its reason, described by the footnote, and inert', () => {
    const { onPick } = renderPicker({
      rows: allRows({ yesterday: { available: false, reason: 'No data before 20 Sep' } }),
      footnote: 'No data before 20 Sep. Longer ranges show from that day.',
    })
    openPicker()

    const footnoteEl = screen.getByText('No data before 20 Sep. Longer ranges show from that day.')
    const greyedRow = document.querySelector('[data-row="yesterday"]')!
    expect(greyedRow).toBeDisabled()
    expect(greyedRow).toHaveAttribute('title', 'No data before 20 Sep')
    expect(greyedRow).toHaveAttribute('aria-describedby', footnoteEl.id)

    fireEvent.click(greyedRow)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('calls onPick once for an available row and closes the picker', () => {
    const { onPick } = renderPicker()
    openPicker()

    fireEvent.click(document.querySelector('[data-row="today"]')!)

    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith('today')
    expect(document.querySelector('[data-tour="date-range-picker"]')).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelector('[data-view-switcher]')).toBeNull()
  })
})

describe('DateRangePicker open — the calendar', () => {
  // A wide-open window (before/after are far outside it) so only the maxDays guard,
  // never min/max, can be the reason a day near the picked start is disabled.
  const CALENDAR = { min: '2026-09-10', max: '2026-09-24', maxDays: 7, range: { start: '2026-09-15', end: '2026-09-20' } }

  // Since 14-11-2026 the calendar opens BESIDE the list instead of replacing it: the swap changed the panel's
  // width and height in one frame, which showed as a jump. The list stays mounted and the same row closes the
  // calendar again, so there is no "Back to ranges" button any more.
  it('Custom range… opens the calendar beside the list, which stays, and the same row closes it', () => {
    renderPicker({ calendar: CALENDAR })
    openPicker()
    const list = document.querySelector('[data-view-list]')!
    const custom = document.querySelector('[data-row="custom"]')!
    expect(document.querySelector('[data-view-calendar]')).toBeNull()
    expect(custom).toHaveAttribute('aria-expanded', 'false')
    expect(custom).not.toHaveAttribute('aria-controls')

    fireEvent.click(custom)
    const calendar = document.querySelector('[data-view-calendar]')!
    expect(calendar).not.toBeNull()
    // The very same list node: not unmounted and drawn again, so it cannot have moved.
    expect(document.querySelector('[data-view-list]')).toBe(list)
    expect(custom).toHaveAttribute('aria-expanded', 'true')
    expect(custom).toHaveAttribute('aria-controls', calendar.id)
    expect(calendar).toHaveAttribute('role', 'group')
    expect(calendar).toHaveAttribute('aria-label', 'Custom range')
    expect(screen.queryByRole('button', { name: 'Back to ranges' })).toBeNull()
    // In the document the calendar FOLLOWS the list, so Tab leaves "Custom range…" straight into it (the row is
    // the list's last control) and a phone stacks it under the list.
    expect(list.compareDocumentPosition(calendar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(custom)
    expect(document.querySelector('[data-view-calendar]')).toBeNull()
    expect(document.querySelector('[data-view-list]')).toBe(list)
    expect(custom).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens with the calendar closed every time, a custom range applied or not', () => {
    renderPicker({ calendar: CALENDAR, tick: 'custom', label: '15 Sep – 20 Sep' })
    openPicker()
    expect(document.querySelector('[data-view-calendar]')).toBeNull()
    expect(document.querySelector('[data-row="custom"]')).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(document.querySelector('[data-row="custom"]')!)
    expect(document.querySelector('[data-view-calendar]')).not.toBeNull()

    // Close the picker with the calendar open, then open it again.
    fireEvent.click(document.querySelector('[data-tour="date-range-picker"]')!)
    expect(document.querySelector('[data-view-switcher]')).toBeNull()
    openPicker()
    expect(document.querySelector('[data-view-list]')).not.toBeNull()
    expect(document.querySelector('[data-view-calendar]')).toBeNull()
  })

  it('a named range still applies with the calendar open', () => {
    const { onPick, onCustom } = renderPicker({ calendar: CALENDAR })
    openPicker()
    fireEvent.click(document.querySelector('[data-row="custom"]')!)
    fireEvent.click(screen.getByText('15').closest('button')!) // a start, never finished

    fireEvent.click(document.querySelector('[data-row="30"]')!)
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith('30')
    expect(onCustom).not.toHaveBeenCalled()
    expect(document.querySelector('[data-view-switcher]')).toBeNull()
  })

  it('drops a half-picked range when the calendar is closed', () => {
    const { onCustom } = renderPicker({ calendar: CALENDAR })
    openPicker()
    const custom = document.querySelector('[data-row="custom"]')!
    fireEvent.click(custom)
    fireEvent.click(screen.getByText('15').closest('button')!) // start = 15
    fireEvent.click(custom) // close
    fireEvent.click(custom) // open again

    // Were 15 still the start, this click would finish 15 → 20. It starts a new range instead.
    fireEvent.click(screen.getByText('20').closest('button')!)
    expect(onCustom).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('22').closest('button')!)
    expect(onCustom).toHaveBeenCalledTimes(1)
    expect(onCustom).toHaveBeenCalledWith({ start: '2026-09-20', end: '2026-09-22' })
  })

  it('draws each column at the width the panel was placed for', () => {
    // placePanel() works from LIST_COLUMN_PX and CALENDAR_COLUMN_PX before the calendar exists; the classes draw
    // the columns. If the two drift apart, the panel is placed for a width it does not have.
    renderPicker({ calendar: CALENDAR })
    openPicker()
    fireEvent.click(document.querySelector('[data-row="custom"]')!)
    expect(document.querySelector('[data-view-list]')!.className).toContain(`sm:w-[${LIST_COLUMN_PX}px]`)
    const column = document.querySelector('[data-view-calendar]')!
    expect(column.firstElementChild!.className).toContain(`sm:w-[${CALENDAR_COLUMN_PX}px]`)
    // The column itself carries no width class: its width is what opens.
    expect(column.className).not.toMatch(/(^|\s)(sm:)?w-/)
  })

  it('greys days outside [min, max], and once a start is picked refuses a span longer than maxDays', () => {
    const { onCustom } = renderPicker({ calendar: CALENDAR })
    openPicker()
    fireEvent.click(document.querySelector('[data-row="custom"]')!)

    // 7 Sep is before min (10 Sep); 28 Sep is after max (24 Sep) — both in the current
    // month, so the number alone is unambiguous (padding days from adjacent months are
    // 1–4/31 here, never 5–30).
    expect(screen.getByText('7').closest('button')).toBeDisabled()
    expect(screen.getByText('28').closest('button')).toBeDisabled()

    // 23 Sep is inside [min, max] and enabled before a start is chosen.
    const day23 = screen.getByText('23').closest('button')!
    expect(day23).not.toBeDisabled()

    fireEvent.click(screen.getByText('15').closest('button')!) // start
    // 15 → 23 spans 9 days, over the 7-day ceiling: now refused, and inert.
    expect(day23).toBeDisabled()
    fireEvent.click(day23)
    expect(onCustom).not.toHaveBeenCalled()

    // 15 → 20 spans 6 days, inside the ceiling.
    fireEvent.click(screen.getByText('20').closest('button')!)
    expect(onCustom).toHaveBeenCalledTimes(1)
    expect(onCustom).toHaveBeenCalledWith({ start: '2026-09-15', end: '2026-09-20' })
  })

  it('orders the two picked days regardless of click order', () => {
    const { onCustom } = renderPicker({ calendar: CALENDAR })
    openPicker()
    fireEvent.click(document.querySelector('[data-row="custom"]')!)

    // Later day first, earlier day second — onCustom must still see start < end.
    fireEvent.click(screen.getByText('20').closest('button')!)
    fireEvent.click(screen.getByText('15').closest('button')!)

    expect(onCustom).toHaveBeenCalledTimes(1)
    expect(onCustom).toHaveBeenCalledWith({ start: '2026-09-15', end: '2026-09-20' })
  })

  it('renders the days caption under the calendar only while open, and not at all without one', () => {
    const { rerender, props } = renderPicker({ calendar: { ...CALENDAR, caption: "Days follow the site's timezone · Asia/Karachi" } })
    expect(screen.queryByText(/Days follow the site's timezone/)).toBeNull()

    openPicker()
    fireEvent.click(document.querySelector('[data-row="custom"]')!)
    expect(screen.getByText("Days follow the site's timezone · Asia/Karachi")).toBeInTheDocument()

    // Closing the calendar removes it — it is not left mounted and hidden, where its 42 day buttons would stay
    // in the tab order. Closing the picker does the same.
    fireEvent.click(document.querySelector('[data-row="custom"]')!)
    expect(screen.queryByText(/Days follow the site's timezone/)).toBeNull()
    fireEvent.click(document.querySelector('[data-row="custom"]')!)
    expect(screen.getByText("Days follow the site's timezone · Asia/Karachi")).toBeInTheDocument()
    fireEvent.click(document.querySelector('[data-tour="date-range-picker"]')!)
    expect(screen.queryByText(/Days follow the site's timezone/)).toBeNull()

    rerender(<DateRangePicker {...props} calendar={{ ...CALENDAR, caption: undefined }} />)
    fireEvent.click(document.querySelector('[data-tour="date-range-picker"]')!)
    fireEvent.click(document.querySelector('[data-row="custom"]')!)
    expect(screen.queryByText(/Days follow the site's timezone/)).toBeNull()
  })
})

// Where the panel hangs is decided once, when it opens, for its WIDEST state: the list plus the calendar's
// column. That is what lets the calendar open later without anything being measured or moved. The numbers are a
// 1440 px viewport and the real columns (176 px of list with its border, 280 px of calendar).
describe('placePanel', () => {
  const LIST = LIST_COLUMN_PX + 2
  const CAL = CALENDAR_COLUMN_PX

  it('hangs the list from the trigger\'s right edge and opens the calendar to its left', () => {
    const placed = placePanel({ triggerRight: 1400, viewport: 1440, list: LIST, calendar: CAL })
    expect(placed).toEqual({ calendarSide: 'left', right: 40 })
    // The whole panel stays on screen: its left edge is right - list - calendar from the right edge.
    expect(1440 - 40 - LIST - CAL).toBeGreaterThanOrEqual(8)
  })

  it('places the list in the same spot whether or not the calendar is ever opened', () => {
    // The point of the change. With the calendar's width left out the answer is the same pinned edge.
    const withCalendar = placePanel({ triggerRight: 1100, viewport: 1440, list: LIST, calendar: CAL })
    const listAlone = placePanel({ triggerRight: 1100, viewport: 1440, list: LIST, calendar: 0 })
    expect(withCalendar).toEqual(listAlone)
  })

  it('keeps 8 px from the viewport\'s edge when the trigger sits against it', () => {
    expect(placePanel({ triggerRight: 1440, viewport: 1440, list: LIST, calendar: CAL })).toEqual({ calendarSide: 'left', right: 8 })
    expect(placePanel({ triggerRight: 1436, viewport: 1440, list: LIST, calendar: CAL })).toEqual({ calendarSide: 'left', right: 8 })
  })

  it('opens the calendar to the RIGHT when a wrapped toolbar leaves no room on the left', () => {
    // A toolbar that wrapped to the start of its row: the trigger ends 300 px in. 300 - 456 is off screen, so
    // the list stays under the trigger (its left edge at 300 - 176) and the calendar takes the other side.
    const placed = placePanel({ triggerRight: 300, viewport: 1024, list: LIST, calendar: CAL })
    expect(placed).toEqual({ calendarSide: 'right', left: 300 - LIST })
    expect(placed.left! + LIST + CAL).toBeLessThanOrEqual(1024 - 8)
  })

  it('pushes the whole panel in when neither side has room', () => {
    // 700 px wide, the trigger ending at 450: 450 - 456 is off the left edge and 274 + 456 runs past the right.
    const placed = placePanel({ triggerRight: 450, viewport: 700, list: LIST, calendar: CAL })
    expect(placed).toEqual({ calendarSide: 'left', right: 700 - LIST - CAL - 8 })
    expect(700 - placed.right! - LIST - CAL).toBe(8)
  })

  it('centres a phone\'s full-width panel, where the calendar adds no width', () => {
    // Below `sm` the panel is min(460, viewport - 16) wide and the calendar opens under the list.
    expect(placePanel({ triggerRight: 374, viewport: 390, list: 374, calendar: 0 })).toEqual({ calendarSide: 'left', right: 8 })
    expect(placePanel({ triggerRight: 200, viewport: 390, list: 374, calendar: 0 })).toEqual({ calendarSide: 'left', right: 8 })
  })
})

describe('DateRangePicker share shape (no onCustom, no onShift)', () => {
  it('greys Custom range… with customReason when there is no onCustom', () => {
    renderPicker({
      onCustom: undefined,
      customReason: 'A shared dashboard shows fixed ranges.',
      calendar: undefined,
      footnote: 'A shared dashboard shows fixed ranges.',
    })
    openPicker()

    const customRow = document.querySelector('[data-row="custom"]')!
    expect(customRow).toBeDisabled()
    expect(customRow).toHaveAttribute('title', 'A shared dashboard shows fixed ranges.')
  })

  it('renders no shift arrows when onShift is absent', () => {
    renderPicker({ onShift: undefined })
    expect(screen.queryByRole('button', { name: 'Shift range back' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Shift range forward' })).toBeNull()
  })

  it('disables each shift arrow independently when onShift is present', () => {
    renderPicker({ onShift: vi.fn(), shiftBackDisabled: true, shiftForwardDisabled: false })
    expect(screen.getByRole('button', { name: 'Shift range back' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Shift range forward' })).not.toBeDisabled()
  })
})
