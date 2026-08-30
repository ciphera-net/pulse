import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VisitTrail } from '../VisitTrail'
import type { VisitEvent, VisitEventsResponse } from '@/lib/api/visitors'

/**
 * The trail's "Load more" shipped REPLACING the visible steps instead of
 * appending them: a 242-step visit rendered steps 201–242, the button
 * disappeared, and the counter read "242 of 242" — a trail that looks complete
 * with its beginning gone. The component's own comment forbids exactly that
 * failure in the other direction, which is why nobody looked.
 *
 * These tests pin the append, and they pin the trap that makes the naive append
 * wrong: the hook sets `keepPreviousData: true`, so right after a click SWR
 * still serves the PREVIOUS page's payload while the local page counter has
 * already moved on.
 */

const hook = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useVisitEvents: (...args: unknown[]) => hook(...args),
}))

function step(path: string): VisitEvent {
  return {
    timestamp: `2026-08-30T10:00:00Z`,
    type: 'pageview',
    event_name: 'pageview',
    path,
    duration: null,
    scroll_depth: null,
  }
}

function payload(page: number, events: VisitEvent[], total: number): VisitEventsResponse {
  return { events, total, page, page_size: 200 }
}

const PAGE_1 = [step('/one'), step('/two')]
const PAGE_2 = [step('/three'), step('/four')]

function renderTrail() {
  return render(
    <VisitTrail
      siteId="site-1"
      visitorKey={'a'.repeat(32)}
      visitKey={`${'b'.repeat(32)}:1`}
      range={{ startDate: '2026-08-26', endDate: '2026-08-30' }}
    />,
  )
}

beforeEach(() => hook.mockReset())

describe('VisitTrail pagination', () => {
  it('APPENDS the second page — the first page must survive Load more', async () => {
    hook.mockImplementation((_s, _k, _v, _r, page: number) =>
      page === 1
        ? { data: payload(1, PAGE_1, 4), error: undefined, isLoading: false }
        : { data: payload(2, PAGE_2, 4), error: undefined, isLoading: false },
    )

    renderTrail()
    expect(screen.getByText('/one')).toBeTruthy()
    expect(screen.getByText('/two')).toBeTruthy()
    expect(screen.getByText('showing 2 of 4 steps')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(screen.getByText('/three')).toBeTruthy())
    // 🔴 The assertion the bug fails. Without the accumulator these two are gone.
    expect(screen.queryByText('/one'), 'step 1 disappeared after Load more').toBeTruthy()
    expect(screen.queryByText('/two'), 'step 2 disappeared after Load more').toBeTruthy()
    expect(screen.getByText('/four')).toBeTruthy()
    // Every step is loaded, so the button retires and the counter agrees.
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('does not duplicate or misfile a page when SWR re-serves the previous one', async () => {
    // keepPreviousData: after the click the hook is called with page=2 but SWR
    // hands back the page-1 payload until the request lands. An accumulator
    // keyed on the LOCAL page would file /one and /two under page 2; a naive
    // [...prev, ...next] append would render them twice.
    let stale = true
    hook.mockImplementation((_s, _k, _v, _r, page: number) => {
      if (page === 1) return { data: payload(1, PAGE_1, 4), error: undefined, isLoading: false }
      if (stale) return { data: payload(1, PAGE_1, 4), error: undefined, isLoading: false }
      return { data: payload(2, PAGE_2, 4), error: undefined, isLoading: false }
    })

    const { rerender } = renderTrail()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    // Still stale: exactly one copy of each step-1 row, and no step-2 rows yet.
    await waitFor(() => expect(screen.getAllByText('/one')).toHaveLength(1))
    expect(screen.getAllByText('/two')).toHaveLength(1)
    expect(screen.queryByText('/three')).toBeNull()

    stale = false
    rerender(
      <VisitTrail
        siteId="site-1"
        visitorKey={'a'.repeat(32)}
        visitKey={`${'b'.repeat(32)}:1`}
        range={{ startDate: '2026-08-26', endDate: '2026-08-30' }}
      />,
    )
    await waitFor(() => expect(screen.getByText('/three')).toBeTruthy())
    expect(screen.getAllByText('/one'), 'step 1 rendered twice').toHaveLength(1)
    expect(screen.getAllByText('/three')).toHaveLength(1)
  })

  it('resets when the visit changes — one visit must not inherit another\'s steps', async () => {
    hook.mockImplementation((_s, _k, _v, _r, page: number) =>
      page === 1
        ? { data: payload(1, PAGE_1, 4), error: undefined, isLoading: false }
        : { data: payload(2, PAGE_2, 4), error: undefined, isLoading: false },
    )
    const { rerender } = renderTrail()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getByText('/three')).toBeTruthy())

    hook.mockImplementation(() => ({
      data: payload(1, [step('/other-visit')], 1),
      error: undefined,
      isLoading: false,
    }))
    rerender(
      <VisitTrail
        siteId="site-1"
        visitorKey={'a'.repeat(32)}
        visitKey={`${'c'.repeat(32)}:1`}
        range={{ startDate: '2026-08-26', endDate: '2026-08-30' }}
      />,
    )
    await waitFor(() => expect(screen.getByText('/other-visit')).toBeTruthy())
    expect(screen.queryByText('/one'), 'the previous visit\'s steps leaked into this one').toBeNull()
    expect(screen.queryByText('/three')).toBeNull()
  })

  it('renders an em dash, not a slash, when the site collects no page paths', () => {
    // A MEASURED duration, so the dwell cell reads "45s" and the only em dash on
    // screen is the path's. Without it both cells render "—" and the assertion
    // cannot tell which one it found — it would pass on a step whose path
    // rendered fine and whose beacon was simply missing.
    hook.mockImplementation(() => ({
      data: payload(1, [{ ...step('/x'), path: null, duration: 45 }], 1),
      error: undefined,
      isLoading: false,
    }))
    const { container } = renderTrail()
    expect(screen.getByText('45s'), 'the dwell cell should carry the only measured value').toBeTruthy()

    const cells = Array.from(container.querySelectorAll('span')).map((s) => s.textContent)
    expect(cells, 'a suppressed path must render an em dash').toContain('—')
    expect(cells, 'a suppressed path must not fall back to a slash').not.toContain('/')
    expect(cells).not.toContain('/x')
  })
})
