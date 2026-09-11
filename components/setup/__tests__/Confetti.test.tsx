import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import Confetti, { makePieces, stepPieces, prefersReducedMotion } from '../Confetti'

// The orange confetti (owner's brief, 11-09-2026). The maths is exported so it
// can be pinned without a canvas; the component tests pin the two behaviours
// that matter more than the pretty part: it respects reduced motion, and it
// fires once.

// A seeded LCG so makePieces is deterministic here.
function seeded(seed = 7) {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
}

describe('makePieces', () => {
  it('makes 140 rectangles, never circles, from both sides of a centred heading', () => {
    const pieces = makePieces(1440, 1000, seeded())
    expect(pieces).toHaveLength(140)
    // Rectangles: every piece has a width AND a height, and they differ (a
    // square-ish piece would still be a rectangle, but the generator's ranges
    // do not overlap: w 4–9, h 7–14).
    for (const p of pieces) {
      expect(p.w).toBeGreaterThanOrEqual(4)
      expect(p.w).toBeLessThanOrEqual(9)
      expect(p.h).toBeGreaterThanOrEqual(7)
      expect(p.h).toBeLessThanOrEqual(14)
    }
    // Two origins, either side of the heading, a third of the way down.
    const xs = new Set(pieces.map((p) => Math.round(p.x)))
    expect(xs).toEqual(new Set([Math.round(1440 * 0.18), Math.round(1440 * 0.82)]))
    expect(new Set(pieces.map((p) => p.y))).toEqual(new Set([320]))
  })

  it('uses the brand scale with two neutrals — orange with depth, not one flat hue', () => {
    const cols = new Set(makePieces(800, 600, seeded()).map((p) => p.col))
    expect(cols).toEqual(new Set(['#FD5E0F', '#E54E00', '#CC4C0C', '#f4f4f4', '#8a8a8a']))
    // Orange dominates: 4 of every 6 pieces.
    const orange = makePieces(800, 600, seeded()).filter((p) => p.col.startsWith('#FD') || p.col.startsWith('#E5') || p.col.startsWith('#CC'))
    expect(orange.length / 140).toBeCloseTo(4 / 6, 1)
  })

  it('launches pieces upward and outward from their own side', () => {
    const pieces = makePieces(1000, 1000, seeded())
    for (const p of pieces) {
      expect(p.vy).toBeLessThan(0) // up
      // Left-origin pieces mostly head right, right-origin pieces mostly left.
      if (p.x < 500) expect(p.vx).toBeGreaterThan(-3)
      else expect(p.vx).toBeLessThan(3)
    }
  })
})

describe('stepPieces', () => {
  it('applies gravity and drag, and fades only after 1.5 s', () => {
    const pieces = makePieces(1000, 1000, seeded())
    const before = pieces.map((p) => ({ ...p }))
    stepPieces(pieces, 0.5)
    pieces.forEach((p, i) => {
      expect(p.vy).toBeGreaterThan(before[i].vy) // gravity pulls vy toward positive
      expect(Math.abs(p.vx)).toBeLessThanOrEqual(Math.abs(before[i].vx)) // drag
      expect(p.a).toBe(1) // no fade yet
    })
    stepPieces(pieces, 1.85)
    for (const p of pieces) expect(p.a).toBeCloseTo(0.5, 1)
    stepPieces(pieces, 2.3)
    for (const p of pieces) expect(p.a).toBe(0)
  })
})

describe('<Confetti />', () => {
  const realMatchMedia = window.matchMedia
  let rafSpy: ReturnType<typeof vi.spyOn>

  const ctxStub = {
    scale: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(),
    rotate: vi.fn(), fillRect: vi.fn(), globalAlpha: 1, fillStyle: '',
  }
  let getCtxSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
    // jsdom has no 2D canvas; without this the effect bails before it ever animates.
    getCtxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctxStub as unknown as CanvasRenderingContext2D)
  })
  afterEach(() => {
    rafSpy.mockRestore()
    getCtxSpy.mockRestore()
    window.matchMedia = realMatchMedia
  })

  it('renders a full-viewport, click-through, aria-hidden canvas and starts animating', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
    const { getByTestId } = render(<Confetti />)
    const canvas = getByTestId('setup-confetti')
    expect(canvas).toHaveAttribute('aria-hidden', 'true')
    expect(canvas.className).toContain('pointer-events-none')
    expect(canvas.className).toContain('fixed')
    expect(rafSpy).toHaveBeenCalledTimes(1)
  })

  // 🔴 Reduced motion means NO confetti — not slower confetti. The heading says
  // "you're in" in words, so nothing is lost.
  it('does nothing under prefers-reduced-motion, and still reports done', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    expect(prefersReducedMotion()).toBe(true)
    const onDone = vi.fn()
    render(<Confetti onDone={onDone} />)
    expect(rafSpy).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('fires once per mount, not once per render', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
    const { rerender } = render(<Confetti />)
    rerender(<Confetti />)
    rerender(<Confetti />)
    expect(rafSpy).toHaveBeenCalledTimes(1)
  })
})
