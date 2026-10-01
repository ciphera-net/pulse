import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { CommandPalette } from '../CommandPalette'
import { TOUR_REQUEST_KEY, TOUR_START_EVENT } from '@/lib/tour/constants'

const pushMock = vi.fn()
let mockPathname = '/sites'
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => mockPathname,
}))
vi.mock('@/lib/swr/sites', () => ({
  useSites: () => ({ sites: [] }),
}))
// Every permission defaults to granted except the ones a test overrides below
// (D43: the pricing action's Billing gate) — most of this file's assertions
// assume an admin's view of the palette, same as before this map existed.
let mockPermissions: Record<string, boolean> = {}
vi.mock('@/lib/auth/permissions', () => ({
  useCan: (perm: string) => mockPermissions[perm] ?? true,
}))
// The settings group follows the ONE team-state signal (PULSE-59).
let mockTeamState: 'alone' | 'team' | null = 'team'
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => mockTeamState }))
vi.mock('@/components/sites/SiteFavicon', () => ({
  SiteFavicon: () => null,
}))

let mdMatches = true
function stubMatchMedia() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width') ? mdMatches : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

const SITE = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

function renderPalette(props: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  return render(
    <CommandPalette open onOpenChange={props.onOpenChange ?? vi.fn()} currentSiteId={props.currentSiteId} />
  )
}

beforeEach(() => {
  mockTeamState = 'team'
  mockPermissions = {}
  sessionStorage.clear()
  pushMock.mockClear()
  mockPathname = '/sites'
  mdMatches = true
  stubMatchMedia()
  // cmdk measures its list with ResizeObserver; jsdom has none.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  ;(Element.prototype as { scrollIntoView?: unknown }).scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the ⌘K tour action', () => {
  it('is offered on a site context at md+', () => {
    renderPalette({ currentSiteId: SITE })
    expect(screen.getByText('Take the product tour')).toBeInTheDocument()
  })

  it('is absent without a site context', () => {
    renderPalette()
    expect(screen.queryByText('Take the product tour')).toBeNull()
  })

  it('is absent below md — the tour does not exist on mobile, so no dead action', () => {
    mdMatches = false
    renderPalette({ currentSiteId: SITE })
    expect(screen.queryByText('Take the product tour')).toBeNull()
  })

  it('from another route: stamps a timestamped request and navigates to the dashboard', () => {
    mockPathname = `/sites/${SITE}/uptime`
    const before = Date.now()
    renderPalette({ currentSiteId: SITE })
    fireEvent.click(screen.getByText('Take the product tour'))
    const stamp = Number(sessionStorage.getItem(TOUR_REQUEST_KEY))
    expect(stamp).toBeGreaterThanOrEqual(before)
    expect(pushMock).toHaveBeenCalledWith(`/sites/${SITE}`)
  })

  it('already on the dashboard: starts in place — no navigation, no stranded flag', () => {
    mockPathname = `/sites/${SITE}`
    const onOpenChange = vi.fn()
    const started = vi.fn()
    window.addEventListener(TOUR_START_EVENT, started)
    try {
      renderPalette({ currentSiteId: SITE, onOpenChange })
      fireEvent.click(screen.getByText('Take the product tour'))
      expect(started).toHaveBeenCalledTimes(1)
      expect(pushMock).not.toHaveBeenCalled()
      expect(sessionStorage.getItem(TOUR_REQUEST_KEY)).toBeNull()
      expect(onOpenChange).toHaveBeenCalledWith(false)
    } finally {
      window.removeEventListener(TOUR_START_EVENT, started)
    }
  })
})

// ─── PULSE-59: the settings entries match the rail in both states ───
describe('CommandPalette settings entries, alone and team', () => {
  it('team: Team Settings, Team Members and the Audit Log', () => {
    renderPalette()
    expect(screen.getByText('Team Settings')).toBeTruthy()
    expect(screen.getByText('Team Members')).toBeTruthy()
    expect(screen.getByText('Audit Log')).toBeTruthy()
    expect(screen.queryByText('Invite people')).toBeNull()
    expect(screen.queryByText(/Organization Settings|Workspace Notifications/)).toBeNull()
  })

  it('alone: Invite people, and no team settings or audit log', () => {
    mockTeamState = 'alone'
    renderPalette()
    fireEvent.click(screen.getByText('Invite people'))
    expect(pushMock).toHaveBeenCalledWith('/settings/organization/members')
    expect(screen.queryByText('Team Settings')).toBeNull()
    expect(screen.queryByText('Team Members')).toBeNull()
    expect(screen.queryByText('Audit Log')).toBeNull()
  })
})

// D43: the "View pricing" action opens Billing for anyone who may see that
// tab, never a tab that would just render "Access restricted" for them.
describe('the "View pricing" action (D43)', () => {
  it('opens Settings → Billing when the viewer has billing.view', () => {
    mockPermissions = { 'billing.view': true }
    renderPalette()
    fireEvent.click(screen.getByText('View pricing'))
    expect(pushMock).toHaveBeenCalledWith('/settings/organization/billing')
  })

  it('falls back to the marketing /pricing page without billing.view', () => {
    mockPermissions = { 'billing.view': false }
    renderPalette()
    fireEvent.click(screen.getByText('View pricing'))
    expect(pushMock).toHaveBeenCalledWith('/pricing')
  })
})
