// * ═══ WEDGED-TAB RECOVERY — single source of truth ═══
// *
// * ⚠️ NAME: the module and the hook still say "chunk" because four files and
// * several runbooks import them under that name. They cover TWO failure shapes
// * now, and a chunk failure is only the first — see RENDER LOOPS below.
// *
// * A chunk-load failure is how a STALE TAB experiences a deploy: its HTML references
// * content-hashed chunks from a build that is no longer current. Since assetPrefix
// * (18-08-2026) chunks are retained across builds on the CDN, so this is rare — but a
// * tab predating that cutover, an evicted edge entry, or an origin blip during a
// * rollout all still surface here, and all of them present to the user as a DEAD
// * CLICK: the URL changes, the page does not.
// *
// * 🔑 MEASURED 18-08-2026 (Playwright against staging, route chunk blocked at the
// * network layer): a failed route import during an App Router navigation is caught BY
// * REACT and delivered to the nearest error boundary — NO global event fires, not
// * 'error' and not 'unhandledrejection'. The console shows ChunkLoadError, but only
// * because React logs it. So the error boundaries (app/error.tsx, app/global-error.tsx)
// * are the PRIMARY interception point; the global listeners in useVersionCheck cover
// * the shapes React never sees (dynamic import() in event handlers, script failures).
// *
// * Recovery is one hard reload: it fetches fresh HTML, which references the current
// * build. The sessionStorage guard makes it one reload per window — without it, a
// * genuinely broken build (every chunk failing) would reload-loop forever. On a
// * guarded or impossible recovery the caller falls back to visible UI (the toast or
// * the error page), so the user always keeps control.

const RECOVERY_GUARD_KEY = 'pulse-chunk-recovery-at'
const RECOVERY_GUARD_WINDOW_MS = 60_000

export function isChunkLoadFailure(text: string): boolean {
  return (
    text.includes('ChunkLoadError') ||
    text.includes('Loading chunk') ||
    text.includes('Loading CSS chunk') ||
    text.includes('Failed to fetch dynamically imported module') ||
    text.includes('error loading dynamically imported module') ||
    text.includes('Importing a module script failed')
  )
}

export function isChunkLoadError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null | undefined
  return isChunkLoadFailure(`${e?.name ?? ''} ${e?.message ?? String(error ?? '')}`)
}

// * ═══ RENDER LOOPS (added 09-09-2026) ═══
// *
// * 🔴 THE SELF-HEAL USED TO COVER EXACTLY SIX STRINGS. `isChunkLoadFailure` is an
// * allowlist, and `useChunkRecovery` seeds its phase to 'show' the instant the
// * error is not one of them — so every OTHER wedged-tab failure was painted on the
// * first frame with no recovery attempted at all.
// *
// * That is what the owner hit: most mornings for three days the PWA showed
// * "Dashboard failed to load" on /sites/<id>, and the logged error was
// * `Minified React error #185` — React's "Maximum update depth exceeded", an
// * infinite render loop, thrown from getRootForUpdatedFiber once nested updates
// * pass 50. Audit: Pulse/docs/audits/09-09-2026-pwa-dashboard-failed-to-load.md.
// *
// * 🔑 A RELOAD IS THE RIGHT CURE HERE, AND `reset()` IS NOT — measured, not assumed.
// * The boundary's own "Try again" calls reset(), which re-renders the segment with
// * the module-level SWR cache and the URL intact; production logged two crashes two
// * seconds apart on one site (08-09 05:29:46 and :48), which is reset() re-entering
// * the same loop. A reload drops that cached state, which is why the owner's manual
// * Refresh works every time.
// *
// * ⚠️ SO THE GUARD IS STRICTER THAN THE CHUNK ONE: once per tab, not once per 60s.
// * A chunk failure is cured by fetching the new build, so retrying it later is
// * sound. A render loop is a code defect: if it comes straight back after the
// * reload, reloading again on a timer would be a silent refresh loop with the user
// * watching. The second occurrence in a tab shows the error page instead.
const RENDER_LOOP_GUARD_KEY = 'pulse-render-loop-recovery-done'

export function isRenderLoopFailure(text: string): boolean {
  return (
    // Development build, and the production build's own hosted message.
    text.includes('Maximum update depth exceeded') ||
    // Production: React ships the code, not the sentence.
    text.includes('Minified React error #185') ||
    text.includes('react.dev/errors/185')
  )
}

export function isRenderLoopError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null | undefined
  return isRenderLoopFailure(`${e?.name ?? ''} ${e?.message ?? String(error ?? '')}`)
}

/** Every failure shape a reload is known to cure. */
export function isRecoverableCrash(error: unknown): boolean {
  return isChunkLoadError(error) || isRenderLoopError(error)
}

export type RecoveryAttempt = 'reloading' | 'blocked' | 'offline'

/**
 * Why 'offline' is its own outcome rather than another 'blocked'.
 *
 * `navigator.onLine` reads false for a beat after a laptop wakes, while Wi-Fi
 * reassociates — which is EXACTLY the moment this app is asked to recover, since
 * the failure the owner reports happens on waking a machine that sat all night.
 * Reloading into a dead network would replace a recoverable page with the
 * browser's offline error, so we still refuse to reload; but the caller can wait
 * for the `online` event and try again, instead of giving up permanently on a
 * condition that clears in a second.
 */
function attemptReload(guard: () => boolean): RecoveryAttempt {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'offline'
  }
  if (!guard()) return 'blocked'
  window.location.reload()
  return 'reloading'
}

/** Guard for a render loop: one automatic reload per tab, ever. */
function armRenderLoopGuard(): boolean {
  try {
    if (sessionStorage.getItem(RENDER_LOOP_GUARD_KEY)) return false
    sessionStorage.setItem(RENDER_LOOP_GUARD_KEY, String(Date.now()))
  } catch {
    return false
  }
  return true
}

/** Guard for a chunk failure: one reload per 60s window per tab. */
function armChunkGuard(): boolean {
  let last = 0
  try {
    last = Number(sessionStorage.getItem(RECOVERY_GUARD_KEY) ?? 0)
  } catch {
    return false
  }
  // A NEGATIVE delta means the clock moved backwards (NTP correction, laptop resume)
  // -- treat it as expired rather than blocking recovery until the clock catches up.
  const sinceLast = Date.now() - last
  if (sinceLast >= 0 && sinceLast < RECOVERY_GUARD_WINDOW_MS) {
    return false
  }
  try {
    sessionStorage.setItem(RECOVERY_GUARD_KEY, String(Date.now()))
  } catch {}
  return true
}

/**
 * The one entry point the boundaries use: picks the guard that fits the failure
 * and reports what happened, so the caller can distinguish "wait for the network"
 * from "give up and show the error page".
 */
export function recoverFromCrash(error: unknown): RecoveryAttempt {
  if (isRenderLoopError(error)) return attemptReload(armRenderLoopGuard)
  if (isChunkLoadError(error)) return attemptReload(armChunkGuard)
  return 'blocked'
}

/**
 * Attempt one guarded recovery reload. Returns true if the reload was initiated —
 * the caller should render nothing and let the reload happen. Returns false when the
 * guard blocks (a failure right after a recovery reload means the current build is
 * genuinely broken) or storage is unavailable — the caller must then show its normal
 * visible fallback instead of reloading blind.
 */
export function recoverFromChunkFailure(): boolean {
  return attemptReload(armChunkGuard) === 'reloading'
}
