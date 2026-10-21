import React, { useEffect } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Which page component a public address renders, and when it renders none: the router under
// /demo and /share/<id> (PUL-34). The surfaces are markers; the scope is real.
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...rest}>{children}</a>,
}))

const mounts = vi.hoisted(() => ({ funnel: 0 }))
vi.mock('@/components/surfaces/DashboardSurface', () => ({ default: () => <div data-testid="surface-dashboard" /> }))
vi.mock('@/components/surfaces/PagesSurface', () => ({ default: () => <div data-testid="surface-pages" /> }))
vi.mock('@/components/surfaces/JourneysSurface', () => ({ default: () => <div data-testid="surface-journeys" /> }))
vi.mock('@/components/surfaces/FunnelsSurface', () => ({ default: () => <div data-testid="surface-funnels" /> }))
vi.mock('@/components/surfaces/PerformanceSurface', () => ({ default: () => <div data-testid="surface-performance" /> }))
vi.mock('@/components/surfaces/UptimeSurface', () => ({ default: () => <div data-testid="surface-uptime" /> }))
vi.mock('@/components/surfaces/SearchSurface', () => ({ default: () => <div data-testid="surface-search" /> }))
vi.mock('@/components/surfaces/CdnSurface', () => ({ default: () => <div data-testid="surface-cdn" /> }))
vi.mock('@/components/surfaces/FunnelDetailSurface', () => {
  function FunnelDetailMock({ funnelId }: { funnelId?: string }) {
    useEffect(() => {
      mounts.funnel += 1
    }, [])
    return <div data-testid="surface-funnel-detail" data-funnel={funnelId} />
  }
  return { default: FunnelDetailMock }
})

import PublicPage from '@/components/public/PublicPage'
import { SITE_PAGES, SiteScopeProvider, type SiteScope } from '@/lib/scope/SiteScope'

const scopeOf = (overrides: Partial<SiteScope> = {}): SiteScope => ({
  siteId: 'site-1', mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full', ...overrides,
})

function renderAt(segments: string[], scope: SiteScope = scopeOf()) {
  return render(
    <SiteScopeProvider scope={scope}>
      <PublicPage segments={segments} />
    </SiteScopeProvider>,
  )
}

const surfaces = () => screen.queryAllByTestId(/^surface-/)

describe('PublicPage: the pages', () => {
  it('renders the dashboard at the base path and each other page at its own segment', () => {
    for (const [segments, expected] of [
      [[], 'dashboard'], [['pages'], 'pages'], [['journeys'], 'journeys'], [['funnels'], 'funnels'],
      [['performance'], 'performance'], [['uptime'], 'uptime'], [['search'], 'search'], [['cdn'], 'cdn'],
    ] as const) {
      const { unmount } = renderAt([...segments])
      expect(surfaces().map((el) => el.getAttribute('data-testid')), expected).toEqual([`surface-${expected}`])
      unmount()
    }
  })

  it('renders one funnel with its id', () => {
    renderAt(['funnels', 'f-42'])
    expect(screen.getByTestId('surface-funnel-detail')).toHaveAttribute('data-funnel', 'f-42')
    expect(surfaces()).toHaveLength(1)
  })

  it('treats a different funnel as a different page: it mounts again', () => {
    mounts.funnel = 0
    const view = renderAt(['funnels', 'a'])
    expect(mounts.funnel).toBe(1)
    view.rerender(
      <SiteScopeProvider scope={scopeOf()}>
        <PublicPage segments={['funnels', 'b']} />
      </SiteScopeProvider>,
    )
    expect(screen.getByTestId('surface-funnel-detail')).toHaveAttribute('data-funnel', 'b')
    expect(mounts.funnel).toBe(2)
  })

  it('serves a share link the same way', () => {
    renderAt(['uptime'], scopeOf({ basePath: '/share/site-1', demo: false, fidelity: 'scoped' }))
    expect(screen.getByTestId('surface-uptime')).toBeInTheDocument()
  })
})

describe("PublicPage: what is not shared", () => {
  it("shows the not-shared state, and no page, for a page the scope does not share", () => {
    renderAt(['funnels'], scopeOf({ pages: ['dashboard', 'pages'] }))
    expect(screen.getByRole('heading', { name: "This page isn't shared." })).toBeInTheDocument()
    expect(surfaces()).toHaveLength(0)
  })

  it('does not even try a funnel when funnels are not shared', () => {
    renderAt(['funnels', 'f-1'], scopeOf({ pages: ['dashboard'] }))
    expect(screen.getByRole('heading', { name: "This page isn't shared." })).toBeInTheDocument()
    expect(surfaces()).toHaveLength(0)
  })

  it('links back to the shared dashboard, under the scope', () => {
    renderAt(['cdn'], scopeOf({ pages: ['dashboard'], basePath: '/share/site-1', demo: false }))
    expect(screen.getByRole('link', { name: 'Go to the shared dashboard' })).toHaveAttribute('href', '/share/site-1')
  })

  it('links to the first page that is shared when the dashboard is not', () => {
    renderAt([], scopeOf({ pages: ['funnels', 'cdn'], basePath: '/demo' }))
    expect(screen.getByRole('link', { name: 'Go to what is shared' })).toHaveAttribute('href', '/demo/funnels')
  })

  it('has nowhere to link when nothing is shared', () => {
    renderAt([], scopeOf({ pages: [] }))
    expect(screen.getByRole('heading', { name: "This page isn't shared." })).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  // Every address that is not a page of the public surface, whatever the scope shares.
  it.each([
    [['funnels', 'new']],
    [['funnels', 'f-1', 'edit']],
    [['visitors']],
    [['visitors', 'k']],
    [['settings']],
    [['dashboard']],
    [['pagespeed']],
    [['nonsense']],
    [['pages', 'extra']],
  ])('never renders a page for /%j, even when every page is shared', (segments) => {
    renderAt(segments as string[])
    expect(screen.getByRole('heading', { name: "This page isn't shared." })).toBeInTheDocument()
    expect(surfaces()).toHaveLength(0)
  })
})
