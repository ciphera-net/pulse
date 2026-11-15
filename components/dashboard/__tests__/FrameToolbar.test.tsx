import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FrameToolbar, { BAND_FADE_PX, bandOpacity, bandReach } from '@/components/dashboard/FrameToolbar'

// The toolbar that stays (the new dashboard frame). jsdom lays nothing out and scrolls nothing, so what is pinned
// here is the rule (how much band at which scroll position), what it listens to, and how the row is built. That the
// row really stays and the band really blurs was measured on the page.

describe('bandOpacity: nothing at rest, all of it once the page has moved 24 px', () => {
  it('follows the scroll position in between', () => {
    expect(BAND_FADE_PX).toBe(24)
    expect(bandOpacity(0)).toBe(0)
    expect(bandOpacity(6)).toBe(0.25)
    expect(bandOpacity(12)).toBe(0.5)
    expect(bandOpacity(24)).toBe(1)
    expect(bandOpacity(2400)).toBe(1)
  })

  it('never leaves 0 to 1 (a rubber-band scroll reports a negative position)', () => {
    expect(bandOpacity(-40)).toBe(0)
    expect(bandOpacity(Number.NaN)).toBe(0)
    expect(bandOpacity(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('bandReach: the band ends at the panel\'s edges, and never past the right one', () => {
  it('is the distance from each edge of the row to the panel\'s', () => {
    // A 1280 px page in a 1584 px panel that starts 256 px in: 152 px to either side.
    expect(bandReach({ left: 408, right: 1688 }, { left: 256, right: 1840 })).toEqual({ left: 152, right: 152 })
    // A phone: the page's own 16 px of padding.
    expect(bandReach({ left: 17, right: 373 }, { left: 1, right: 389 })).toEqual({ left: 16, right: 16 })
  })

  it('rounds so that the right end can fall short of the panel\'s edge and never pass it', () => {
    // What passes the right edge is scroll area; what passes the left one cannot be scrolled to.
    expect(bandReach({ left: 100.4, right: 899.6 }, { left: 0, right: 1000 })).toEqual({ left: 101, right: 100 })
  })

  it('reaches nowhere past a row that is wider than its panel, and survives a layout that is not there yet', () => {
    expect(bandReach({ left: -20, right: 420 }, { left: 0, right: 400 })).toEqual({ left: 0, right: 0 })
    expect(bandReach({ left: Number.NaN, right: Number.NaN }, { left: 0, right: 400 })).toEqual({ left: 0, right: 0 })
  })
})

describe('FrameToolbar', () => {
  // The browser paints once per frame. Here a frame comes when the test says so, as in a browser it comes AFTER the
  // scroll event that asked for it (a stand-in that painted inside requestAnimationFrame would not be a frame).
  let frames: FrameRequestCallback[] = []
  const nextFrame = () => { const due = frames; frames = []; due.forEach((cb) => cb(0)) }
  beforeEach(() => {
    frames = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', () => { frames = [] })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  })

  const band = () => screen.getByTestId('frame-toolbar-band')
  const scrollWindowTo = (y: number) => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
    fireEvent.scroll(window)
    nextFrame()
  }

  it('stays at the top, above the blocks, with its controls in a row that may wrap', () => {
    render(<FrameToolbar><button type="button">Filter</button><button type="button">Date range</button></FrameToolbar>)
    const row = screen.getByTestId('frame-toolbar')
    for (const c of ['sticky', 'top-0', 'z-40']) expect(row.className.split(' ')).toContain(c)
    // 10 px of band above and under the controls, taken back by the margins: 12 px to the chart, as before.
    for (const c of ['py-2.5', '-mt-2.5', 'mb-0.5']) expect(row.className.split(' ')).toContain(c)
    const controls = screen.getByRole('button', { name: 'Filter' }).parentElement as HTMLElement
    expect(controls.className).toContain('flex-wrap')
    expect(controls.parentElement).toBe(row)
  })

  it('draws the band as its own element behind the controls, never as the row\'s own background', () => {
    render(<FrameToolbar><button type="button">Filter</button></FrameToolbar>)
    const row = screen.getByTestId('frame-toolbar')
    // On the row itself a backdrop filter would make it the containing block of the date menu and the filter.
    expect(row.className).not.toContain('glass-band')
    expect(band().parentElement).toBe(row)
    expect(band().getAttribute('aria-hidden')).toBe('true')
    for (const c of ['glass-band', 'absolute', 'inset-0', '-z-10', 'pointer-events-none']) {
      expect(band().className.split(' '), c).toContain(c)
    }
    // No fixed reach: a band 100vw past the row made the panel's scroll area twice the panel's width.
    expect(band().className).not.toContain('100vw')
    expect(band().contains(screen.getByRole('button', { name: 'Filter' }))).toBe(false)
  })

  describe('the band\'s two ends', () => {
    // jsdom lays nothing out, so the boxes are handed to it: a 1280 px page in a 1584 px panel, 256 px in.
    type Box = { left: number; right: number }
    let rowBox: Box
    let panelBox: Box & { clientLeft: number; clientWidth: number }
    let observers: Array<{ cb: () => void; seen: Element[]; live: boolean }>
    const rect = (b: Box) => ({ left: b.left, right: b.right, top: 0, bottom: 0, width: b.right - b.left, height: 0, x: b.left, y: 0, toJSON: () => ({}) }) as DOMRect

    beforeEach(() => {
      rowBox = { left: 408, right: 1688 }
      panelBox = { left: 255, right: 1841, clientLeft: 1, clientWidth: 1584 }
      observers = []
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this.dataset.testid === 'frame-toolbar') return rect(rowBox)
        if (this.dataset.testid === 'scroller') return rect(panelBox)
        return rect({ left: 0, right: 0 })
      })
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
        return this.dataset.testid === 'scroller' ? panelBox.clientWidth : this === document.documentElement ? 1440 : 0
      })
      vi.spyOn(HTMLElement.prototype, 'clientLeft', 'get').mockImplementation(function (this: HTMLElement) {
        return this.dataset.testid === 'scroller' ? panelBox.clientLeft : 0
      })
      vi.stubGlobal('ResizeObserver', class {
        entry: { cb: () => void; seen: Element[]; live: boolean }
        constructor(cb: () => void) { this.entry = { cb, seen: [], live: true }; observers.push(this.entry) }
        observe(el: Element) { this.entry.seen.push(el) }
        unobserve() {}
        disconnect() { this.entry.live = false }
      })
    })
    afterEach(() => { vi.restoreAllMocks() })

    const inPanel = () => render(
      <div data-testid="scroller" style={{ overflowY: 'auto' }}>
        <div><FrameToolbar><span>controls</span></FrameToolbar></div>
      </div>,
    )

    it('end at the edges of the panel that scrolls the page, inside its border', () => {
      inPanel()
      // The panel's inner box runs from 256 to 1840: 152 px past the row on each side.
      expect(band().style.left).toBe('-152px')
      expect(band().style.right).toBe('-152px')
    })

    it('follow the panel when it changes width (the window, the sidebar) and the row when the page does', () => {
      inPanel()
      expect(observers).toHaveLength(1)
      expect(observers[0].seen).toEqual([screen.getByTestId('scroller'), screen.getByTestId('frame-toolbar')])
      // The sidebar closes: the panel starts 64 px in and is 1776 px wide, the 1280 px page centred in it.
      panelBox = { left: 63, right: 1841, clientLeft: 1, clientWidth: 1776 }
      rowBox = { left: 312, right: 1592 }
      observers[0].cb()
      expect(band().style.left).toBe('-248px')
      expect(band().style.right).toBe('-248px')
      // A window resize is heard too, where no observer exists.
      panelBox = { left: 0, right: 390, clientLeft: 1, clientWidth: 388 }
      rowBox = { left: 17, right: 373 }
      fireEvent(window, new Event('resize'))
      expect(band().style.left).toBe('-16px')
      expect(band().style.right).toBe('-16px')
    })

    it('are the window\'s edges when the window scrolls the page', () => {
      rowBox = { left: 80, right: 1360 }
      render(<FrameToolbar><span>controls</span></FrameToolbar>)
      expect(band().style.left).toBe('-80px')
      expect(band().style.right).toBe('-80px')
      expect(observers[0].seen[0]).toBe(document.documentElement)
    })

    it('stop being measured when the toolbar goes', () => {
      const { unmount } = inPanel()
      const el = band()
      unmount()
      expect(observers[0].live).toBe(false)
      panelBox = { left: 0, right: 390, clientLeft: 1, clientWidth: 388 }
      rowBox = { left: 17, right: 373 }
      fireEvent(window, new Event('resize'))
      expect(el.style.left).toBe('-152px')
    })
  })

  it('shows no band at rest and brings it in as the window scrolls', () => {
    render(<FrameToolbar><span>controls</span></FrameToolbar>)
    expect(band().style.opacity).toBe('0')
    scrollWindowTo(12)
    expect(band().style.opacity).toBe('0.5')
    scrollWindowTo(300)
    expect(band().style.opacity).toBe('1')
    scrollWindowTo(0)
    expect(band().style.opacity).toBe('0')
  })

  it('reads the position it mounts at: a page already scrolled has its band from the first frame', () => {
    Object.defineProperty(window, 'scrollY', { value: 80, configurable: true })
    render(<FrameToolbar><span>controls</span></FrameToolbar>)
    expect(band().style.opacity).toBe('1')
  })

  it('follows the element that scrolls the page when the window does not (the app\'s content panel)', () => {
    render(
      <div data-testid="scroller" style={{ overflowY: 'auto' }}>
        <div>
          <FrameToolbar><span>controls</span></FrameToolbar>
        </div>
      </div>,
    )
    const scroller = screen.getByTestId('scroller')
    // The window moving means nothing here.
    scrollWindowTo(500)
    expect(band().style.opacity).toBe('0')
    scroller.scrollTop = 18
    fireEvent.scroll(scroller)
    nextFrame()
    expect(band().style.opacity).toBe('0.75')
  })

  it('writes once per frame, however many scroll events the frame holds, and reads the position at that frame', () => {
    render(<FrameToolbar><span>controls</span></FrameToolbar>)
    for (const y of [3, 6, 9, 12]) {
      Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
      fireEvent.scroll(window)
    }
    // Four events asked for ONE frame, and nothing is written before it comes.
    expect(frames).toHaveLength(1)
    expect(band().style.opacity).toBe('0')
    nextFrame()
    expect(band().style.opacity).toBe('0.5')
  })

  it('stops listening when it goes', () => {
    const { unmount } = render(<FrameToolbar><span>controls</span></FrameToolbar>)
    const el = band()
    unmount()
    scrollWindowTo(24)
    expect(el.style.opacity).toBe('0')
  })
})
