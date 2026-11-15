'use client'

import { useEffect, useRef, type ReactNode } from 'react'

// ---------------------------------------------------------------------------
// The toolbar that stays (the new dashboard frame, owner ruling R3 of 14-11-2026).
//
// The live count, the filter and the date range stay at the top of the content panel while the page moves under
// them, on the marketing header's band: glass that is not there at rest and comes in over the first 24 px of
// scroll (styles/globals.css, `.glass-band`).
//
// How it is built, and why:
//   * `position: sticky` against whatever scrolls the page. In the app that is the shell's <main>, whose top
//     spacing lives inside the scrolled content, so `top: 0` is the panel's upper edge.
//   * The band is its OWN element behind the controls, never a background on the row: an element with a backdrop
//     filter becomes the containing block of every fixed descendant, and the row holds the date menu's and the
//     filter's triggers.
//   * It spans the panel whatever the page's width limit is, by MEASURE: its reach past the row on each side is
//     the distance from the row's edge to the panel's (bandReach), read when it mounts and whenever the panel or
//     the row changes size. It used to reach a fixed 100vw to either side and leave the cutting to the panel. To
//     the right that made the panel's scroll area 762 px wide in a 388 px panel: hidden, and still reachable by a
//     selection dragged to the edge, which moved the whole page sideways. Measured, it adds nothing.
//   * Its opacity follows the scroll position directly (one write per frame, no state, no transition), so it
//     reads the same in every browser and has nothing to animate under reduced motion.
// ---------------------------------------------------------------------------

/** The band is fully there once the page has moved this far (the marketing header's own threshold). */
export const BAND_FADE_PX = 24

/** How much of the band shows at a scroll position: 0 at rest, 1 from BAND_FADE_PX on. */
export function bandOpacity(scrollTop: number): number {
  if (!Number.isFinite(scrollTop)) return 0
  return Math.max(0, Math.min(1, scrollTop / BAND_FADE_PX))
}

/**
 * How far the band reaches past the row on each side to end at the panel's edges. Never negative: a row wider than
 * its panel gets no band outside itself. Whole pixels, rounded so that the right edge can only fall short of the
 * panel's (by less than a pixel), never pass it: whatever passes it is scroll area.
 */
export function bandReach(
  row: { left: number; right: number },
  panel: { left: number; right: number },
): { left: number; right: number } {
  const left = row.left - panel.left
  const right = panel.right - row.right
  return {
    left: Number.isFinite(left) ? Math.max(0, Math.ceil(left)) : 0,
    right: Number.isFinite(right) ? Math.max(0, Math.floor(right)) : 0,
  }
}

/** The nearest ancestor that scrolls up and down, or null when the window does. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return node
  }
  return null
}

export default function FrameToolbar({ children }: { children: ReactNode }) {
  const rowRef = useRef<HTMLDivElement>(null)
  const bandRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const row = rowRef.current
    const band = bandRef.current
    if (!row || !band) return
    const scroller = scrollParent(row)
    const target: HTMLElement | Window = scroller ?? window
    let frame = 0
    const paint = () => {
      frame = 0
      band.style.opacity = String(bandOpacity(scroller ? scroller.scrollTop : window.scrollY))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(paint)
    }
    // The band's two ends: the panel's inner box (what the page is seen through, a classic scrollbar's own
    // width left out), or the window's when the window scrolls.
    const place = () => {
      let left = 0
      let right = document.documentElement.clientWidth
      if (scroller) {
        left = scroller.getBoundingClientRect().left + scroller.clientLeft
        right = left + scroller.clientWidth
      }
      const reach = bandReach(row.getBoundingClientRect(), { left, right })
      band.style.left = `${-reach.left}px`
      band.style.right = `${-reach.right}px`
    }
    place()
    paint()
    target.addEventListener('scroll', onScroll, { passive: true })
    // The panel changes width with the window and with the sidebar; the row with the page's width limit.
    window.addEventListener('resize', place)
    const sizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    sizes?.observe(scroller ?? document.documentElement)
    sizes?.observe(row)
    return () => {
      target.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', place)
      sizes?.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    // 10 px of the band above and under the controls, taken back by the margins: at rest the controls sit where
    // they always did, 12 px over the chart.
    <div ref={rowRef} className="sticky top-0 z-40 -mt-2.5 mb-0.5 py-2.5" data-testid="frame-toolbar">
      <div
        ref={bandRef}
        aria-hidden="true"
        data-testid="frame-toolbar-band"
        // The row's own box until it is measured (the effect above), so it never reaches past the panel.
        className="glass-band pointer-events-none absolute inset-0 -z-10"
        style={{ opacity: 0 }}
      />
      {/* flex-wrap, as outside the frame: on a phone the controls take two lines and the band covers both. */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">{children}</div>
    </div>
  )
}
