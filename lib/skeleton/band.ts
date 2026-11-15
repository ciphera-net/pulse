/**
 * The orange band that sweeps across Pulse's skeleton bars (lib/skeleton/dither.ts says what the look is).
 *
 * A bar's still pattern is CSS and needs none of this. This module adds the band once the page runs: every bar
 * tells it that it is there (`registerBar`), and ONE loop draws the band on a small canvas inside each bar that
 * is on screen, about thirty times a second.
 *
 * How it stays cheap:
 *   - The band's glyphs are drawn ONCE for the whole page, into one shared picture of two frames (the glyphs
 *     flicker between them). A bar's frame is a copy of the part of that picture the band covers, and one fill
 *     that fades its two edges. No bar rasterises anything of its own.
 *   - A bar's size comes from a resize observer and whether it is on screen from an intersection observer, so the
 *     loop reads no layout.
 *   - Bars off screen, a hidden tab and reduced motion draw nothing. With reduced motion, or the look switched
 *     off, there is no canvas and no loop at all.
 *
 * The sweep, the fade of the band's edges and the 30 frames a second are ascii-reveal's (src/core/skeleton-anim.ts,
 * MIT, Copyright (c) 2026 Quan Hoang; see THIRD-PARTY-NOTICES.md). The library draws each bar's glyphs into a
 * picture of its own and copies sixteen strips of it a frame; the shared picture and the single fade are ours.
 */
import { BAND, WAVE_TILE, bandAt, tileSize, waveTileSvg } from './dither'
import { newLookOn, onNewLookChange } from './look'

/** About 30 frames a second: the glyphs only change every 120 ms. */
const FRAME_MS = 33
/** A phone at three device pixels per CSS pixel draws the band at two: nobody reads a dither at 3x. */
const MAX_DENSITY = 2

interface Bar {
  el: HTMLElement
  canvas: HTMLCanvasElement | null
  ctx: CanvasRenderingContext2D | null
  /** The bar's box in CSS pixels, from the resize observer. 0 until it has been measured. */
  width: number
  height: number
  /** The canvas no longer fits the box. */
  stale: boolean
  /** On screen, by the intersection observer. */
  seen: boolean
  /** Nothing is drawn on the canvas right now. */
  blank: boolean
  /** The fade of the band's two edges, for this bar's width: made when the canvas is fitted. */
  fade: CanvasGradient | null
}

const bars = new Map<HTMLElement, Bar>()
let running = false
let raf = 0
let last = 0
let origin = 0
let sizes: ResizeObserver | null = null
let sights: IntersectionObserver | null = null
let motion: MediaQueryList | null = null
let wired = false
/** Stops listening to the look (what `wire` started). */
let unwire: (() => void) | null = null

/** The band's two frames, drawn once per pixel density. `asked` is the density being loaded or loaded. */
let picture: HTMLCanvasElement | null = null
let pictureDensity = 0
let asked = 0

/**
 * A skeleton bar says it is on the page. Returns what its unmount calls. Safe on the server and where there is
 * no canvas: nothing happens.
 */
export function registerBar(el: HTMLElement): () => void {
  if (typeof window === 'undefined') return () => {}
  wire()
  const bar: Bar = { el, canvas: null, ctx: null, width: 0, height: 0, stale: true, seen: false, blank: true, fade: null }
  bars.set(el, bar)
  if (running) watch(bar)
  else sync()
  return () => {
    if (bars.get(el) !== bar) return
    bars.delete(el)
    sizes?.unobserve(el)
    sights?.unobserve(el)
    strip(bar)
    sync()
  }
}

/** Listens, once, to the two things that start and stop the band: the look and the reader's motion setting. */
function wire() {
  if (wired) return
  wired = true
  unwire = onNewLookChange(sync)
  if (typeof window.matchMedia === 'function') {
    motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    motion.addEventListener?.('change', sync)
  }
}

/** Starts or stops the loop: it runs while the look is on, motion is allowed and there is a bar to draw. */
function sync() {
  const want = bars.size > 0 && newLookOn() && !motion?.matches
  if (want === running) return
  running = want
  if (want) {
    if (typeof ResizeObserver !== 'undefined') sizes = new ResizeObserver(measured)
    if (typeof IntersectionObserver !== 'undefined') sights = new IntersectionObserver(sighted)
    bars.forEach(watch)
    if (!origin) origin = performance.now()
    raf = requestAnimationFrame(tick)
  } else {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    sizes?.disconnect()
    sights?.disconnect()
    sizes = null
    sights = null
    bars.forEach((bar) => {
      strip(bar)
      bar.seen = false
    })
  }
}

function watch(bar: Bar) {
  sizes?.observe(bar.el)
  // Without an intersection observer every bar counts as on screen.
  if (sights) sights.observe(bar.el)
  else bar.seen = true
}

function measured(entries: ResizeObserverEntry[]) {
  for (const entry of entries) {
    const bar = bars.get(entry.target as HTMLElement)
    if (!bar) continue
    const box = entry.borderBoxSize?.[0]
    const width = box ? box.inlineSize : entry.contentRect.width
    const height = box ? box.blockSize : entry.contentRect.height
    if (width === bar.width && height === bar.height) continue
    bar.width = width
    bar.height = height
    bar.stale = true
  }
}

function sighted(entries: IntersectionObserverEntry[]) {
  for (const entry of entries) {
    const bar = bars.get(entry.target as HTMLElement)
    if (!bar) continue
    bar.seen = entry.isIntersecting
    if (!bar.seen) wipe(bar)
  }
}

