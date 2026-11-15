import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { copyTiled, registerBar, resetBandForTests } from '@/lib/skeleton/band'
import { BAND, WAVE_TILE, bandAt, tileSize } from '@/lib/skeleton/dither'

// The band's animator. jsdom draws nothing, so the canvas, the two observers, the shared picture and the frame
// clock are stand-ins the test drives. What is pinned: when a bar gets a canvas and when it loses it, what a frame
// draws on it, and that nothing runs while the reader asked for less motion. (Until 15-11-2026 the band ran only
// for a team with the new dashboard's look; it is every reader's since.)

type Call = { op: string; args: unknown[]; composite: string; transform: number[] }

/** A 2D context that records what it is asked to draw. */
function fakeContext() {
  const calls: Call[] = []
  let transform = [1, 0, 0, 1, 0, 0]
  const ctx = {
    globalCompositeOperation: 'source-over',
    fillStyle: '' as unknown,
    calls,
    setTransform: (...m: number[]) => { transform = m },
    clearRect: (...args: unknown[]) => calls.push({ op: 'clearRect', args, composite: ctx.globalCompositeOperation, transform }),
    drawImage: (...args: unknown[]) => calls.push({ op: 'drawImage', args, composite: ctx.globalCompositeOperation, transform }),
    fillRect: (...args: unknown[]) => calls.push({ op: 'fillRect', args, composite: ctx.globalCompositeOperation, transform }),
    createLinearGradient: (...args: number[]) => {
      const stops: [number, string][] = []
      return { line: args, stops, addColorStop: (at: number, colour: string) => stops.push([at, colour]) }
    },
  }
  return ctx
}

let frames: FrameRequestCallback[]
let now: number
let sizes: Array<{ cb: ResizeObserverCallback; seen: Set<Element> }>
let sights: Array<{ cb: IntersectionObserverCallback; seen: Set<Element> }>
let contexts: Map<HTMLCanvasElement, ReturnType<typeof fakeContext>>
let images: Array<{ onload: (() => void) | null; src: string }>
let reduced: boolean
let motionListeners: Array<() => void>

/** One animation frame, `ms` later. */
function frame(ms = 40) {
  now += ms
  const due = frames
  frames = []
  due.forEach((cb) => cb(now))
}
const resize = (el: Element, width: number, height: number) =>
  sizes.forEach((o) => o.seen.has(el) && o.cb([{ target: el, borderBoxSize: [{ inlineSize: width, blockSize: height }], contentRect: { width, height } } as unknown as ResizeObserverEntry], o as unknown as ResizeObserver))
const sight = (el: Element, isIntersecting: boolean) =>
  sights.forEach((o) => o.seen.has(el) && o.cb([{ target: el, isIntersecting } as IntersectionObserverEntry], o as unknown as IntersectionObserver))
/** The shared picture arrives. */
const pictureLoads = () => images.forEach((image) => image.onload?.())

function bar(): HTMLDivElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}
const canvasOf = (el: Element) => el.querySelector('canvas')

beforeEach(() => {
  frames = []
  now = 1000
  sizes = []
  sights = []
  contexts = new Map()
  images = []
  reduced = false
  motionListeners = []
  resetBandForTests()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => { frames = [] })
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('ResizeObserver', class {
    entry: { cb: ResizeObserverCallback; seen: Set<Element> }
    constructor(cb: ResizeObserverCallback) { this.entry = { cb, seen: new Set() }; sizes.push(this.entry) }
    observe(el: Element) { this.entry.seen.add(el) }
    unobserve(el: Element) { this.entry.seen.delete(el) }
    disconnect() { this.entry.seen.clear() }
  })
  vi.stubGlobal('IntersectionObserver', class {
    entry: { cb: IntersectionObserverCallback; seen: Set<Element> }
    constructor(cb: IntersectionObserverCallback) { this.entry = { cb, seen: new Set() }; sights.push(this.entry) }
    observe(el: Element) { this.entry.seen.add(el) }
    unobserve(el: Element) { this.entry.seen.delete(el) }
    disconnect() { this.entry.seen.clear() }
  })
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null
    src = ''
    constructor() { images.push(this) }
  })
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() { return query.includes('reduced-motion') && reduced },
    addEventListener: (_: string, listener: () => void) => motionListeners.push(listener),
    removeEventListener: () => undefined,
  }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    if (!contexts.has(this)) contexts.set(this, fakeContext())
    return contexts.get(this) as unknown as CanvasRenderingContext2D
  } as unknown as typeof HTMLCanvasElement.prototype.getContext)
  Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
})

afterEach(() => {
  resetBandForTests()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  window.localStorage.clear()
})

/** A bar on the page, measured and on screen, with the shared picture loaded. */
function running(width = 400, height = 36) {
  const el = bar()
  const leave = registerBar(el)
  resize(el, width, height)
  sight(el, true)
  frame() // asks for the shared picture
  pictureLoads()
  return { el, leave }
}

