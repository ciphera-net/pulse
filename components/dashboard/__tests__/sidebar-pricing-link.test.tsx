// D43 (the marketing-app split, 01-10-2026): the home sidebar's Pricing item
// opens Settings → Billing for anyone who may see that tab (the plan switcher
// already lives there, `Change plan` → /switch) — and keeps going to the
// marketing /pricing page for a member without the permission, never to a
// tab that would just render "Access restricted".
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

let pathname = '/sites'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@/lib/swr/sites', () => ({
  useSites: () => ({ sites: [], isLoading: false, error: undefined, mutate: vi.fn() }),
  FaviconPreloader: () => null,
}))

let canBillingView = false
vi.mock('@/lib/auth/permissions', () => ({
  useCan: (perm: string) => (perm === 'billing.view' ? canBillingView : true),
}))
vi.mock('@/lib/sidebar-context', () => ({ useSidebar: () => ({ collapsed: false, toggle: vi.fn() }) }))
vi.mock('@/components/sites/SiteFavicon', () => ({ SiteFavicon: () => null }))
let teamState: 'alone' | 'team' | null = 'team'
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => teamState }))
vi.mock('@/components/support/HelpSupportButton', () => ({ HelpSupportButton: () => null }))

// See panel-footer-save.test.tsx: a bare `get: () => () => null` proxy MODULE
// hangs vitest, because the namespace object's `then` becomes a function and the
// dynamic import treats it as a never-resolving thenable.
vi.mock('@phosphor-icons/react', () =>
  new Proxy({}, {
    get: (_t, prop) => (prop === 'then' ? undefined : () => null),
    has: () => true,
  }),
)
vi.mock('@ciphera-net/facet', () =>
  new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined
      if (prop === 'Tooltip') {
        const Tooltip = ({ children }: any) => <>{children}</>
        Tooltip.displayName = 'Tooltip'
        return Tooltip
      }
      return () => null
    },
    has: () => true,
  }),
)

import Sidebar from '../Sidebar'

function renderSidebar() {
  return render(
    <Sidebar
      siteId={null}
      mobileOpen={false}
      onMobileClose={() => {}}
      onMobileOpen={() => {}}
      onOpenPalette={() => {}}
    />,
  )
}

beforeEach(() => {
  canBillingView = false
  pathname = '/sites'
  teamState = 'team'
})

describe('the home sidebar Pricing item', () => {
  it('opens Settings → Billing when the viewer has billing.view', () => {
    canBillingView = true
    renderSidebar()
    const pricing = screen.getByRole('link', { name: /Pricing/ })
    expect(pricing.getAttribute('href')).toBe('/settings/organization/billing')
  })

  it('opens the marketing /pricing page without billing.view', () => {
    canBillingView = false
    renderSidebar()
    const pricing = screen.getByRole('link', { name: /Pricing/ })
    expect(pricing.getAttribute('href')).toBe('/pricing')
  })

  it('keeps its label and icon either way — only the destination changes', () => {
    canBillingView = true
    renderSidebar()
    expect(screen.getByText('Pricing')).toBeInTheDocument()
  })
})
