// * ═══ CHUNK-FAILURE RECOVERY — single source of truth ═══
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

/**
 * Attempt one guarded recovery reload. Returns true if the reload was initiated —
 * the caller should render nothing and let the reload happen. Returns false when the
 * guard blocks (a failure right after a recovery reload means the current build is
 * genuinely broken) or storage is unavailable — the caller must then show its normal
 * visible fallback instead of reloading blind.
 */
export function recoverFromChunkFailure(): boolean {
  // Offline is a chunk-failure trigger where a reload makes things WORSE: the tab may
  // be running fine off the service worker, and reloading it lands on a network error
  // page. onLine === false is trustworthy ("true" is not); fall back to visible UI.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false
  }
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
  window.location.reload()
  return true
}
