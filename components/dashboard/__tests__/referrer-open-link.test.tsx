import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Sources from '@/components/dashboard/Sources'

// PULSE-197: a referrer row's own name opens the referring site (owner pick
// B). Real Cascade (CascadeGroup/CascadeRow/RowBar) is left UNMOCKED here,
// unlike dimension-cards.test.tsx — the whole point of this file is to pin
// the real DOM structure (the overlay button + anchor split, and that RowBar
// itself carries pointer-events-none), which a RowBar stub would hide.
vi.mock('@/lib/swr/dashboard', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>()
  return { ...mod, useFullDimensionList: () => ({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }) }
})

const dateRange = { start: '2026-07-20', end: '2026-08-18' }
const totals = { pageviews: 453, visitors: 314 }

// One website row (Google — a known registry brand), one non-website row
// (Shared Link), matching the shape the approved mock exercised on real data.
const referrers = [
  { referrer: 'google.com', pageviews: 95, visitors: 53 },
  { referrer: 'Shared Link', pageviews: 137, visitors: 64 },
]

describe('Sources — Referrers tab: a website row\'s name opens the site (PULSE-197)', () => {
  it('a website row renders an anchor with the right href, target, and rel', () => {
    render(<Sources referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} onFilter={vi.fn()} />)
    const link = screen.getByRole('link', { name: /Open Google in a new tab/i })
    expect(link.getAttribute('href')).toBe('https://google.com/')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    // Still carries the visible name, so the row's rest-state content is
    // unchanged from today — the link doesn't replace what's shown, only
    // what the favicon+name element now additionally does.
    expect(link.textContent).toBe('Google')
  })

  it('clicking the anchor does not call onFilter', () => {
    const onFilter = vi.fn()
    render(<Sources referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} onFilter={onFilter} />)
    const link = screen.getByRole('link', { name: /Open Google in a new tab/i })
    fireEvent.click(link)
    expect(onFilter).not.toHaveBeenCalled()
  })

  it('clicking the overlay (the rest of the row) still filters with today\'s exact filter', () => {
    const onFilter = vi.fn()
    render(<Sources referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} onFilter={onFilter} />)
    const overlay = screen.getByRole('button', { name: 'Filter by referrer: Google' })
    fireEvent.click(overlay)
    expect(onFilter).toHaveBeenCalledWith({ dimension: 'referrer', operator: 'is', values: ['google.com'] })
  })

  it('the number side (MetricRowStat) is pointer-events-none, so its clicks pass through to the overlay', () => {
    // jsdom has no real layout/hit-testing, so a click fired directly at a
    // pointer-events-none node cannot be made to prove the pass-through the
    // way a real browser would (fireEvent dispatches straight at the node and
    // only bubbles to ANCESTORS, which would pass even if pointer-events were
    // missing). What's actually verifiable here, and what the pass-through
    // depends on, is the static property: the stat cluster's own root must
    // carry pointer-events-none, or a real click on it would be captured by
    // MetricRowStat itself instead of reaching the overlay underneath.
    render(<Sources referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} onFilter={vi.fn()} />)
    const stat = screen.getByText('53')
    const cluster = stat.closest('.ml-4') as HTMLElement
    expect(cluster).toBeTruthy()
    expect(cluster.className).toContain('pointer-events-none')
  })

  it('a non-website row renders no anchor and still filters the whole row on click', () => {
    const onFilter = vi.fn()
    render(<Sources referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} onFilter={onFilter} />)
    expect(screen.queryByRole('link', { name: /Open Shared Link/i })).toBeNull()
    const overlay = screen.getByRole('button', { name: 'Filter by referrer: Shared Link' })
    fireEvent.click(overlay)
    expect(onFilter).toHaveBeenCalledWith({ dimension: 'referrer', operator: 'is', values: ['Shared Link'] })
    // Its label text is a plain pointer-events-none div, not an anchor — the
    // static property the pass-through above depends on, for the label side.
    const label = screen.getByText('Shared Link')
    const labelBox = label.closest('.gap-3') as HTMLElement
    expect(labelBox.tagName).toBe('DIV')
    expect(labelBox.className).toContain('pointer-events-none')
  })

  it('RowBar carries pointer-events-none in the referrer row', () => {
    const { container } = render(<Sources referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} onFilter={vi.fn()} />)
    // `left-0.5` is RowBar's own, otherwise-unused class in this card — a
    // stable way to find exactly its two instances (one per row) without
    // also catching the page-filler divs (also aria-hidden) or an icon svg
    // (also absolute-positioned in some other card, though not this one).
    const bars = Array.from(container.querySelectorAll('[aria-hidden="true"][class*="left-0.5"]'))
    expect(bars).toHaveLength(2)
    for (const bar of bars) {
      expect(bar.className).toContain('pointer-events-none')
    }
  })

  it('when onFilter is undefined, the label is still a link for website rows and nothing else is interactive', () => {
    render(<Sources referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} />)
    // The website row's link still works with no onFilter.
    const link = screen.getByRole('link', { name: /Open Google in a new tab/i })
    expect(link.getAttribute('href')).toBe('https://google.com/')
    // No overlay/filter button anywhere in the referrers list.
    expect(screen.queryByRole('button', { name: /^Filter by referrer:/ })).toBeNull()
  })

  it('a dotted but unregistered brand still opens (the dot alone makes it a website)', () => {
    const withUnknownHost = [{ referrer: 'uneed.best', pageviews: 10, visitors: 8 }]
    render(<Sources referrers={withUnknownHost} siteId="site-1" dateRange={dateRange} totals={totals} onFilter={vi.fn()} />)
    const link = screen.getByRole('link', { name: /Open Uneed in a new tab/i })
    expect(link.getAttribute('href')).toBe('https://uneed.best/')
  })

  it('an in-app label matching no registry brand never grows a link', () => {
    // getReferrerDisplayName's own (pre-existing, unrelated to this change)
    // capitalization falls out of treating an unmatched bare word as a
    // one-label "hostname" for DISPLAY purposes — "SomeInAppWidget" renders
    // as "Someinappwidget". getOpenHostname does NOT follow that path (no dot
    // means it goes straight to the registry check, never a URL parse), which
    // is exactly why it needed its own rule instead of reusing
    // getReferrerHostname — see the referrer-logic.mjs header.
    const withAppName = [{ referrer: 'SomeInAppWidget', pageviews: 10, visitors: 8 }]
    render(<Sources referrers={withAppName} siteId="site-1" dateRange={dateRange} totals={totals} onFilter={vi.fn()} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Someinappwidget')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Filter by referrer: Someinappwidget' })).toBeTruthy()
  })
})
