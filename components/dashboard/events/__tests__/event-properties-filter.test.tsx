import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { eventPropertyKind } from '@/lib/filters'

// The Events block's values as filters (R45; design section 8: "a property value by its value"), under the
// event-filters beta. A press keeps the visitors who did the event with that value; a merged row (two stored values
// that read the same) filters by all of them; without the beta the rows are no controls at all.

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

import { EventProperties } from '../EventProperties'

const idle = { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }
const row = { event_name: 'file_download', count: 20, visitors: 18 }
const props = {
  siteId: 'site-1',
  row,
  name: 'File downloads',
  windowKey: 'w',
  dateRange: { start: '2026-11-01', end: '2026-11-07' },
  onBack: () => {},
}

beforeEach(() => {
  h.useEventPropertyKeys.mockReset().mockReturnValue({ ...idle, data: [{ key: 'url', count: 20 }] })
  h.useEventPropertyValues.mockReset().mockReturnValue({
    ...idle,
    data: [
      { value: 'https://www.example.com/a.pdf', count: 9 },
      { value: 'https://docs.example/b.pdf', count: 7 },
      { value: 'http://example.com/a.pdf/', count: 4 },
    ],
  })
})
afterEach(() => cleanup())

describe('the Events block\'s values as filters (R45)', () => {
  it('filters by a value, every stored value of a merged row, from a real button named for the filter', () => {
    const onFilter = vi.fn()
    render(<EventProperties {...props} onFilter={onFilter} />)
    const merged = screen.getByRole('button', { name: 'Filter by File downloads: Link is example.com/a.pdf' })
    expect(merged.tagName).toBe('BUTTON')
    expect(merged.getAttribute('type')).toBe('button')
    fireEvent.click(merged)
    expect(onFilter).toHaveBeenLastCalledWith({
      dimension: eventPropertyKind('file_download', 'url'),
      operator: 'is',
      values: ['https://www.example.com/a.pdf', 'http://example.com/a.pdf/'],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Filter by File downloads: Link is docs.example/b.pdf' }))
    expect(onFilter).toHaveBeenLastCalledWith({ dimension: eventPropertyKind('file_download', 'url'), operator: 'is', values: ['https://docs.example/b.pdf'] })
  })

  it('escapes a key that holds the format\'s delimiters, as every property kind is', () => {
    h.useEventPropertyKeys.mockReturnValue({ ...idle, data: [{ key: 'plan|tier', count: 20 }] })
    const onFilter = vi.fn()
    render(<EventProperties {...props} onFilter={onFilter} />)
    fireEvent.click(screen.getAllByTestId('event-value-filter')[0])
    expect(onFilter.mock.calls[0][0].dimension).toBe(eventPropertyKind('file_download', 'plan|tier'))
    expect(onFilter.mock.calls[0][0].dimension).toBe('event_property:file_download:plan%7Ctier')
  })

  it('hands a press on the number to the filter, the number keeping its exact count', () => {
    const onFilter = vi.fn()
    render(<EventProperties {...props} onFilter={onFilter} />)
    const value = document.querySelectorAll<HTMLElement>('[data-event-value]')[0]
    const number = value.querySelector('.pointer-events-auto') as HTMLElement
    expect(number).toBeTruthy()
    fireEvent.click(number)
    expect(onFilter).toHaveBeenCalledTimes(1)
  })

  it('marks a filtering row as one every block\'s row is, its bar free to deepen', () => {
    render(<EventProperties {...props} onFilter={vi.fn()} />)
    const value = document.querySelectorAll<HTMLElement>('[data-event-value]')[0]
    expect(value.className).toContain('interactive-row')
    expect(value.className).toContain('cursor-pointer')
    expect(value.querySelector('[data-testid="row-bar"]')?.className ?? '').not.toContain('group-hover:bg-brand-orange/[0.16]')
  })

  it('draws no control without the beta: the rows stay text, and their bar stays still', () => {
    render(<EventProperties {...props} />)
    expect(screen.queryAllByTestId('event-value-filter')).toEqual([])
    const value = document.querySelectorAll<HTMLElement>('[data-event-value]')[0]
    expect(value.className).not.toContain('interactive-row')
    expect(value.querySelector('[data-testid="row-bar"]')?.className).toContain('md:group-hover:bg-brand-orange/[0.16]')
    // The number box takes the pointer as it always has: there is no press to hand on.
    expect(value.querySelector('.pointer-events-auto')).toBeNull()
    expect((value.lastElementChild as HTMLElement).className).not.toContain('pointer-events-none')
  })
})
