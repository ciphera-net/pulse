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
vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => true,
}))
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
