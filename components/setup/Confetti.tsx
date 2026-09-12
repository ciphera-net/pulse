'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// ---------------------------------------------------------------------------
// Orange confetti for the end of setup (owner's brief, 11-09-2026).
//
// THE SHAPE IS THE HOUSE'S. Facet's border radius is 0 everywhere except status
// dots and avatars, so the pieces are RECTANGLES: round confetti would be the
// one round thing on the page. The palette is the brand scale — #FD5E0F,
// #E54E00, #CC4C0C — with two neutrals (#f4f4f4, #8a8a8a) at a third of the
// pieces, so it reads as orange with depth rather than one flat hue. Two bursts,
// one from each side, meeting above the heading; gravity and drag; 2.2 s; then
// the canvas unmounts and nothing is left behind.
//
// 🔴 IT FIRES ONCE, AND ONLY WHEN THE CALLER SAYS SO. The component has no
// opinion about completion; the done page mounts it under the same gate as
// `welcome_completed` (payment settled or confirmed — F-B14), and a ref latch
// here means a re-render cannot fire it twice. It also never fires under
// `prefers-reduced-motion: reduce` — the heading says "you're in" in words, so
// nothing is lost.
//
// No dependency. ~90 lines is cheaper to own than to import, and the estate has
// no motion library beyond framer-motion, which is the wrong tool for a
// particle burst.
//
// 🔴 THE CANVAS IS PORTALLED TO <body> (12-09-2026). `position: fixed` resolves
// against the viewport ONLY while no ancestor has a transform, filter,
// backdrop-filter, perspective or will-change: transform — any of those makes
// that ancestor the containing block. The done page mounts this inside a
// framer-motion wrapper that scales 0.95 → 1 over 0.5 s, so the burst was
// anchored to the setup card: the left origin landed at 54 % of the screen,
// the right origin off it (measured: canvas at (520,185) on a 1440-px
// viewport, right origin at x≈1700), and when the animation finished and the
// transform went to `none` the whole canvas snapped to the viewport corner —
// the owner's "starts middle-right, right half off-screen, then suddenly
// finishes at the top". Every headless capture had looked right because it
// sampled the canvas's own pixels, not where the canvas was. <body> has no
// transform, so a portal is the one place a fixed overlay is actually fixed.
// Same trap as Facet's CommandPalette (0.11.3).
// ---------------------------------------------------------------------------

const PALETTE = ['#FD5E0F', '#FD5E0F', '#E54E00', '#CC4C0C', '#f4f4f4', '#8a8a8a'] as const
const PIECES = 140
const DURATION_S = 2.2
const FADE_FROM_S = 1.5
/**
 * Wall-clock → burst-time ratio. The burst was tuned at 1.0 and the owner asked
 * for "a bit faster" (12-09-2026, option A): 1.3× ends it in ~1.7 s instead of
 * 2.2 s, fade included. Applied in the frame loop, so `stepPieces` and its
 * tests keep speaking in burst seconds.
 */
const SPEED = 1.3
/**
 * Launch points as fractions of the viewport (owner's pick A, 12-09-2026):
 * either side of the icon frame at heading height, so the burst visibly
 * ERUPTS at the thing being celebrated and climbs over the rail before it
 * falls. The first version launched from 18 % / 82 % a third of the way down,
 * which reads as pieces appearing from the wings — the start went unseen.
 */
const ORIGIN_X_LEFT = 0.36
const ORIGIN_X_RIGHT = 0.64
const ORIGIN_Y = 0.47

// The motion constants were tuned by eye at 60 Hz, so a "frame" below is one
// sixtieth of a second of ELAPSED TIME — never a frame the browser delivered.
const FRAME_MS = 1000 / 60
/** Added to vy once per frame (px per frame, per frame). */
const GRAVITY = 0.32
/** Fraction of velocity kept per frame. */
const DRAG = 0.985

