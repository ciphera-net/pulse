import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// The Pages page under each scope. The site comes from the scope and never from the route (useParams throws here); a
// scope that serves the page draws the list (its own suite: components/pages/list/__tests__), the demo included; a
// scope that does not serve it says so plainly and mounts nothing that reads. No beta is asked about: the list went to
// every team on 23-11-2026.

const mockUseFeature = vi.fn()

vi.mock('next/navigation', () => ({
  useParams: () => {
    throw new Error('a surface reads the site from the scope, never from useParams')
  },
}))
// The list says which site it was handed.
vi.mock('@/components/pages/list/PagesListPage', () => ({
  default: ({ siteId }: { siteId: string }) => <div data-testid="list-page">{siteId}</div>,
}))
vi.mock('@/lib/features', () => ({ useFeature: (flag: string) => mockUseFeature(flag) }))

import PagesSurface from '../PagesSurface'
import { SITE_PAGES, SiteScopeProvider, memberScope, type SiteScope } from '@/lib/scope/SiteScope'

const member = memberScope('site-1')
const demo: SiteScope = {
  siteId: 'demo-site', mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full',
}
const customerLink: SiteScope = {
  siteId: 'cust-site', mode: 'public', basePath: '/share/cust-site', pages: ['dashboard'], demo: false, fidelity: 'scoped',
}
// A scoped link whose shared pages list this one: the server serves a scoped link the dashboard family only, so the
// page must not ask for what it would be refused.
const scopedLinkListingThePage: SiteScope = { ...customerLink, pages: SITE_PAGES }
const demoWithoutPages: SiteScope = { ...demo, pages: ['dashboard', 'funnels'] }

const renderUnder = (scope: SiteScope) =>
  render(
    <SiteScopeProvider scope={scope}>
      <PagesSurface />
    </SiteScopeProvider>,
  )

beforeEach(() => {
  mockUseFeature.mockReset().mockReturnValue(false)
})

describe('PagesSurface', () => {
  it('draws the list for a member, on the member\'s site, asking about no beta', () => {
    renderUnder(member)
    expect(screen.getByTestId('list-page')).toHaveTextContent('site-1')
    expect(mockUseFeature).not.toHaveBeenCalled()
  })

  it('draws the list on the demo, on the scope\'s site', () => {
    renderUnder(demo)
    expect(screen.getByTestId('list-page')).toHaveTextContent('demo-site')
  })

  it.each([
    ['a customer link (scoped fidelity)', customerLink],
    ['a scoped link that lists the page anyway', scopedLinkListingThePage],
    ['a scope whose owner did not share pages', demoWithoutPages],
  ])('%s says so plainly and mounts no list', (_name, scope) => {
    renderUnder(scope)
    // The shell's one state for a page this scope does not show (components/public/states.tsx).
    expect(screen.getByRole('heading', { name: "This page isn't shared." })).toBeInTheDocument()
    expect(screen.queryByTestId('list-page')).toBeNull()
  })
})
