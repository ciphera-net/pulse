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
  it('places pieces at a time: gravity and drag have acted, and the fade starts only after 1.5 s', () => {
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

  // 🔴 The 120 Hz bug (11-09-2026). Motion used to be a function of how many
  // frames the browser delivered — right at 60 Hz, twice as fast and twice as
  // far on a 120 Hz MacBook. It is a function of elapsed time now: a 120 Hz
  // screen draws twice as many frames and lands every piece exactly where
  // 60 Hz does.
  it('lands 120 Hz exactly on 60 Hz — motion is a function of elapsed time, not of frames delivered', () => {
    const at60 = makePieces(1440, 1000, seeded())
    const at120 = makePieces(1440, 1000, seeded())
    for (let f = 1; f <= 132; f++) stepPieces(at60, f / 60) // 2.2 s of 16.667 ms frames
    for (let f = 1; f <= 264; f++) stepPieces(at120, f / 120) // 2.2 s of 8.333 ms frames
    at60.forEach((p, i) => {
      expect(p.x).toBeCloseTo(at120[i].x, 6)
      expect(p.y).toBeCloseTo(at120[i].y, 6)
      expect(p.r).toBeCloseTo(at120[i].r, 6)
      expect(p.a).toBe(at120[i].a)
    })
  })

  it('is exactly the approved 60 Hz look: matches the per-frame recurrence at every whole frame', () => {
    // The recurrence the burst was tuned and approved on — one step per 60 Hz frame.
    const legacy = makePieces(1440, 1000, seeded())
    const now = makePieces(1440, 1000, seeded())
    for (let f = 1; f <= 132; f++) {
      for (const p of legacy) {
        p.vy += 0.32
        p.vx *= 0.985
        p.vy *= 0.985
        p.x += p.vx
        p.y += p.vy
        p.r += p.vr
      }
      stepPieces(now, f / 60)
      legacy.forEach((p, i) => {
        expect(now[i].x).toBeCloseTo(p.x, 6)
        expect(now[i].y).toBeCloseTo(p.y, 6)
        expect(now[i].vx).toBeCloseTo(p.vx, 6)
        expect(now[i].vy).toBeCloseTo(p.vy, 6)
        expect(now[i].r).toBeCloseTo(p.r, 6)
      })
    }
  })

  it('does not accumulate: where a piece is at a time never depends on the frames drawn before it', () => {
    const once = makePieces(1440, 1000, seeded())
    const many = makePieces(1440, 1000, seeded())
    stepPieces(once, 1.0)
    for (const t of [0.1, 0.9, 0.3, 1.7, 1.0]) stepPieces(many, t) // out of order, repeated
    once.forEach((p, i) => {
      expect(p.x).toBe(many[i].x)
      expect(p.y).toBe(many[i].y)
      expect(p.r).toBe(many[i].r)
    })
  })

  it('pins the design-doc simulation (§10.1): a typical piece is 156/−124 px from launch at 0.5 s and 254/+27 px at 1 s', () => {
    const piece = { ...makePieces(1000, 1000, seeded())[0], x0: 0, y0: 0, vx0: 6.5, vy0: -10.5 }
    stepPieces([piece], 0.5)
    expect(Math.abs(piece.x - 156)).toBeLessThan(1)
    expect(Math.abs(piece.y - -124)).toBeLessThan(1)
    stepPieces([piece], 1.0)
    expect(Math.abs(piece.x - 254)).toBeLessThan(1)
    expect(Math.abs(piece.y - 27)).toBeLessThan(1)
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

  // 🔴 12-09-2026: the done page mounts this inside a framer-motion wrapper that
  // scales 0.95 → 1. A transformed ancestor is the containing block for its
  // position:fixed descendants, so the canvas was anchored to the setup card and
  // snapped to the viewport when the animation ended. The canvas therefore lives
  // in <body>, wherever the component is rendered.
  it('mounts the canvas directly in <body>, not under a transformed ancestor', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
    const { container, getByTestId } = render(
      <div style={{ transform: 'scale(0.95)' }} data-testid="animated-card">
        <Confetti />
      </div>,
    )
    const canvas = getByTestId('setup-confetti')
    expect(canvas.parentElement).toBe(document.body)
    expect(container.querySelector('[data-testid="setup-confetti"]')).toBeNull()
    expect(rafSpy).toHaveBeenCalledTimes(1) // and it still fires, from the portalled canvas
  })

  it('fires once per mount, not once per render', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
    const { rerender } = render(<Confetti />)
    rerender(<Confetti />)
    rerender(<Confetti />)
    expect(rafSpy).toHaveBeenCalledTimes(1)
  })
})