interface Piece {
  // Launch state, fixed for the life of the burst.
  x0: number; y0: number; vx0: number; vy0: number; r0: number; vr: number
  // Where the piece is at the elapsed time of the last `stepPieces` call.
  x: number; y: number; vx: number; vy: number; r: number
  w: number; h: number
  col: string; a: number
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Deterministic given `random` so tests can seed it; production passes
 * Math.random. Origins are either side of the icon frame at heading height
 * (see ORIGIN_*), and the launch is strong enough to clear the rail above.
 */
export function makePieces(width: number, height: number, random: () => number = Math.random): Piece[] {
  const out: Piece[] = []
  for (let i = 0; i < PIECES; i++) {
    const fromLeft = i % 2 === 0
    const x = fromLeft ? width * ORIGIN_X_LEFT : width * ORIGIN_X_RIGHT
    const y = height * ORIGIN_Y
    // The order of the `random()` calls is part of the contract with the
    // seeded tests — keep it.
    const vx = (fromLeft ? 1 : -1) * (3 + random() * 7) + (random() - 0.5) * 4
    const vy = -(9 + random() * 10)
    const w = 4 + random() * 5
    const h = 7 + random() * 7
    const r = random() * Math.PI
    const vr = (random() - 0.5) * 0.35
    out.push({
      x0: x, y0: y, vx0: vx, vy0: vy, r0: r, vr,
      x, y, vx, vy, r,
      w, h,
      col: PALETTE[i % PALETTE.length],
      a: 1,
    })
  }
  return out
}

/**
 * Place every piece where it is `elapsedS` seconds after launch.
 *
 * 🔴 A FUNCTION OF TIME, NOT OF FRAMES (11-09-2026). The first version added
 * gravity, applied drag and moved each piece ONCE PER requestAnimationFrame,
 * which is right only at 60 Hz. On a 120 Hz screen — every recent MacBook
 * Pro — the burst ran twice as fast and twice as far. Reproduced under a
 * deterministic 120 Hz RAF shim: the state at 0.5 s was pixel-identical to
 * the 60 Hz state at 1.0 s, 80 % of the pieces had left the viewport by 1 s,
 * and nothing was left at 1.5 s, when the fade begins. Every headless capture
 * had looked right because headless Chromium runs at 60 Hz.
 *
 * The 60 Hz recurrence the look was approved in is, per frame,
 *     v' = (v + g)·k          p' = p + v'
 * and this is its CLOSED FORM at a real-valued frame count τ = elapsed / 16.667 ms:
 *     v(τ) = k^τ·v₀ + g·k·(1 − k^τ)/(1 − k)
 *     p(τ) = p₀ + v₀·S(τ) + g·k/(1 − k)·(τ − S(τ)),   S(τ) = k·(1 − k^τ)/(1 − k) = Σᵢ₌₁^τ kⁱ
 * At whole frames it lands exactly on the approved positions; between them it
 * interpolates. Nothing accumulates, so the refresh rate, a dropped frame or a
 * background tab can change WHEN a piece is drawn, never WHERE. (Stepping by a
 * variable dt was the obvious alternative and is not exact: 60 steps of dt=1
 * and 120 steps of dt=0.5 disagree by ~3 px at 1 s.)
 */
export function stepPieces(pieces: Piece[], elapsedS: number): void {
  const tau = (Math.max(0, elapsedS) * 1000) / FRAME_MS
  const kt = Math.pow(DRAG, tau)
  const sum = (DRAG * (1 - kt)) / (1 - DRAG)
  const gravityV = (GRAVITY * DRAG * (1 - kt)) / (1 - DRAG)
  const gravityP = ((GRAVITY * DRAG) / (1 - DRAG)) * (tau - sum)
  const alpha = elapsedS > FADE_FROM_S
    ? Math.max(0, 1 - (elapsedS - FADE_FROM_S) / (DURATION_S - FADE_FROM_S))
    : 1
  for (const p of pieces) {
    p.vx = p.vx0 * kt
    p.vy = p.vy0 * kt + gravityV
    p.x = p.x0 + p.vx0 * sum
    p.y = p.y0 + p.vy0 * sum + gravityP
    p.r = p.r0 + p.vr * tau
    p.a = alpha
  }
}

export default function Confetti({ onDone }: { onDone?: () => void } = {}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const firedRef = useRef(false)
  // The portal target, known only on the client; the canvas mounts on the
  // render after this is set, and the burst starts on the effect after that.
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => { setHost(document.body) }, [])

  useEffect(() => {
    if (!host) return
    if (firedRef.current) return
    firedRef.current = true
    if (prefersReducedMotion()) { onDone?.(); return }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const W = window.innerWidth
    const H = window.innerHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    const pieces = makePieces(W, H)
    let raf = 0
    let start: number | null = null
    let finished = false

    // Each frame places the pieces at the elapsed BURST time (wall-clock ×
    // SPEED) and draws them; the frame count plays no part (see stepPieces).
    const frame = (t: number) => {
      if (start === null) start = t
      const elapsed = ((t - start) / 1000) * SPEED
      ctx.clearRect(0, 0, W, H)
      stepPieces(pieces, elapsed)
      for (const p of pieces) {
        ctx.save()
        ctx.globalAlpha = p.a
        ctx.translate(p.x, p.y)
        ctx.rotate(p.r)
        ctx.fillStyle = p.col
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      }
      if (elapsed < DURATION_S) {
        raf = requestAnimationFrame(frame)
      } else {
        finished = true
        ctx.clearRect(0, 0, W, H)
        onDone?.()
      }
    }
    raf = requestAnimationFrame(frame)

    return () => {
      if (!finished) cancelAnimationFrame(raf)
    }
  }, [host, onDone])

  if (!host) return null
  return createPortal(
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="setup-confetti"
      className="pointer-events-none fixed inset-0 z-50 h-screen w-screen"
    />,
    host,
  )
}
