import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StrictMode } from 'react'
import { render, cleanup, waitFor, act } from '@testing-library/react'
import TourController from '../TourController'
import { TOUR_DONE_PREFIX, TOUR_REQUEST_KEY, TOUR_START_EVENT } from '../constants'
import { TOUR_STEPS } from '../steps'
import * as analytics from '../analytics'

const driveMock = vi.fn()
const destroyMock = vi.fn()
const refreshMock = vi.fn()

/** Loose local shape of what the controller hands driver() — vitest does not
 * typecheck against driver's own hook signatures, and the tests call the
 * hooks with no arguments the way this mock allows. */
interface MockedDriverConfig {
  showProgress: boolean
  stageRadius: number
  overlayOpacity: number
  popoverClass: string
  waitForElement: number
  skipMissingElement: boolean
  steps: Array<{
    element?: () => Element | undefined
    popover: {
      title?: string
      nextBtnText?: string
      prevBtnText?: string
      progressText?: string
      showProgress?: boolean
      disableButtons?: unknown[]
      onPrevClick?: () => void
      onDoneClick?: () => void
    }
  }>
  onDestroyed: () => void
  onDestroyStarted: () => void
}
let driverConfig: MockedDriverConfig = null as unknown as MockedDriverConfig

vi.mock('driver.js', () => ({
  driver: (cfg: MockedDriverConfig) => {
    driverConfig = cfg
    return {
      drive: driveMock,
      destroy: destroyMock,
      refresh: refreshMock,
      getActiveIndex: () => 0,
      getActiveElement: () => undefined,
      isActive: () => true,
    }
  },
}))
vi.mock('driver.js/dist/driver.css', () => ({}))

const toastError = vi.fn()
vi.mock('@ciphera-net/facet', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}))

let mockUser: { id: string } | null = { id: 'user-1' }
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: mockUser }),
}))

