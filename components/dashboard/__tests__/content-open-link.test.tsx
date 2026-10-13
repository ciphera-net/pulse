import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ContentStats from '@/components/dashboard/ContentStats'
import type { TopPage } from '@/lib/api/stats'

// PUL-22 (13-10-2026): the Content card opens a page from the same device as
// the Referrers card (PUL-20): the row filters, one labelled 14 px icon after
// the path opens the page. Before it, the row was a role="button" div with an
// unlabelled 12 px link nested inside, invisible under keyboard focus. Real
// Cascade is left UNMOCKED, as in referrer-open-link.test.tsx, because the
// point is the real DOM (the overlay + anchor split, RowBar's pointer-events).
vi.mock('@/lib/swr/dashboard', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>()
  return { ...mod, useFullDimensionList: () => ({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }) }
})

// Distinct visitors and views: the Pages tab shows both (twin columns).
const page = (path: string, pv: number, v: number): TopPage => ({ path, pageviews: pv, visitors: v, bounce_rate: null, avg_duration: null })
const props = {
  topPages: [page('/pricing', 40, 31), page('/blog', 20, 17)],
  entryPages: [] as TopPage[],
  exitPages: [] as TopPage[],
  domain: 'ciphera.net',
  siteId: 'site-1',
  dateRange: { start: '2026-07-20', end: '2026-08-18' },
  totals: { pageviews: 100, visitors: 80 },
}

describe('ContentStats: the row filters, an icon opens the page (PUL-22)', () => {
  it('each row renders a labelled icon link with the right href, target and rel', () => {
    render(<ContentStats {...props} onFilter={vi.fn()} />)
    const link = screen.getByRole('link', { name: 'Open /pricing in a new tab' })
    expect(link.getAttribute('href')).toBe('https://ciphera.net/pricing')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    // The link is the icon alone: the path is NOT inside it.
    expect(link.textContent).toBe('')
    expect(link.querySelector('svg')).toBeTruthy()
    const path = screen.getByText('/pricing')
    expect(path.closest('a')).toBeNull()
    expect((path.parentElement as HTMLElement).className).toContain('pointer-events-none')
  })

  it('the icon is the Referrers device: hidden at rest, shown on row hover, keyboard focus and touch, orange on hover', () => {
    render(<ContentStats {...props} onFilter={vi.fn()} />)
    const cls = screen.getByRole('link', { name: 'Open /pricing in a new tab' }).className.split(' ')
    for (const c of ['opacity-0', 'group-hover:opacity-100', 'focus-visible:opacity-100', '[@media(hover:none)]:opacity-100', 'pointer-events-auto', 'p-1', '-m-1', 'hover:text-brand-ink']) {
      expect(cls).toContain(c)
    }
    // The same class list as the Referrers icon, so the two cannot drift apart
    // by accident: compared through the shared tokens above, plus the glyph.
    const svg = screen.getByRole('link', { name: 'Open /pricing in a new tab' }).querySelector('svg') as SVGElement
    expect(svg.getAttribute('class')).toContain('h-3.5')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })

  it('clicking the icon does not filter', () => {
    const onFilter = vi.fn()
    render(<ContentStats {...props} onFilter={onFilter} />)
    fireEvent.click(screen.getByRole('link', { name: 'Open /pricing in a new tab' }))
    expect(onFilter).not.toHaveBeenCalled()
  })

  it('clicking the overlay (the rest of the row) filters on the page', () => {
    const onFilter = vi.fn()
    render(<ContentStats {...props} onFilter={onFilter} />)
    fireEvent.click(screen.getByRole('button', { name: 'Filter by page: /blog' }))
    expect(onFilter).toHaveBeenCalledWith({ dimension: 'page', operator: 'is', values: ['/blog'] })
  })

  it('the numbers and the bar are pointer-events-none, so their clicks reach the overlay', () => {
    // jsdom cannot hit-test, so the static property the pass-through depends
    // on is what is pinned (see referrer-open-link.test.tsx for the reasoning).
    const { container } = render(<ContentStats {...props} onFilter={vi.fn()} />)
    const cluster = screen.getByText('31').closest('.ml-4') as HTMLElement
    expect(cluster).toBeTruthy()
    expect(cluster.className).toContain('pointer-events-none')
    const bars = Array.from(container.querySelectorAll('[aria-hidden="true"][class*="left-0.5"]'))
    expect(bars).toHaveLength(2)
    for (const bar of bars) expect(bar.className).toContain('pointer-events-none')
  })

  it('without onFilter the link still works and nothing else is interactive', () => {
    render(<ContentStats {...props} />)
    expect(screen.getByRole('link', { name: 'Open /pricing in a new tab' }).getAttribute('href')).toBe('https://ciphera.net/pricing')
    expect(screen.queryByRole('button', { name: /^Filter by page:/ })).toBeNull()
  })

  it('a domain stored with its scheme still yields one https:// URL', () => {
    render(<ContentStats {...props} domain="https://ciphera.net" onFilter={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Open /blog in a new tab' }).getAttribute('href')).toBe('https://ciphera.net/blog')
  })
})
