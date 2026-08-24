import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react'
import TourController from '../TourController'
import { TOUR_DONE_PREFIX } from '../constants'
import { TOUR_STEPS } from '../steps'

/**
 * Drives the REAL driver.js (no vi.mock) in jsdom. The sibling suite mocks
 * the library wholesale and once shipped a false green: driver auto-disables
 * the `previous` button on step 0, so the welcome's repurposed "Skip" was
 * dead while the mocked test called its handler directly. Anything about
 * what driver actually renders belongs here.
 *
 * matchMedia reports reduced motion so driver skips its rAF transition loop
 * (jsdom has no layout, and animate:false publishes step state synchronously).
 */

let mockUser: { id: string } | null = { id: 'user-1' }
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: mockUser }),
}))

const expandMock = vi.fn()
const collapseMock = vi.fn()
vi.mock('@/lib/sidebar-context', () => ({
  useSidebar: () => ({
    collapsed: false,
    expand: expandMock,
    collapse: collapseMock,
    toggle: vi.fn(),
  }),
}))

vi.mock('@ciphera-net/facet', () => ({
  toast: { error: vi.fn() },
}))

function mountReadyAnchors() {
  for (const def of TOUR_STEPS) {
    if (!def.anchor) continue
    const el = document.createElement('div')
    el.setAttribute('data-tour', def.anchor)
    if (def.card) el.setAttribute('data-tour-card', def.card)
    Object.defineProperty(el, 'offsetParent', { get: () => document.body })
    // jsdom has no layout: model a real on-screen rect so the ring device
    // (which hides for 0-size targets) has something to draw around.
    el.getBoundingClientRect = () =>
      ({ x: 100, y: 120, left: 100, top: 120, right: 336, bottom: 400, width: 236, height: 280, toJSON: () => ({}) }) as DOMRect
    document.body.appendChild(el)
  }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  document.body.innerHTML = ''
  document.body.className = ''
  expandMock.mockClear()
  collapseMock.mockClear()
  mockUser = { id: 'user-1' }
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true, // md+ AND prefers-reduced-motion → animate:false, no rAF loop
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  ;(Element.prototype as { scrollIntoView?: unknown }).scrollIntoView = vi.fn()
  mountReadyAnchors()
})

afterEach(() => {
  cleanup()
  document.querySelector('.driver-popover')?.remove()
  document.querySelector('svg.driver-overlay')?.remove()
  vi.unstubAllGlobals()
})

describe('welcome step against the real driver.js', () => {
  it('renders Skip ENABLED, and a real click ends the tour with the key stamped', async () => {
    render(<TourController />)
    await waitFor(
      () => expect(document.querySelector('.driver-popover.pulse-tour')).toBeTruthy(),
      { timeout: 5000 }
    )
    const prev = document.querySelector<HTMLButtonElement>('.driver-popover-prev-btn')
    expect(prev).toBeTruthy()
    expect(prev!.textContent).toBe('Skip')
    // The P1 this file exists for: driver's step-0 default is disabled=true.
    expect(prev!.disabled).toBe(false)
    expect(prev!.classList.contains('driver-popover-btn-disabled')).toBe(false)

    fireEvent.click(prev!)
    await waitFor(() => expect(document.querySelector('.driver-popover')).toBeNull())
    expect(localStorage.getItem(`${TOUR_DONE_PREFIX}user-1`)).toBeTruthy()
    expect(document.body.classList.contains('driver-active')).toBe(false)
  })

  it('Start the tour advances to the first counted step on the real library', async () => {
    render(<TourController />)
    await waitFor(
      () => expect(document.querySelector('.driver-popover.pulse-tour')).toBeTruthy(),
      { timeout: 5000 }
    )
    const next = document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')
    expect(next!.textContent).toBe('Start the tour')
    fireEvent.click(next!)
    await waitFor(() => {
      const title = document.querySelector('.driver-popover-title')
      expect(title?.textContent).toBe('Your key metrics')
    })
    const progress = document.querySelector('.driver-popover-progress-text')
    expect(progress?.textContent).toBe('1 of 7')
    // On a counted step, Back is a real previous and stays enabled too.
    const back = document.querySelector<HTMLButtonElement>('.driver-popover-prev-btn')
    expect(back!.textContent).toBe('Back')
    expect(back!.disabled).toBe(false)
    // The spotlight ring is a body-attached fixed element (outlines get
    // clipped by ancestor overflow), drawn 6px outside the target's rect.
    await waitFor(() => {
      const ring = document.getElementById('pulse-tour-ring')
      expect(ring).toBeTruthy()
      expect(ring!.style.display).toBe('block')
    })
    const ring = document.getElementById('pulse-tour-ring')!
    expect(ring.style.left).toBe('94px')
    expect(ring.style.top).toBe('114px')
    expect(ring.style.width).toBe('248px')
    expect(ring.style.height).toBe('292px')
  })

  it('the ring is removed with the tour', async () => {
    render(<TourController />)
    await waitFor(
      () => expect(document.querySelector('.driver-popover.pulse-tour')).toBeTruthy(),
      { timeout: 5000 }
    )
    fireEvent.click(document.querySelector<HTMLButtonElement>('.driver-popover-prev-btn')!)
    await waitFor(() => expect(document.querySelector('.driver-popover')).toBeNull())
    expect(document.getElementById('pulse-tour-ring')).toBeNull()
  })
})
