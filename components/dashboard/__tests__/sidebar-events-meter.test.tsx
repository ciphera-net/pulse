// The sidebar's events card (owner pick 09-11-2026, Pulse/docs/plans/08-11-2026-sidebar-events-meter.md): for anyone
// who may see billing, this month's events sit above Help & Support, as an outlined card with the ring when the sidebar
// is open and as the ring alone when it is collapsed. Nobody else reads the subscription. And the phone drawer is a
// flex column, so its foot (the card and Help & Support) stays on the screen.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ usePathname: () => '/sites' }))

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

let subscription: Record<string, unknown> | undefined
const subscriptionReads = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useSubscription: () => {
    subscriptionReads()
    return { data: subscription }
  },
}))

let canBillingView = true
vi.mock('@/lib/auth/permissions', () => ({
  useCan: (perm: string) => (perm === 'billing.view' ? canBillingView : true),
}))
let collapsed = false
vi.mock('@/lib/sidebar-context', () => ({ useSidebar: () => ({ collapsed, toggle: vi.fn() }) }))
vi.mock('@/components/sites/SiteFavicon', () => ({ SiteFavicon: () => null }))
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => 'team' }))
vi.mock('@/components/support/HelpSupportButton', () => ({ HelpSupportButton: () => <a href="/contact">Help &amp; Support</a> }))

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

const sub = (usage: number) => ({ plan_id: 'business', pageview_limit: 50000, event_limit: 50000, event_usage: usage, event_hard_ceiling: 100000 })

function renderSidebar(mobile?: { onMobileClose: () => void }) {
  return render(
    <Sidebar
      siteId={null}
      mobileOpen={!!mobile}
      onMobileClose={mobile?.onMobileClose ?? (() => {})}
      onMobileOpen={() => {}}
      onOpenPalette={() => {}}
    />,
  )
}

const card = () => document.querySelector<HTMLAnchorElement>('[data-sidebar-events]')
const footOf = (el: Element) => el.closest('div.shrink-0') as HTMLElement

beforeEach(() => {
  canBillingView = true
  collapsed = false
  subscription = sub(31200)
  subscriptionReads.mockClear()
})

describe('the sidebar events card', () => {
  it('shows the share and the count, links to Settings → Billing, and takes the place of the hairline', () => {
    renderSidebar()
    const link = card()!
    expect(link.getAttribute('href')).toBe('/settings/organization/billing')
    expect(link.textContent).toBe('Events62%31,200 of 50k this month')
    expect(footOf(link).className).not.toContain('border-t')
  })

  it('keeps the share grey below 80%, orange from 80%, destructive once counting stops', () => {
    const shareClass = () => card()!.querySelector('.tabular-nums')!.className
    const { unmount } = renderSidebar()
    expect(shareClass()).toContain('text-neutral-400')
    unmount()

    subscription = sub(43600)
    const second = renderSidebar()
    expect(shareClass()).toContain('text-brand-ink')
    second.unmount()

    subscription = sub(100000)
    renderSidebar()
    expect(shareClass()).toContain('text-destructive')
    expect(card()!.textContent).toContain('Pulse stopped counting at 100k')
  })

  it('draws the ring orange, and destructive once counting stops', () => {
    const arc = () => card()!.querySelectorAll('circle')[1].getAttribute('class')
    const { unmount } = renderSidebar()
    expect(arc()).toContain('text-brand-ink')
    unmount()
    subscription = sub(100000)
    renderSidebar()
    expect(arc()).toContain('text-destructive')
  })

  it('is not there, and the subscription is not read, without billing.view', () => {
    canBillingView = false
    renderSidebar()
    expect(card()).toBeNull()
    expect(subscriptionReads).not.toHaveBeenCalled()
    expect(footOf(screen.getByText('Help & Support')).className).toContain('border-t')
  })

  it('is not there while the subscription loads, or when the server sent no count', () => {
    subscription = undefined
    const { unmount } = renderSidebar()
    expect(card()).toBeNull()
    expect(footOf(screen.getByText('Help & Support')).className).toContain('border-t')
    unmount()

    subscription = { plan_id: 'business', pageview_limit: 50000, event_limit: 50000 }
    renderSidebar()
    expect(card()).toBeNull()
  })

  it('collapses to the ring alone, named for screen readers, and keeps the hairline', () => {
    collapsed = true
    renderSidebar()
    expect(card()).toBeNull()
    const ring = screen.getByRole('link', { name: 'Events this month: 31,200 of 50k (62%)' })
    expect(ring.getAttribute('href')).toBe('/settings/organization/billing')
    expect(ring.textContent).toBe('')
    expect(footOf(ring).className).toContain('border-t')
  })
})

describe('the phone drawer', () => {
  it('is a flex column, so its foot stays on the screen under the title row', () => {
    const onMobileClose = vi.fn()
    const { container } = renderSidebar({ onMobileClose })
    const drawer = [...container.querySelectorAll('aside')].find((a) => a.textContent?.includes('Navigation'))!
    expect(drawer.className.split(/\s+/)).toEqual(expect.arrayContaining(['flex', 'flex-col']))
    // The drawer is the open sidebar: the card, and a tap on it closes the drawer like the other links.
    const drawerCard = drawer.querySelector<HTMLAnchorElement>('[data-sidebar-events]')!
    fireEvent.click(drawerCard)
    expect(onMobileClose).toHaveBeenCalled()
  })
})
