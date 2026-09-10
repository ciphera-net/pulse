import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VisitTrail } from '../VisitTrail'
import type { VisitEvent, VisitEventsResponse } from '@/lib/api/visitors'

/**
 * Round 6 (owner, 10-09-2026): events group under the page they fired on, the
 * card carries per-type filter chips, and the two event types Pulse captures
 * itself are described in words.
 *
 * The grouping and labelling RULES are unit-tested in lib/visitors/__tests__/
 * trail.test.ts, where they can be mutation-tested cheaply. These tests cover
 * only what needs a rendered component: the chips, their interaction, and the
 * one geometry assertion jsdom can actually make.
 */

const hook = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useVisitEvents: (...args: unknown[]) => hook(...args),
}))

function ev(name: string, path: string | null, ts: string, properties?: Record<string, string>, duration: number | null = null): VisitEvent {
  return {
    timestamp: ts,
    type: name === 'pageview' ? 'pageview' : 'custom',
    event_name: name,
    path,
    properties,
    duration,
    scroll_depth: null,
  }
}

const TRAIL: VisitEvent[] = [
  ev('pageview', '/pricing', 't1', undefined, 9),
  ev('outbound_link', '/pricing', 't2', { url: 'https://stripe.com/pricing', page_path: '/pricing' }),
  ev('welcome_step_view', '/pricing', 't3', { step: '2' }),
  ev('pageview', '/docs', 't4', undefined, 4),
  ev('file_download', '/docs', 't5', { url: 'https://ciphera.net/files/price-list.pdf', page_path: '/docs' }),
]

function payload(events: VisitEvent[]): VisitEventsResponse {
  return { events, total: events.length, page: 1, page_size: 200, site_timezone: 'Europe/Brussels' }
}

function renderTrail() {
  return render(
    <VisitTrail
      siteId="site-1"
      visitorKey={'a'.repeat(32)}
      visitKey={`${'b'.repeat(32)}:1`}
      range={{ startDate: '2026-09-01', endDate: '2026-09-10' }}
    />,
  )
}

beforeEach(() => {
  hook.mockReset()
  hook.mockReturnValue({ data: payload(TRAIL), error: undefined, isLoading: false })
})

describe('VisitTrail round 6', () => {
  it('describes the events Pulse captured itself, in words', () => {
    renderTrail()
    expect(screen.getByText('Left for stripe.com/pricing')).toBeInTheDocument()
    expect(screen.getByText('Downloaded price-list.pdf')).toBeInTheDocument()
  })

  it('shows NO url or page_path chip beside a described event', () => {
    const { container } = renderTrail()
    // page_path duplicates the row's own path and the url is in the sentence.
    expect(container.textContent).not.toContain('page_path')
    expect(container.textContent).not.toContain('url:')
    // a customer event still shows every property, unchanged (D6)
    expect(screen.getByText('step: 2')).toBeInTheDocument()
  })

  it('keeps a customer event as its name chip, in monospace', () => {
    renderTrail()
    const chip = screen.getByText('welcome_step_view')
    expect(chip.className).toContain('font-mono')
  })

  it('renders a chip per present kind, with counts over every loaded step', () => {
    renderTrail()
    for (const [label, n] of [['Pages', '2'], ['Outbound', '1'], ['Downloads', '1'], ['Events', '1']] as const) {
      const chip = screen.getByRole('button', { name: new RegExp(`^${label}\\s*${n}$`) })
      expect(chip).toHaveAttribute('aria-pressed', 'true')
    }
  })

  it('does not render a chip for a kind this visit has none of', () => {
    hook.mockReturnValue({
      data: payload([ev('pageview', '/a', 't1', undefined, 3), ev('pageview', '/b', 't2', undefined, 4)]),
      error: undefined,
      isLoading: false,
    })
    renderTrail()
    // A single kind needs no filter at all — one chip is not a control.
    expect(screen.queryByRole('button', { name: /Outbound/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Pages/ })).not.toBeInTheDocument()
  })

  it('filtering a kind off hides its steps and leaves its COUNT alone', () => {
    renderTrail()
    const events = screen.getByRole('button', { name: /^Events\s*1$/ })
    fireEvent.click(events)
    expect(events).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText('welcome_step_view')).not.toBeInTheDocument()
    // 🔴 The count must NOT become 0: a chip whose own count dropped when you
    // clicked it could never be clicked back.
    expect(screen.getByRole('button', { name: /^Events\s*1$/ })).toBeInTheDocument()
    // and the described events are untouched
    expect(screen.getByText('Left for stripe.com/pricing')).toBeInTheDocument()
  })

  it('refuses to switch the LAST kind off — an empty trail lies', () => {
    const { container } = renderTrail()
    // Clicked in this order the survivor is Events, but the assertion must not
    // depend on that — which order survives is an implementation detail, and
    // naming the wrong one is how the first version of this test failed.
    for (const label of ['Pages', 'Outbound', 'Downloads', 'Events']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }))
    }
    const pressed = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
    expect(pressed).toHaveLength(1)
    // and whatever survived, the trail still shows rows rather than nothing
    expect(container.querySelectorAll('div.relative.flex').length).toBeGreaterThan(0)
  })

  it('with Pages off, the surviving events each get their own row', () => {
    renderTrail()
    fireEvent.click(screen.getByRole('button', { name: /^Pages\s*2$/ }))
    // the page paths are gone from the rows
    expect(screen.queryByText('/docs')).not.toBeInTheDocument()
    // the events are not
    expect(screen.getByText('Left for stripe.com/pricing')).toBeInTheDocument()
    expect(screen.getByText('welcome_step_view')).toBeInTheDocument()
  })

  /**
   * 🔴 THE RAIL FIX. jsdom has no layout, so the 12px misalignment cannot be
   * measured here — it was measured on production (rail centre 314.5px, dot
   * centre 326.5px) and is re-measured in the browser harness. What CAN be
   * pinned is that the rail is no longer positioned by the old constant: it
   * sits at half the node's width past the row's padding, and is translated
   * back onto its own centre.
   */
  it('positions the rail on the node it connects, not 12px to its left', () => {
    const { container } = renderTrail()
    const rails = [...container.querySelectorAll('span.absolute')]
    expect(rails.length).toBeGreaterThan(0)
    for (const r of rails) {
      expect(r.className).toContain('left-[19.5px]')
      expect(r.className).toContain('-translate-x-1/2')
      expect(r.className).not.toContain('left-[7px]')
    }
  })
})