describe('a bar on the page', () => {
  it('starts the band at once: there is no look left to wait for', () => {
    const el = bar()
    registerBar(el)
    expect(frames).toHaveLength(1)
    expect(sizes).toHaveLength(1)
    expect(sights).toHaveLength(1)
  })
})

describe('a bar the band draws on', () => {
  it('draws nothing until the bar has been measured and seen, and the shared picture has arrived', () => {
    const el = bar()
    registerBar(el)
    frame()
    expect(canvasOf(el)).toBeNull()
    resize(el, 400, 36)
    frame()
    // Measured, not yet on screen.
    expect(canvasOf(el)).toBeNull()
    sight(el, true)
    frame()
    // On screen, the picture still on its way.
    expect(canvasOf(el)).toBeNull()
    pictureLoads()
    frame()
    expect(canvasOf(el)).not.toBeNull()
  })

  it('asks for the shared picture once for the whole page, at the device\'s density', () => {
    const els = [bar(), bar(), bar()]
    els.forEach((el) => { registerBar(el); resize(el, 300, 20); sight(el, true) })
    frame()
    frame()
    frame()
    expect(images).toHaveLength(1)
    expect(decodeURIComponent(images[0].src)).toContain("width='924' height='960' viewBox='0 0 462 480'")
    pictureLoads()
    frame()
    expect(els.every((el) => canvasOf(el))).toBe(true)
    expect(images).toHaveLength(1)
  })

  it('fits the canvas to the bar: its box in CSS pixels, twice that in device pixels, inside the bar and unread', () => {
    const { el } = running(400, 36)
    frame()
    const canvas = canvasOf(el) as HTMLCanvasElement
    expect(canvas.parentElement).toBe(el)
    expect(canvas.getAttribute('aria-hidden')).toBe('true')
    expect([canvas.width, canvas.height]).toEqual([800, 72])
    expect([canvas.style.width, canvas.style.height]).toEqual(['400px', '36px'])
  })

  it('a frame copies the band\'s part of the picture and fades its two edges, where the sweep stands', () => {
    const { el } = running(400, 36)
    // Run to a moment when the band is on the bar.
    let ctx = contexts.get(canvasOf(el) as HTMLCanvasElement)
    let copy: Call | undefined
    for (let i = 0; i < 60 && !copy; i++) {
      frame()
      ctx = contexts.get(canvasOf(el) as HTMLCanvasElement)
      copy = ctx?.calls.find((c) => c.op === 'drawImage')
      if (!copy) ctx?.calls.splice(0)
    }
    expect(copy, 'the band came onto the bar within 60 frames').toBeTruthy()
    const calls = ctx!.calls
    const elapsed = now - 1000
    const band = bandAt((elapsed % BAND.sweepMs) / BAND.sweepMs, 400)
    const from = Math.max(0, band.left)
    const to = Math.min(400, band.left + band.width)
    // Cleared whole, in device pixels.
    const cleared = calls.find((c) => c.op === 'clearRect')!
    expect(cleared.args).toEqual([0, 0, 800, 72])
    expect(cleared.transform).toEqual([1, 0, 0, 1, 0, 0])
    // The copy: from the band's left edge on the bar, the bar's own height, at 2 device pixels per CSS pixel.
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = copy!.args as number[]
    expect(dx).toBeCloseTo(from)
    expect(dy).toBe(0)
    expect(dw).toBeCloseTo(Math.min(to - from, tileSize(WAVE_TILE).width - (from % tileSize(WAVE_TILE).width)))
    expect(dh).toBe(36)
    expect(sw).toBeCloseTo(dw * 2)
    expect(sh).toBe(72)
    expect(sx).toBeCloseTo((from % tileSize(WAVE_TILE).width) * 2)
    // One of the two frames of the flicker.
    expect([0, tileSize(WAVE_TILE).height * 2]).toContain(sy)
    expect(copy!.composite).toBe('source-over')
    expect(copy!.transform).toEqual([2, 0, 0, 2, 0, 0])
    // The fade: one fill that keeps the copy as far as the band's ramp lets it through, laid out from the band's left edge.
    const fade = calls.find((c) => c.op === 'fillRect')!
    expect(fade.composite).toBe('destination-in')
    expect(fade.transform[4]).toBeCloseTo(band.left * 2)
    const [fx, fy, fw, fh] = fade.args as number[]
    expect(fx).toBeCloseTo(from - band.left)
    expect([fy, fh]).toEqual([0, 36])
    expect(fw).toBeCloseTo(to - from)
    const gradient = ctx!.fillStyle as { line: number[]; stops: [number, string][] }
    expect(gradient.line).toEqual([0, 0, 400 * BAND.width, 0])
    expect(gradient.stops).toEqual([[0, 'rgba(0,0,0,0)'], [0.45, 'rgba(0,0,0,0.75)'], [0.55, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,0)']])
  })

  it('draws at about thirty frames a second, however fast the screen is', () => {
    const { el } = running(400, 36)
    frame()
    const ctx = contexts.get(canvasOf(el) as HTMLCanvasElement)!
    ctx.calls.splice(0)
    // Six frames of a 120 Hz screen: 50 ms.
    for (let i = 0; i < 6; i++) frame(8.3)
    const draws = ctx.calls.filter((c) => c.op === 'clearRect').length
    expect(draws).toBeLessThanOrEqual(2)
  })

  it('leaves a bar that scrolled away blank, and one that was never seen without a canvas', () => {
    const { el } = running(400, 36)
    const hidden = bar()
    registerBar(hidden)
    resize(hidden, 400, 36)
    sight(hidden, false)
    for (let i = 0; i < 30; i++) frame()
    expect(canvasOf(hidden)).toBeNull()
    const ctx = contexts.get(canvasOf(el) as HTMLCanvasElement)!
    sight(el, false)
    ctx.calls.splice(0)
    for (let i = 0; i < 30; i++) frame()
    expect(ctx.calls.filter((c) => c.op === 'drawImage')).toHaveLength(0)
  })

  it('refits the canvas when the bar changes size', () => {
    const { el } = running(400, 36)
    frame()
    resize(el, 250, 20)
    frame()
    const canvas = canvasOf(el) as HTMLCanvasElement
    expect([canvas.width, canvas.height]).toEqual([500, 40])
    expect(canvas.style.width).toBe('250px')
  })

  it('takes the canvas away when the bar leaves, and stops when the last one has left', () => {
    const { el, leave } = running(400, 36)
    frame()
    expect(canvasOf(el)).not.toBeNull()
    leave()
    expect(canvasOf(el)).toBeNull()
    expect(frames).toHaveLength(0)
    // A second leave is nothing.
    expect(() => leave()).not.toThrow()
  })

  it('draws nothing while the tab is hidden', () => {
    const { el } = running(400, 36)
    frame()
    const ctx = contexts.get(canvasOf(el) as HTMLCanvasElement)!
    ctx.calls.splice(0)
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    for (let i = 0; i < 10; i++) frame()
    expect(ctx.calls).toHaveLength(0)
    hidden.mockRestore()
  })
})

describe('a reader who asked for less motion', () => {
  it('gets the still pattern and nothing else: no canvas, no frame', () => {
    reduced = true
    const el = bar()
    registerBar(el)
    resize(el, 400, 36)
    expect(frames).toHaveLength(0)
    expect(images).toHaveLength(0)
    expect(canvasOf(el)).toBeNull()
  })

  it('the band stops the moment the setting changes, and comes back with it', () => {
    const { el } = running(400, 36)
    frame()
    expect(canvasOf(el)).not.toBeNull()
    reduced = true
    motionListeners.forEach((listener) => listener())
    expect(canvasOf(el)).toBeNull()
    expect(frames).toHaveLength(0)
    reduced = false
    motionListeners.forEach((listener) => listener())
    expect(frames).toHaveLength(1)
  })
})

describe('copyTiled: a bar larger than the shared picture repeats it, on the pattern\'s own grid', () => {
  const tile = tileSize(WAVE_TILE)
  const picture = { width: tile.width * 2, height: tile.height * 2 * 2 }
  const copies = (x: number, width: number, height: number, frameNo = 0) => {
    const calls: number[][] = []
    copyTiled({ drawImage: (...args: unknown[]) => { calls.push(args.slice(1) as number[]) } } as unknown as CanvasRenderingContext2D, picture, frameNo, x, width, height)
    return calls
  }

  it('one copy where the band fits inside one tile', () => {
    expect(copies(100, 200, 36)).toEqual([[200, 0, 400, 72, 100, 0, 200, 36]])
  })

  it('two copies across a tile\'s edge, each starting where the other ends', () => {
    const [a, b] = copies(400, 200, 36)
    // To the tile's right edge, then from the next tile's left edge.
    expect(a).toEqual([800, 0, (tile.width - 400) * 2, 72, 400, 0, tile.width - 400, 36])
    expect(b).toEqual([0, 0, (600 - tile.width) * 2, 72, tile.width, 0, 600 - tile.width, 36])
  })

  it('repeats downwards for a bar taller than the tile, and cuts the last row short', () => {
    const calls = copies(0, 100, tile.height + 50)
    expect(calls).toHaveLength(2)
    expect(calls[0].slice(4)).toEqual([0, 0, 100, tile.height])
    expect(calls[1].slice(4)).toEqual([0, tile.height, 100, 50])
    expect(calls[1][3]).toBe(100) // 50 CSS px of the picture, in its own pixels
  })

  it('reads the second frame from under the first', () => {
    expect(copies(0, 50, 20, 1)[0][1]).toBe(tile.height * 2)
  })

  it('copies nothing for a band of no width', () => {
    expect(copies(100, 0, 36)).toEqual([])
  })
})
