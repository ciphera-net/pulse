'use client'

import { useEffect, useRef } from 'react'

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
// ---------------------------------------------------------------------------

const PALETTE = ['#FD5E0F', '#FD5E0F', '#E54E00', '#CC4C0C', '#f4f4f4', '#8a8a8a'] as const
const PIECES = 140
const DURATION_S = 2.2
const FADE_FROM_S = 1.5

interface Piece {
  x: number; y: number; vx: number; vy: number
  w: number; h: number; r: number; vr: number
  col: string; a: number
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Deterministic given `random` so tests can seed it; production passes
 * Math.random. Origins are at 18% and 82% of the width, a third of the way down,
 * i.e. either side of a centred heading.
 */
export function makePieces(width: number, height: number, random: () => number = Math.random): Piece[] {
  const out: Piece[] = []
  for (let i = 0; i < PIECES; i++) {
    const fromLeft = i % 2 === 0
    out.push({
      x: fromLeft ? width * 0.18 : width * 0.82,
      y: height * 0.32,
      vx: (fromLeft ? 1 : -1) * (3 + random() * 7) + (random() - 0.5) * 4,
      vy: -(6 + random() * 9),
      w: 4 + random() * 5,
      h: 7 + random() * 7,
      r: random() * Math.PI,
      vr: (random() - 0.5) * 0.35,
      col: PALETTE[i % PALETTE.length],
      a: 1,
    })
  }
  return out
}

/** One physics step. Exported so the maths is testable without a canvas. */
export function stepPieces(pieces: Piece[], elapsedS: number): void {
  for (const p of pieces) {
    p.vy += 0.32
    p.vx *= 0.985
    p.vy *= 0.985
    p.x += p.vx
    p.y += p.vy
    p.r += p.vr
    if (elapsedS > FADE_FROM_S) p.a = Math.max(0, 1 - (elapsedS - FADE_FROM_S) / (DURATION_S - FADE_FROM_S))
  }
}

export default function Confetti({ onDone }: { onDone?: () => void } = {}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const firedRef = useRef(false)

  useEffect(() => {
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

    const frame = (t: number) => {
      if (start === null) start = t
      const elapsed = (t - start) / 1000
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
  }, [onDone])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="setup-confetti"
      className="pointer-events-none fixed inset-0 z-50 h-screen w-screen"
    />
  )
}