/** Takes a bar's canvas away and frees its pixels at once (Safari keeps a detached canvas's memory until it is collected). */
function strip(bar: Bar) {
  if (bar.canvas) {
    bar.canvas.width = 0
    bar.canvas.height = 0
    bar.canvas.remove()
  }
  bar.canvas = null
  bar.ctx = null
  bar.fade = null
  bar.stale = true
  bar.blank = true
}

function wipe(bar: Bar) {
  if (!bar.ctx || !bar.canvas || bar.blank) return
  bar.ctx.setTransform(1, 0, 0, 1, 0, 0)
  bar.ctx.clearRect(0, 0, bar.canvas.width, bar.canvas.height)
  bar.blank = true
}

function tick(now: number) {
  raf = running ? requestAnimationFrame(tick) : 0
  if (document.hidden || now - last < FRAME_MS) return
  last = now
  const density = Math.min(MAX_DENSITY, window.devicePixelRatio || 1)
  const wave = wavePicture(density)
  if (!wave) return
  const elapsed = now - origin
  const at = (elapsed % BAND.sweepMs) / BAND.sweepMs
  const frame = Math.floor(elapsed / BAND.flickMs) % 2
  bars.forEach((bar) => {
    if (!bar.seen || bar.width <= 0 || bar.height <= 0 || !bar.el.isConnected) return
    draw(bar, wave, at, frame, density)
  })
}

function draw(bar: Bar, wave: HTMLCanvasElement, at: number, frame: number, density: number) {
  if (!bar.canvas) {
    const canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    bar.el.appendChild(canvas)
    bar.canvas = canvas
    bar.ctx = ctx
    bar.stale = true
  }
  const { canvas, ctx } = bar
  if (!canvas || !ctx) return
  if (bar.stale) {
    canvas.width = Math.max(1, Math.ceil(bar.width * density))
    canvas.height = Math.max(1, Math.ceil(bar.height * density))
    canvas.style.width = `${bar.width}px`
    canvas.style.height = `${bar.height}px`
    // The band's two edges: nothing, all of it from 45% to 55% of its width, nothing.
    const fade = ctx.createLinearGradient(0, 0, bar.width * BAND.width, 0)
    fade.addColorStop(0, 'rgba(0,0,0,0)')
    fade.addColorStop(0.45, `rgba(0,0,0,${BAND.opacity})`)
    fade.addColorStop(0.55, `rgba(0,0,0,${BAND.opacity})`)
    fade.addColorStop(1, 'rgba(0,0,0,0)')
    bar.fade = fade
    bar.stale = false
    bar.blank = true
  }
  const band = bandAt(at, bar.width)
  const from = Math.max(0, band.left)
  const to = Math.min(bar.width, band.left + band.width)
  if (to <= from) {
    wipe(bar)
    return
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  // The band's glyphs where the band stands, in the bar's own pixels.
  ctx.setTransform(density, 0, 0, density, 0, 0)
  copyTiled(ctx, wave, frame, from, to - from, bar.height)
  // Its edges: what was copied is kept only as far as the fade lets it through. The fade is laid out from the
  // band's own left edge, so the context is moved there instead of making a gradient every frame.
  if (bar.fade) {
    ctx.setTransform(density, 0, 0, density, band.left * density, 0)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.fillStyle = bar.fade
    ctx.fillRect(from - band.left, 0, to - from, bar.height)
  }
  bar.blank = false
}

/**
 * Copies one frame of the shared picture onto a bar from `x` for `width`, repeating the picture where the bar is
 * larger than it. The picture starts at the bar's top left corner, as the still pattern does, so the band's glyphs
 * stand on the pattern's cells.
 */
export function copyTiled(
  ctx: Pick<CanvasRenderingContext2D, 'drawImage'>,
  wave: HTMLCanvasElement | { width: number; height: number },
  frame: number,
  x: number,
  width: number,
  height: number,
): void {
  const tile = tileSize(WAVE_TILE)
  // The picture's pixels per CSS pixel, as it was really drawn (a density of 1.25 rounds its size).
  const kx = wave.width / tile.width
  const ky = wave.height / (tile.height * 2)
  for (let top = 0; top < height; top += tile.height) {
    const rows = Math.min(tile.height, height - top)
    for (let left = Math.floor(x / tile.width) * tile.width; left < x + width; left += tile.width) {
      const a = Math.max(x, left)
      const b = Math.min(x + width, left + tile.width)
      if (b <= a) continue
      ctx.drawImage(wave as HTMLCanvasElement, (a - left) * kx, frame * tile.height * ky, (b - a) * kx, rows * ky, a, top, b - a, rows)
    }
  }
}

/** The shared picture at a pixel density, or null while it is being drawn (the band waits a few frames for it). */
function wavePicture(density: number): HTMLCanvasElement | null {
  if (picture && pictureDensity === density) return picture
  if (asked === density) return null
  asked = density
  const image = new Image()
  image.onload = () => {
    if (asked !== density) return
    const tile = tileSize(WAVE_TILE)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(tile.width * density)
    canvas.height = Math.round(tile.height * 2 * density)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    if (picture) {
      picture.width = 0
      picture.height = 0
    }
    picture = canvas
    pictureDensity = density
  }
  // A picture that cannot be drawn leaves the bars with their still pattern: `asked` stays, so it is not tried
  // again on every frame.
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(waveTileSvg(density))}`
  return null
}

/** For tests: forget every bar and the shared picture, as on a fresh page. */
export function resetBandForTests(): void {
  bars.forEach(strip)
  bars.clear()
  if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
  raf = 0
  running = false
  last = 0
  origin = 0
  sizes?.disconnect()
  sights?.disconnect()
  sizes = null
  sights = null
  picture = null
  pictureDensity = 0
  asked = 0
  unwire?.()
  unwire = null
  motion?.removeEventListener?.('change', sync)
  motion = null
  wired = false
}
