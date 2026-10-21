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

export function postEmbedReady(): void {
  if (typeof window === 'undefined' || window.parent === window) return
  try {
    window.parent.postMessage({ type: EMBED_READY_MESSAGE }, window.location.origin)
  } catch {
    // A parent the browser will not let us address: nothing listens, the capture stays.
  }
}