const expandMock = vi.fn()
const collapseMock = vi.fn()
let sidebarCollapsed = false
vi.mock('@/lib/sidebar-context', () => ({
  useSidebar: () => ({
    collapsed: sidebarCollapsed,
    expand: expandMock,
    collapse: collapseMock,
    toggle: vi.fn(),
  }),
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

/** Mount every step anchor with a modelled-visible offsetParent — the
 * controller filters the step list to PRESENT anchors at start time, so a
 * full-length tour needs the full set. */
function mountReadyAnchors() {
  for (const def of TOUR_STEPS) {
    if (!def.anchor) continue
    const el = document.createElement('div')
    el.setAttribute('data-tour', def.anchor)
    if (def.card) el.setAttribute('data-tour-card', def.card)
    Object.defineProperty(el, 'offsetParent', { get: () => document.body })
    document.body.appendChild(el)
  }
}

/** Remove one mounted anchor, simulating a user who lacks that surface. */
function unmountAnchor(anchor: string) {
  document.querySelectorAll(`[data-tour="${anchor}"]`).forEach((el) => el.remove())
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  document.body.innerHTML = ''
  driverConfig = null as unknown as MockedDriverConfig
  driveMock.mockClear()
  destroyMock.mockClear()
  refreshMock.mockClear()
  expandMock.mockClear()
  collapseMock.mockClear()
  toastError.mockClear()
  mockUser = { id: 'user-1' }
  sidebarCollapsed = false
  mdMatches = true
  stubMatchMedia()
  mountReadyAnchors()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('TourController auto-start', () => {
  it('auto-starts for a user who has never seen the tour', async () => {
    const started = vi.spyOn(analytics, 'trackTourStarted')
    render(<TourController />)
    await waitFor(() => expect(driveMock).toHaveBeenCalledTimes(1))
    expect(started).toHaveBeenCalledWith('auto')
  })

  it('does not auto-start when the per-user done-key is present', async () => {
    localStorage.setItem(`${TOUR_DONE_PREFIX}user-1`, '1')
    render(<TourController />)
    await new Promise((r) => setTimeout(r, 80))
    expect(driveMock).not.toHaveBeenCalled()
  })

  it('does not start below the md breakpoint — no mobile tour, by ruling', async () => {
    mdMatches = false
    render(<TourController />)
    await new Promise((r) => setTimeout(r, 80))
    expect(driveMock).not.toHaveBeenCalled()
  })

  it('a fresh palette request starts the tour even for a done user', async () => {
    localStorage.setItem(`${TOUR_DONE_PREFIX}user-1`, '1')
    sessionStorage.setItem(TOUR_REQUEST_KEY, String(Date.now()))
    const started = vi.spyOn(analytics, 'trackTourStarted')
    render(<TourController />)
    await waitFor(() => expect(driveMock).toHaveBeenCalledTimes(1))
    expect(started).toHaveBeenCalledWith('manual')
    expect(sessionStorage.getItem(TOUR_REQUEST_KEY)).toBeNull()
  })

  it('a STALE palette request is consumed but never honoured', async () => {
    // The navigation that queued this request never landed (load error, back
    // button) — minutes later it must not force-start the tour.
    localStorage.setItem(`${TOUR_DONE_PREFIX}user-1`, '1')
    sessionStorage.setItem(TOUR_REQUEST_KEY, String(Date.now() - 10 * 60_000))
    render(<TourController />)
    await new Promise((r) => setTimeout(r, 80))
    expect(driveMock).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(TOUR_REQUEST_KEY)).toBeNull()
  })

  it('the same-page start event works after mount, despite the done-key', async () => {
    localStorage.setItem(`${TOUR_DONE_PREFIX}user-1`, '1')
    render(<TourController />)
    await new Promise((r) => setTimeout(r, 30))
    act(() => {
      window.dispatchEvent(new Event(TOUR_START_EVENT))
    })
    await waitFor(() => expect(driveMock).toHaveBeenCalledTimes(1))
  })

  it('survives StrictMode double-mount: one drive, and the rail it expanded is not collapsed under it', async () => {
    // Next dev wraps the app in StrictMode: mount → fake unmount → remount,
    // refs surviving. The fake unmount's cleanup must not restore the rail
    // the in-flight start just borrowed — that collapsed the sidebar under
    // the live tour before the deferred-restore fix.
    sidebarCollapsed = true
    render(
      <StrictMode>
        <TourController />
      </StrictMode>
    )
    await waitFor(() => expect(driveMock).toHaveBeenCalledTimes(1), { timeout: 3000 })
    await new Promise((r) => setTimeout(r, 30)) // let any deferred cleanup check run
    expect(collapseMock).not.toHaveBeenCalled()
  })
})

describe('TourController teardown', () => {
  it('destroy stamps the per-user key, restores a collapsed sidebar, and records the skip', async () => {
    sidebarCollapsed = true
    const skipped = vi.spyOn(analytics, 'trackTourSkipped')
    render(<TourController />)
    await waitFor(() => expect(driveMock).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(expandMock).toHaveBeenCalled()
    act(() => {
      driverConfig.onDestroyed!()
    })
    expect(localStorage.getItem(`${TOUR_DONE_PREFIX}user-1`)).toBeTruthy()
    expect(collapseMock).toHaveBeenCalled()
    expect(skipped).toHaveBeenCalled()
  })

  it('an expanded sidebar is left alone on destroy', async () => {
    sidebarCollapsed = false
    render(<TourController />)
    await waitFor(() => expect(driveMock).toHaveBeenCalledTimes(1))
    act(() => {
      driverConfig.onDestroyed!()
    })
    expect(collapseMock).not.toHaveBeenCalled()
  })

  it('Done on the last step marks completion; the destroy hook then records it', async () => {
    const completed = vi.spyOn(analytics, 'trackTourCompleted')
    const skipped = vi.spyOn(analytics, 'trackTourSkipped')
    render(<TourController />)
    await waitFor(() => expect(driveMock).toHaveBeenCalledTimes(1))
    const last = driverConfig.steps[driverConfig.steps.length - 1]
    act(() => {
      last.popover.onDoneClick!()
    })
    expect(destroyMock).toHaveBeenCalled()
    act(() => {
      driverConfig.onDestroyed!()
    })
    expect(completed).toHaveBeenCalled()
    expect(skipped).not.toHaveBeenCalled()
  })

  it('an early Esc (onDestroyStarted, before driver publishes step state) still runs the full teardown and leaves the tour restartable', async () => {
    // driver gates onDestroyed on transition state that only exists ~400ms
    // after drive(); Esc inside that window reaches onDestroyStarted ONLY.
    sidebarCollapsed = true
    const skipped = vi.spyOn(analytics, 'trackTourSkipped')
    render(<TourController />)
    await waitFor(() => expect(driveMock).toHaveBeenCalledTimes(1), { timeout: 3000 })
    act(() => {
      driverConfig.onDestroyStarted!()
    })
    expect(destroyMock).toHaveBeenCalled()
    expect(localStorage.getItem(`${TOUR_DONE_PREFIX}user-1`)).toBeTruthy()
    expect(collapseMock).toHaveBeenCalled()
    expect(skipped).toHaveBeenCalled()
    // activeRef must be released — the ⌘K re-entry works again.
    act(() => {
      window.dispatchEvent(new Event(TOUR_START_EVENT))
    })
    await waitFor(() => expect(driveMock).toHaveBeenCalledTimes(2), { timeout: 3000 })
  })
})

describe('TourController readiness timeout', () => {
  it('a manual start on a dashboard that never loads toasts, restores the rail, and never drives', async () => {
    vi.useFakeTimers()
    try {
      document.body.innerHTML = '' // undo mountReadyAnchors — the deck never mounts
      sidebarCollapsed = true
      // Done-key set: without it the AUTO start grabs activeRef first and the
      // manual event below is refused — the run under test must be 'manual'.
      localStorage.setItem(`${TOUR_DONE_PREFIX}user-1`, '1')
      render(<TourController />)
      act(() => {
        window.dispatchEvent(new Event(TOUR_START_EVENT))
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(16_500)
      })
      expect(driveMock).not.toHaveBeenCalled()
      expect(expandMock).toHaveBeenCalled()
      expect(collapseMock).toHaveBeenCalled()
      expect(toastError).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('an auto start that never finds the deck stays silent — no toast at a user who asked for nothing', async () => {
    vi.useFakeTimers()
    try {
      document.body.innerHTML = ''
      render(<TourController />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(16_500)
      })
      expect(driveMock).not.toHaveBeenCalled()
      expect(toastError).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('TourController step wiring', () => {
  async function getConfig() {
    render(<TourController />)
    await waitFor(() => expect(driveMock).toHaveBeenCalledTimes(1))
    return driverConfig
  }

  it('the welcome is uncounted and offers Skip; counted steps carry "n of 7"', async () => {
    const cfg = await getConfig()
    expect(cfg.showProgress).toBe(false)
    const welcome = cfg.steps[0]
    expect(welcome.element).toBeUndefined()
    expect(welcome.popover.nextBtnText).toBe('Start the tour')
    expect(welcome.popover.prevBtnText).toBe('Skip')
    // driver disables `previous` on step 0; without this override the Skip
    // button ships dead (and the tour CSS strips the disabled affordance).
    expect(welcome.popover.disableButtons).toEqual([])
    expect(welcome.popover.showProgress).toBeUndefined()
    expect(cfg.steps[1].popover.showProgress).toBe(true)
    expect(cfg.steps[1].popover.progressText).toBe('1 of 7')
    expect(cfg.steps[7].popover.progressText).toBe('7 of 7')
  })

  it('every counted step carries a live resolver for its own anchor', async () => {
    const cfg = await getConfig()
    for (let i = 1; i < TOUR_STEPS.length; i++) {
      expect(typeof cfg.steps[i].element, `step ${i} lost its element resolver`).toBe('function')
    }
    // The harness mounts the two readiness anchors — those steps' resolvers
    // must return their OWN nodes, not null and not each other's.
    const railEl = cfg.steps[1].element!()
    expect(railEl?.getAttribute('data-tour')).toBe('metric-rail')
    const cardStep = TOUR_STEPS.findIndex((s) => s.card === 'referrers')
    const cardEl = cfg.steps[cardStep].element!()
    expect(cardEl?.getAttribute('data-tour-card')).toBe('referrers')
  })

  it('Skip on the welcome destroys the tour', async () => {
    const cfg = await getConfig()
    act(() => {
      cfg.steps[0].popover.onPrevClick!()
    })
    expect(destroyMock).toHaveBeenCalled()
  })

  it('builds one driver step per script step, sharp-cornered and house-classed', async () => {
    const cfg = await getConfig()
    expect(cfg.steps.length).toBe(TOUR_STEPS.length)
    expect(cfg.popoverClass).toBe('pulse-tour')
    expect(cfg.stageRadius).toBe(0)
    expect(cfg.overlayOpacity).toBe(0.55)
  })

  it('a CONTAINER scroll re-syncs driver — its own listener is bubble-phase and never hears <main>', async () => {
    await getConfig()
    // scroll does not bubble: dispatched on a nested node it reaches only a
    // capture-phase window listener. driver's own is not capture — ours is.
    const inner = document.createElement('div')
    document.body.appendChild(inner)
    act(() => {
      inner.dispatchEvent(new Event('scroll'))
    })
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('mid-tour vanishing targets get a short grace then a skip — never a long dimmed wait', async () => {
    const cfg = await getConfig()
    expect(cfg.waitForElement).toBe(2500)
    expect(cfg.skipMissingElement).toBe(true)
  })

  it('a user missing a surface gets a shorter tour with an honest counter', async () => {
    // The bell is gone for this user: its step is dropped at start time and
    // the remaining steps renumber — no corner-pinned 0×0 spotlight, no wait.
    unmountAnchor('notification-bell')
    render(<TourController />)
    await waitFor(() => expect(driveMock).toHaveBeenCalledTimes(1))
    const cfg = driverConfig
    expect(cfg.steps.length).toBe(TOUR_STEPS.length - 1)
    const titles = cfg.steps.map((s) => s.popover.title)
    expect(titles).not.toContain('Alerts land here')
    expect(cfg.steps[1].popover.progressText).toBe('1 of 6')
    expect(cfg.steps[cfg.steps.length - 1].popover.progressText).toBe('6 of 6')
    // The closing gesture survives as the last step.
    expect(cfg.steps[cfg.steps.length - 1].popover.title).toBe('More than the dashboard')
  })
})
