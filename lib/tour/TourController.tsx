'use client'

import { useEffect, useRef } from 'react'
import { driver, type Driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import { toast } from '@ciphera-net/facet'
import { useAuth } from '@/lib/auth/context'
import { useSidebar } from '@/lib/sidebar-context'
import {
  TOUR_DONE_PREFIX,
  TOUR_MD_QUERY,
  TOUR_REQUEST_KEY,
  TOUR_REQUEST_TTL_MS,
  TOUR_START_EVENT,
} from './constants'
import { TOUR_STEPS, TOUR_READY_SELECTORS, findStepElement, type TourStepDef } from './steps'
import { trackTourCompleted, trackTourSkipped, trackTourStarted, trackTourStepViewed } from './analytics'

/**
 * The product tour (driver.js), mounted by the site dashboard page.
 * Renders nothing — driver.js draws the overlay imperatively.
 *
 * Auto-starts once per user (localStorage `pulse_tour_done_{userId}`) on a
 * dashboard visit; restarts on demand via the ⌘K action (sessionStorage
 * one-shot + window event, see lib/tour/constants.ts). Desktop md+ only —
 * the owner ruled out a mobile tour, which is what lets every step take the
 * first *visible* anchor mount and skip nothing.
 *
 * Anchors are awaited, never assumed: the deck is client-only behind a
 * ≥300ms skeleton with no ready signal, so start() polls for the two
 * latest-mounting anchors before driving. The step list is then built from
 * the anchors that are actually PRESENT for this user — an absent or hidden
 * target is dropped and the counter renumbers, instead of driver spotlighting
 * a 0×0 rect or hanging on a wait (measured failure modes, 24-08 audit).
 *
 * Three drawing facts this controller owns (same audit):
 * - driver binds `scroll` on window WITHOUT capture, and the app scrolls in
 *   <main> — container scrolls (including driver's own scrollIntoView between
 *   steps) never trigger its refresh, stranding the cutout and parking the
 *   popover on top of its own target. A capture-phase scroll listener calls
 *   refresh() while the tour runs.
 * - the spotlight ring is a fixed-position element, not an outline on the
 *   target — outlines are clipped by ancestor overflow (the deck Card is
 *   overflow-hidden; the rail's ring rendered as one edge).
 * - teardown is owned here, not by driver's onDestroyed hook: driver gates it
 *   on transition state that exists only ~400ms after drive(), so an early
 *   Esc would skip the done-key, the sidebar restore, and the analytics.
 *   finish() is idempotent; every exit path calls it.
 */
export default function TourController() {
  const { user } = useAuth()
  const sidebar = useSidebar()

  const userIdRef = useRef<string | null>(null)
  const sidebarRef = useRef(sidebar)

  const driverRef = useRef<Driver | null>(null)
  const activeRef = useRef(false)
  const autoTriedRef = useRef(false)
  const unmountedRef = useRef(false)
  const completedRef = useRef(false)
  const finishedRef = useRef(false)
  const lastIndexRef = useRef(0)
  const sidebarWasCollapsedRef = useRef(false)
  const ringRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef(0)

  const startRef = useRef<(trigger: 'auto' | 'manual') => Promise<void>>(async () => {})
  const finishRef = useRef<() => void>(() => {})

  const restoreSidebar = () => {
    if (sidebarWasCollapsedRef.current) sidebarRef.current.collapse()
  }

  /** Place the ring 1px inside the cutout edge (stagePadding 7 → inset 6). */
  const syncRing = () => {
    const ring = ringRef.current
    const d = driverRef.current
    if (!ring || !d) return
    const el = d.getActiveElement()
    if (!el || el.id === 'driver-dummy-element') {
      ring.style.display = 'none'
      return
    }
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) {
      ring.style.display = 'none'
      return
    }
    const PAD = 6
    ring.style.display = 'block'
    ring.style.left = `${r.left - PAD}px`
    ring.style.top = `${r.top - PAD}px`
    ring.style.width = `${r.width + PAD * 2}px`
    ring.style.height = `${r.height + PAD * 2}px`
  }

  // Container scrolls never reach driver's own (bubble-phase, window-only)
  // scroll listener; non-bubbling events still traverse the capture phase,
  // so this one sees <main> scrolling and re-syncs cutout + popover + ring.
  const onViewportChange = () => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      driverRef.current?.refresh()
      syncRing()
    })
  }

  const detachDrawing = () => {
    window.removeEventListener('scroll', onViewportChange, true)
    window.removeEventListener('resize', onViewportChange)
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    ringRef.current?.remove()
    ringRef.current = null
  }
  const detachDrawingRef = useRef(detachDrawing)
  const onViewportChangeRef = useRef(onViewportChange)

  /**
   * Bookkeeping for a tour that actually SHOWED (drive() ran): stamp the
   * per-user key — both Done and any skip path count as seen, auto-start
   * happens once ever — restore a borrowed sidebar, emit the outcome.
   * Idempotent: several exit paths may overlap (driver's own hooks, the
   * explicit destroy calls, the unmount cleanup).
   */
  const finish = () => {
    if (finishedRef.current) return
    finishedRef.current = true
    activeRef.current = false
    driverRef.current = null
    detachDrawingRef.current()
    const uid = userIdRef.current
    if (uid) {
      try {
        localStorage.setItem(`${TOUR_DONE_PREFIX}${uid}`, String(Date.now()))
      } catch {
        // storage unavailable — the tour may auto-offer again next visit
      }
    }
    restoreSidebar()
    if (completedRef.current) trackTourCompleted()
    else trackTourSkipped(lastIndexRef.current)
  }

  const start = async (trigger: 'auto' | 'manual') => {
    if (activeRef.current || unmountedRef.current) return
    if (!window.matchMedia(TOUR_MD_QUERY).matches) return
    const userId = userIdRef.current
    if (!userId) return
    activeRef.current = true
    completedRef.current = false
    finishedRef.current = false
    lastIndexRef.current = 0

    // The closing step needs the nav labels, and expanding mid-tour would
    // shift every rect — so the rail is expanded for the whole run and the
    // user's state restored on every exit path.
    sidebarWasCollapsedRef.current = sidebarRef.current.collapsed
    if (sidebarWasCollapsedRef.current) {
      sidebarRef.current.expand()
      await sleep(400)
    }

    const ready = await waitForSelectors(TOUR_READY_SELECTORS, 15_000)
    if (unmountedRef.current) {
      activeRef.current = false
      restoreSidebar()
      return
    }
    if (!ready) {
      activeRef.current = false
      restoreSidebar()
      if (trigger === 'manual') {
        toast.error('The tour needs a loaded dashboard — try again in a moment.')
      }
      return
    }

    // The tour this user actually gets: the welcome plus every step whose
    // target exists and is visible RIGHT NOW. A user without some surface
    // gets a shorter, honestly-numbered tour — never a corner-pinned
    // spotlight or an 8-second dimmed wait for an element that isn't coming.
    const presentSteps = TOUR_STEPS.filter((def) => def.anchor === null || Boolean(findStepElement(def)))
    if (presentSteps.length < 2) {
      activeRef.current = false
      restoreSidebar()
      if (trigger === 'manual') {
        toast.error('The tour needs a loaded dashboard — try again in a moment.')
      }
      return
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const d = driver({
      animate: !reduced,
      smoothScroll: !reduced,
      overlayColor: '#000',
      overlayOpacity: 0.55,
      stagePadding: 7,
      stageRadius: 0,
      allowClose: true,
      overlayClickBehavior: 'close',
      disableActiveInteraction: true,
      popoverClass: 'pulse-tour',
      popoverOffset: 14,
      showButtons: ['next', 'previous'],
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Done',
      // Per-popover showProgress is OR-merged with this, so the config stays
      // false and counted steps opt in — the welcome is deliberately uncounted.
      showProgress: false,
      // A target that vanishes MID-tour (the start-time filter already
      // removed the never-present ones) gets a short grace, then its step is
      // skipped — never the dimmed dead-air of a long wait.
      waitForElement: 2_500,
      skipMissingElement: true,
      onPopoverRender: (popover, opts) => {
        const idx = opts.index ?? driverRef.current?.getActiveIndex() ?? 0
        const head = document.createElement('div')
        head.className = 'pulse-tour-head'
        popover.title.parentElement?.insertBefore(head, popover.title)
        head.appendChild(popover.title)
        if (idx > 0) {
          // The chip's progress anatomy: counter beside the title, 1px-family
          // bar full-bleed under the header row.
          head.appendChild(popover.progress)
          const bar = document.createElement('div')
          bar.className = 'pulse-tour-bar'
          const fill = document.createElement('div')
          fill.style.width = `${Math.round((idx / (presentSteps.length - 1)) * 100)}%`
          bar.appendChild(fill)
          head.insertAdjacentElement('afterend', bar)
        }
      },
      onHighlightStarted: () => {
        // The ring must not sit at the previous step's rect while the cutout
        // tweens to the next one.
        if (ringRef.current) ringRef.current.style.display = 'none'
      },
      onHighlighted: (_el, _step, opts) => {
        const idx = opts.index ?? driverRef.current?.getActiveIndex() ?? 0
        lastIndexRef.current = idx
        trackTourStepViewed(idx)
        syncRing()
      },
      // Esc and overlay clicks route through this hook INSTEAD of tearing
      // down (driver's confirm-dialog contract); the public destroy() —
      // h(false) — skips the hook, so calling it here does not recurse.
      onDestroyStarted: () => {
        driverRef.current?.destroy()
        finishRef.current()
      },
      onDestroyed: () => {
        finishRef.current()
      },
      steps: buildSteps(presentSteps),
    })
    driverRef.current = d
    const ring = document.createElement('div')
    ring.className = 'pulse-tour-ring'
    ring.id = 'pulse-tour-ring'
    ring.style.display = 'none'
    document.body.appendChild(ring)
    ringRef.current = ring
    window.addEventListener('scroll', onViewportChangeRef.current, true)
    window.addEventListener('resize', onViewportChangeRef.current)
    d.drive()
    trackTourStarted(trigger)
  }

  function buildSteps(defs: readonly TourStepDef[]): DriveStep[] {
    const counted = defs.length - 1
    return defs.map((def, i) => {
      const isWelcome = def.anchor === null
      const isLast = i === defs.length - 1
      const step: DriveStep = {
        // The cast admits what driver.js handles at runtime: an undefined
        // return means "not here yet" and engages its waitForElement retry
        // (then skipMissingElement, should the wait come up empty).
        element: isWelcome ? undefined : ((() => findStepElement(def)) as unknown as () => Element),
        popover: {
          title: def.title,
          description: def.body,
          side: def.side,
          align: def.align,
          ...(isWelcome
            ? {
                nextBtnText: 'Start the tour',
                prevBtnText: 'Skip',
                // driver.js disables `previous` on step 0 (nothing to go
                // back to), which would ship Skip as a dead button that the
                // tour CSS renders as a live one. The step's own popover is
                // spread after driver's computed defaults, so declaring the
                // list empty re-enables it.
                disableButtons: [],
                // Overriding onPrevClick replaces the default action — this
                // IS the skip path, and destroy() runs the shared teardown.
                onPrevClick: () => {
                  driverRef.current?.destroy()
                  finishRef.current()
                },
              }
            : {
                showProgress: true,
                progressText: `${i} of ${counted}`,
              }),
          ...(isLast
            ? {
                // Same override contract: Done must destroy explicitly.
                onDoneClick: () => {
                  completedRef.current = true
                  driverRef.current?.destroy()
                  finishRef.current()
                },
              }
            : {}),
        },
      }
      return step
    })
  }

  // Keep-latest refs, written after commit rather than during render
  // (react-hooks/refs). Declared ABOVE the effects that read startRef —
  // effects run in declaration order, so moving this below them would leave
  // the initial no-op in place on the first commit and kill auto-start.
  useEffect(() => {
    userIdRef.current = user?.id ?? null
    sidebarRef.current = sidebar
    startRef.current = start
    finishRef.current = finish
    detachDrawingRef.current = detachDrawing
    onViewportChangeRef.current = onViewportChange
  })

  // Manual start: same-page event (palette on the dashboard) — the one-shot
  // request flag is consumed here too so a queued cross-route start does not
  // fire twice.
  useEffect(() => {
    const onStart = () => {
      try {
        sessionStorage.removeItem(TOUR_REQUEST_KEY)
      } catch {
        // ignore
      }
      void startRef.current('manual')
    }
    window.addEventListener(TOUR_START_EVENT, onStart)
    return () => window.removeEventListener(TOUR_START_EVENT, onStart)
  }, [])

  // Mount decision: a FRESH manual request wins (and ignores the done-key);
  // otherwise auto-start only for a user who has never seen the tour. The
  // request is timestamped and always consumed — a stale one (its navigation
  // never landed, e.g. a load error ate the dashboard) must not force-start
  // the tour on an unrelated visit minutes later.
  useEffect(() => {
    if (!user?.id || autoTriedRef.current) return
    autoTriedRef.current = true
    let requestedAt = 0
    try {
      requestedAt = Number(sessionStorage.getItem(TOUR_REQUEST_KEY)) || 0
      sessionStorage.removeItem(TOUR_REQUEST_KEY)
    } catch {
      // ignore
    }
    if (requestedAt && Date.now() - requestedAt < TOUR_REQUEST_TTL_MS) {
      void startRef.current('manual')
      return
    }
    let done = true
    try {
      done = localStorage.getItem(`${TOUR_DONE_PREFIX}${user.id}`) !== null
    } catch {
      // storage unreadable — do not auto-open an overlay on guesswork
    }
    if (!done) void startRef.current('auto')
  }, [user?.id])

  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      if (driverRef.current) {
        // Navigating away mid-tour: tear the overlay down and run the shared
        // teardown ourselves — driver's onDestroyed is gated on transition
        // state and can be skipped in the first ~400ms.
        driverRef.current.destroy()
        finishRef.current()
      } else if (activeRef.current) {
        // A start is still in flight (sleeping or polling for anchors): no
        // tour ever showed, so no done-key — just give the rail back. Deferred
        // a tick: StrictMode's dev-only fake unmount runs this cleanup and
        // remounts SYNCHRONOUSLY (refs survive, the in-flight start continues),
        // and restoring here immediately would collapse the rail under the
        // tour it is about to show. A real unmount is still unmounted a tick
        // later, so the restore lands right away.
        setTimeout(() => {
          if (unmountedRef.current && activeRef.current && !driverRef.current) {
            activeRef.current = false
            if (sidebarWasCollapsedRef.current) sidebarRef.current.collapse()
          }
        }, 0)
      }
    }
  }, [])

  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Poll until every selector has a visible match, or the timeout lapses. */
function waitForSelectors(selectors: readonly string[], timeoutMs: number): Promise<boolean> {
  const started = Date.now()
  return new Promise((resolve) => {
    const check = () => {
      const allPresent = selectors.every((sel) =>
        Array.from(document.querySelectorAll<HTMLElement>(sel)).some((n) => n.offsetParent !== null)
      )
      if (allPresent) return resolve(true)
      if (Date.now() - started > timeoutMs) return resolve(false)
      setTimeout(check, 200)
    }
    check()
  })
}
