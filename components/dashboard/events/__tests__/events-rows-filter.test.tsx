import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { EVENT_KIND } from '@/lib/filters'

// R62 (16-11-2026, option B1 of the Events rows round): with the event-filters beta (`onFilter`), a press on an Events
// row filters the page by its event, as a Pages or Referrers row filters by its page or source, and the caret at the
// row's end is a button of its own that opens the event's properties. Without the beta the press opens them.

const h = vi.hoisted(() => ({ useEventPropertyKeys: vi.fn(), useEventPropertyValues: vi.fn() }))
vi.mock('@/lib/swr/dashboard', () => ({
  useEventPropertyKeys: (...a: unknown[]) => h.useEventPropertyKeys(...a),
  useEventPropertyValues: (...a: unknown[]) => h.useEventPropertyValues(...a),
}))
vi.mock('@/components/dashboard/Cascade', () => ({
  CascadeGroup: ({ className, children }: { className?: string; children: React.ReactNode }) => <div className={className}>{children}</div>,
  CascadeRow: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RowBar: ({ className }: { className?: string }) => <div data-testid="row-bar" className={className} />,
}))

import EventsBlock from '../EventsBlock'

const idle = { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }
const props = {
  goalCounts: [
    { event_name: 'signup', count: 40, visitors: 30 },
    { event_name: 'add_to_cart', count: 25, visitors: 20 },
  ],
  siteId: 'site-1',
  dateRange: { start: '2026-11-01', end: '2026-11-07' },
  totals: { pageviews: 1000, visitors: 400 },
}
const rowOf = (event: string) => document.querySelector<HTMLElement>(`[data-event="${event}"]`)!

beforeEach(() => {
  h.useEventPropertyKeys.mockReset().mockReturnValue({ ...idle, data: [] })
  h.useEventPropertyValues.mockReset().mockReturnValue({ ...idle, data: [] })
})
afterEach(() => cleanup())

describe('an Events row with the event filter (R62)', () => {
  it('a press filters the page by the row\'s event, from the row and from its numbers', () => {
    const onFilter = vi.fn()
    render(<EventsBlock {...props} onFilter={onFilter} />)
    const press = rowOf('add_to_cart').querySelector<HTMLButtonElement>('[data-row-press]')!
    expect(press.getAttribute('data-row-press')).toBe('filter')
    expect(press.getAttribute('aria-label')).toMatch(/^Filter by event: /)
    expect(press).not.toHaveAttribute('aria-pressed')
    fireEvent.click(press)
    expect(onFilter).toHaveBeenLastCalledWith({ dimension: EVENT_KIND, operator: 'is', values: ['add_to_cart'] })
    fireEvent.click(rowOf('signup').querySelector<HTMLElement>('.pointer-events-auto')!)
    expect(onFilter).toHaveBeenLastCalledWith({ dimension: EVENT_KIND, operator: 'is', values: ['signup'] })
    expect(onFilter).toHaveBeenCalledTimes(2)
  })

  it('the caret is a button of its own that opens the event\'s properties and filters nothing', () => {
    const onFilter = vi.fn()
    render(<EventsBlock {...props} onFilter={onFilter} />)
    // The first row is shown until another is opened.
    expect(rowOf('signup')).toHaveAttribute('data-picked')
    const caret = rowOf('add_to_cart').querySelector<HTMLButtonElement>('[data-row-open]')!
    expect(caret.tagName).toBe('BUTTON')
    expect(caret.getAttribute('aria-label')).toMatch(/^Show the properties of /)
    expect(caret).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(caret)
    expect(onFilter).not.toHaveBeenCalled()
    expect(rowOf('add_to_cart')).toHaveAttribute('data-picked')
    expect(rowOf('signup')).not.toHaveAttribute('data-picked')
    expect(caret).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('an Events row without the event filter', () => {
  it('a press opens the properties, and the caret is only a cue', () => {
    render(<EventsBlock {...props} />)
    const press = rowOf('add_to_cart').querySelector<HTMLButtonElement>('[data-row-press]')!
    expect(press.getAttribute('data-row-press')).toBe('open')
    expect(press.getAttribute('aria-label')).toMatch(/^Show the properties of /)
    expect(document.querySelector('[data-row-open]')).toBeNull()
    fireEvent.click(press)
    expect(rowOf('add_to_cart')).toHaveAttribute('data-picked')
    expect(press).toHaveAttribute('aria-pressed', 'true')
  })

  it('a customer\'s share link has nothing to press', () => {
    render(<EventsBlock {...props} memberFeatures={false} onFilter={vi.fn()} />)
    expect(document.querySelector('[data-row-press]')).toBeNull()
    expect(document.querySelector('[data-row-open]')).toBeNull()
  })
})
