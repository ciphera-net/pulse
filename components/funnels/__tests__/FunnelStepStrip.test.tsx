import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

// The drop-off pane's "View journeys from here" link (PUL-34): it goes to the Journeys page
// of the scope the funnel is drawn in, and only when that scope shares Journeys. A link to a
// page the site's owner did not share would end on "not available".

// jsdom has no ResizeObserver (the panes' height morph measures with one).
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
})

vi.mock('@/lib/swr/dashboard', () => ({
  useFunnelBreakdown: () => ({ data: { entries: [] }, error: undefined, isLoading: false, mutate: vi.fn() }),
}))
vi.mock('@/lib/utils/icons', () => ({ getFilterValueIcon: () => null }))
vi.mock('@/components/ui/compact-number', () => ({ CompactNumber: ({ value }: { value: number | null }) => <span>{value}</span> }))
vi.mock('@/components/ui/select', () => ({ default: () => <div data-testid="select" /> }))
vi.mock('@/components/dashboard/MetricInfoTip', () => ({ TermInfoTip: () => null }))
vi.mock('@/components/funnels/FunnelColumns', () => ({ formatFunnelPct: (v: number) => `${v}%` }))
vi.mock('framer-motion', () => ({
  motion: { div: ({ children, className }: { children?: React.ReactNode; className?: string }) => <div className={className}>{children}</div> },
}))

import { FunnelStepStrip } from '../FunnelStepStrip'
import { SITE_PAGES, SiteScopeProvider, memberScope, type SiteScope } from '@/lib/scope/SiteScope'
import type { FunnelStepStats } from '@/lib/api/funnels'

afterEach(cleanup)

const member = memberScope('site-1')
const demo: SiteScope = {
  siteId: 'demo-site', mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full',
}
const demoWithoutJourneys: SiteScope = { ...demo, pages: ['dashboard', 'funnels'] }

const step = (over: Partial<FunnelStepStats['step']> & { visitors?: number } = {}): FunnelStepStats => ({
  step: { order: 0, name: 'Pricing', value: '/pricing', type: 'exact', category: 'page', ...over },
  visitors: over.visitors ?? 100,
  dropoff: null,
  conversion: 100,
  exit_pages: [{ path: '/blog', visitors: 30 }],
})

const renderStrip = (scope: SiteScope, steps: FunnelStepStats[]) =>
  render(
    <SiteScopeProvider scope={scope}>
      <FunnelStepStrip
        siteId={scope.siteId}
        funnelId="f1"
        steps={steps}
        selectedStep={1}
        dateRange={{ start: '2026-07-27', end: '2026-08-26' }}
      />
    </SiteScopeProvider>,
  )

const TWO_STEPS = [step(), step({ order: 1, name: 'Signup', value: '/signup', visitors: 40 })]

describe('FunnelStepStrip: View journeys from here', () => {
  it('links into the member\'s Journeys page, entering at the step\'s page', () => {
    renderStrip(member, TWO_STEPS)
    expect(screen.getByRole('link', { name: /View journeys from here/ })).toHaveAttribute(
      'href',
      '/sites/site-1/journeys?entry=%2Fpricing',
    )
  })

  it('links into the demo\'s own Journeys page', () => {
    renderStrip(demo, TWO_STEPS)
    expect(screen.getByRole('link', { name: /View journeys from here/ })).toHaveAttribute(
      'href',
      '/demo/journeys?entry=%2Fpricing',
    )
  })

  it('offers no link into a Journeys page the scope does not share', () => {
    renderStrip(demoWithoutJourneys, TWO_STEPS)
    expect(screen.queryByRole('link')).toBeNull()
    // The rest of the pane is unaffected.
    expect(screen.getByText('/blog')).toBeInTheDocument()
  })

  it.each([
    ['an event step', step({ category: 'event', value: 'signup' })],
    ['a step matched by substring', step({ type: 'contains' })],
    ['a step matched by regex', step({ type: 'regex' })],
  ])('offers no link for %s, in any scope', (_name, first) => {
    renderStrip(demo, [first, step({ order: 1, value: '/signup', visitors: 40 })])
    expect(screen.queryByRole('link')).toBeNull()
  })
})
