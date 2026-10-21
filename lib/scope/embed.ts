/**
 * pulse.ciphera.net's hero frames /demo (same origin, the marketing app's home page) over
 * a capture of it, and swaps the capture for the frame only once the frame says its page
 * has drawn real numbers. Until then, and whenever the frame fails, the capture stays:
 * the hero never shows a blank or an error (PUL-34, programme plan §5b).
 *
 * The message goes to this page's own origin only, so no other site that frames the
 * demo can listen for it (and /demo answers `frame-ancestors 'self'`, so none can).
 */
export const EMBED_READY_MESSAGE = 'pulse:demo-ready'

/**
 * Whether this document runs inside a frame: the hero's /demo. A framed page is not a visit
 * of its own (the home page that frames it already counted one), so Pulse's own tracker and
 * the service worker stay out of it (components/PulseOwnTracker.tsx,
 * components/ServiceWorkerRegister.tsx). False on the server: callers decide after mount.
 */
export function isFramed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.top !== window.self
  } catch {
    // Reading a cross-origin top can throw in some engines: only a framed document gets here.
    return true
  }
}

export function postEmbedReady(): void {
  if (typeof window === 'undefined' || window.parent === window) return
  try {
    window.parent.postMessage({ type: EMBED_READY_MESSAGE }, window.location.origin)
  } catch {
    // A parent the browser will not let us address: nothing listens, the capture stays.
  }
}
