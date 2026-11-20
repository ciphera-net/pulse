import { describe, it, expect, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import type { VisitEvent, VisitorDayVisit } from '@/lib/api/visitors'
import { DayMarks, layoutMarks, marksSaid } from '../DayMarks'
import { dayPages } from '../day'

// A visitor's day as marks (R104 to R108): a mark a page, visit by visit, within the room the column has, "+n" past it.

beforeAll(() => {
  // jsdom has no ResizeObserver; the marks measure their column with one. A box with no size is "no limit".
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
})

const pv = (n: number, path = `/p${n}`): VisitEvent => ({ timestamp: new Date(Date.UTC(2026, 10, 20, 10, n)).toISOString(), type: 'pageview', event_name: 'pageview', path, duration: 5, scroll_depth: null })
const ev = (n: number, name: string): VisitEvent => ({ timestamp: new Date(Date.UTC(2026, 10, 20, 10, n, 30)).toISOString(), type: 'custom', event_name: name, path: `/p${n}`, duration: null, scroll_depth: null })

describe('layoutMarks', () => {
  const visits = dayPages([{ steps: [pv(1), pv(2), ev(2, 'signup'), pv(3)] }, { steps: [pv(4), pv(5)] }])

  it('lays every page out left to right with no limit, a visit apart from the next', () => {
    const { marks, full } = layoutMarks(visits, 12, 0)
    expect(full).toBe(true)
    expect(marks.map((m) => [m.visit, m.at])).toEqual([[0, 0], [0, 1], [0, 2], [1, 0], [1, 1]])
    const xs = marks.map((m) => m.cx)
    expect(xs).toEqual([...xs].sort((a, b) => a - b))
    // Dot to dot (pages where nothing happened), the step into the next visit is a step within a visit and the
    // visits' gap (10 px) more.
    const dots = layoutMarks(dayPages([{ steps: [pv(1), pv(2)] }, { steps: [pv(3)] }]), 12, 0).marks.map((m) => m.cx)
    expect(dots[2] - dots[1]).toBeCloseTo(dots[1] - dots[0] + 10)
  })

  it('stops at the room it has and says it is not whole', () => {
    const { marks, full } = layoutMarks(visits, 12, 40)
    expect(full).toBe(false)
    expect(marks.length).toBeGreaterThan(0)
    expect(marks.length).toBeLessThan(5)
    for (const m of marks) expect(m.cx).toBeLessThan(40)
  })

  it('draws at most the cap whatever its room', () => {
    const many = dayPages([{ steps: Array.from({ length: 20 }, (_, i) => pv(i)) }])
    expect(layoutMarks(many, 12, 0).marks).toHaveLength(12)
  })
})

describe('marksSaid', () => {
  it('says the visits, the pages and each own event with its page', () => {
    const visits = dayPages([{ steps: [pv(1), pv(2), ev(2, 'signup')] }, { steps: [pv(4)] }])
    expect(marksSaid(visits)).toBe('2 visits, 3 pages, signup on /p2.')
  })
})

describe('DayMarks', () => {
  it('draws a mark a page and "+n" for the pages past its cap', () => {
    const day: VisitorDayVisit[] = [{ steps: Array.from({ length: 15 }, (_, i) => pv(i)) }]
    const { container } = render(<DayMarks day={day} />)
    expect(container.querySelectorAll('[data-mark]')).toHaveLength(12)
    expect(container.querySelector('[data-marks-more]')).toHaveTextContent('+3')
  })

  it('lights the site\'s own event solid and what Pulse captured in a ring', () => {
    const outbound: VisitEvent = { ...ev(2, 'outbound_link'), properties: { url: 'https://example.test/', page_path: '/p2' } }
    const { container } = render(<DayMarks day={[{ steps: [pv(1), ev(1, 'signup'), pv(2), outbound] }]} />)
    expect(Array.from(container.querySelectorAll('[data-mark]')).map((m) => m.getAttribute('data-mark'))).toEqual(['own', 'outbound'])
    expect(container.querySelector('[data-mark-disc="own"]')).not.toBeNull()
    expect(container.querySelector('[data-mark-disc="ring"]')).not.toBeNull()
  })
})
