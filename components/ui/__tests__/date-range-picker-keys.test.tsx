import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import type { RowState } from '@/lib/view/view'
import type { Period } from '@/lib/hooks/periodUrl'

// The date menu's keys (16-11-2026, R13): a row's letter picks it from anywhere on the page, C opens the calendar,
// the arrows step the range, each pickable row shows its letter. All of it behind the keyboard-shortcuts beta.
vi.mock('framer-motion', () => import('@/components/settings/__tests__/framer-mock'))
const flag = vi.hoisted(() => ({ on: true }))
vi.mock('@/lib/features', () => ({ useFeature: () => flag.on }))

import DateRangePicker, { type DateRangePickerProps } from '@/components/ui/DateRangePicker'

const NOW = new Date('2026-09-26T12:00:00Z')
const ROWS: { key: Period; label: string; section: RowState['section'] }[] = [
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
const rows = (greyed: Period[] = []): RowState[] =>
  ROWS.map((r) => ({ ...r, available: !greyed.includes(r.key), reason: greyed.includes(r.key) ? 'No data' : undefined }) as RowState)

function renderPicker(overrides: Partial<DateRangePickerProps> = {}) {
  const onPick = vi.fn()
  const onShift = vi.fn()
  const props: DateRangePickerProps = {
    label: 'Last 30 days',
    tick: '30',
    rows: rows(),
    onPick,
    onCustom: vi.fn(),
    onShift,
    now: NOW,
    calendar: { max: '2026-09-26', maxDays: 366, range: { start: '2026-08-28', end: '2026-09-26' } },
    ...overrides,
  }
  render(<DateRangePicker {...props} />)
  return { onPick, onShift }
}

// A press on the page goes to the body and bubbles through the document to the window, as in a browser with nothing
// focused: a listener on the document (ShortcutHandler's) hears it before the switcher's on the window.
const key = (k: string, init: KeyboardEventInit = {}, target: Element | Document | Window = document.body) => fireEvent.keyDown(target, { key: k, ...init })
const open = () => fireEvent.click(document.querySelector('[data-tour="date-range-picker"]')!)

// Elements a test adds beside the picker; testing-library unmounts the picker (and its portal) on its own.
const added: Element[] = []
const add = <T extends Element>(el: T) => { document.body.appendChild(el); added.push(el); return el }

afterEach(() => {
  flag.on = true
  for (const el of added.splice(0)) el.remove()
})

describe('a row\'s letter', () => {
  it('picks its row from anywhere on the page, whatever the case', () => {
    const { onPick } = renderPicker()
    key('w')
    key('W', { shiftKey: true })
    key('a')
    key('p')
    expect(onPick.mock.calls.map((c) => c[0])).toEqual(['7', '7', 'all', 'last-month'])
  })

  it('does nothing on a greyed row, as a press on it does nothing', () => {
    const { onPick } = renderPicker({ rows: rows(['12m']) })
    key('l')
    expect(onPick).not.toHaveBeenCalled()
  })

  it('is a letter while something is being typed, and with ⌘ or Ctrl it is the browser\'s', () => {
    const { onPick } = renderPicker()
    const field = add(document.createElement('input'))
    key('w', {}, field)
    key('w', { metaKey: true })
    key('w', { ctrlKey: true })
    expect(onPick).not.toHaveBeenCalled()
  })

  it('does nothing when the press was already handled (`g` + d went to the dashboard)', () => {
    const { onPick } = renderPicker()
    const handle = (e: KeyboardEvent) => e.preventDefault()
    document.addEventListener('keydown', handle)
    key('d')
    document.removeEventListener('keydown', handle)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('picks and closes the menu when the menu is open', () => {
    const { onPick } = renderPicker()
    open()
    expect(document.querySelector('[data-view-switcher]')).not.toBeNull()
    key('t')
    expect(onPick).toHaveBeenCalledWith('30')
    expect(document.querySelector('[data-view-switcher]')).toBeNull()
  })
})

describe('C and the arrows', () => {
  it('C opens the menu with its calendar', () => {
    renderPicker()
    key('c')
    expect(document.querySelector('[data-view-switcher]')).not.toBeNull()
    expect(document.querySelector('[data-view-calendar]')).not.toBeNull()
  })

  it('C does nothing where there is no calendar (the share page)', () => {
    renderPicker({ onCustom: undefined })
    key('c')
    expect(document.querySelector('[data-view-switcher]')).toBeNull()
  })

  it('the arrows step the range as the buttons beside it do', () => {
    const { onShift } = renderPicker()
    key('ArrowLeft')
    key('ArrowRight')
    expect(onShift.mock.calls.map((c) => c[0])).toEqual([-1, 1])
  })

  it('an arrow that has nowhere to go does nothing', () => {
    const { onShift } = renderPicker({ shiftBackDisabled: true, shiftForwardDisabled: true })
    key('ArrowLeft')
    key('ArrowRight')
    expect(onShift).not.toHaveBeenCalled()
  })

  it('the arrows stay with a control that moves with them, and with the open menu', () => {
    const { onShift } = renderPicker()
    const steps = add(document.createElement('div'))
    steps.setAttribute('data-own-arrows', '')
    const step = steps.appendChild(document.createElement('button'))
    key('ArrowLeft', {}, step)
    open()
    key('ArrowLeft')
    expect(onShift).not.toHaveBeenCalled()
  })
})

describe('the letters in the menu', () => {
  it('each pickable row shows its letter; a greyed row and Last year show none', () => {
    renderPicker({ rows: rows(['12m']) })
    open()
    const caps = Object.fromEntries(
      Array.from(document.querySelectorAll('[data-view-list] [data-row]')).map((r) => [r.getAttribute('data-row'), r.querySelector('kbd')?.textContent ?? null]),
    )
    expect(caps).toEqual({
      today: 'D', yesterday: 'E', '7': 'W', '30': 'T', '3m': 'N', '12m': null, all: 'A',
      month: 'M', 'last-month': 'P', year: 'Y', 'last-year': null, custom: 'C',
    })
    expect(document.querySelector('[data-row="7"]')).toHaveAttribute('aria-keyshortcuts', 'W')
  })
})

describe('with the beta off', () => {
  it('no key does anything and the menu shows no letter', () => {
    flag.on = false
    const { onPick, onShift } = renderPicker()
    key('w')
    key('ArrowLeft')
    key('c')
    expect(onPick).not.toHaveBeenCalled()
    expect(onShift).not.toHaveBeenCalled()
    expect(document.querySelector('[data-view-switcher]')).toBeNull()
    open()
    expect(document.querySelectorAll('[data-view-list] kbd')).toHaveLength(0)
    expect(document.querySelector('[data-row="7"]')).not.toHaveAttribute('aria-keyshortcuts')
  })
})
