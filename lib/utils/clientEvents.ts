/**
 * Client-side auth/session event reporting.
 *
 * Rides the SAME plumbing as the error boundaries (`/api/client-errors` →
 * `console.warn("[client-error]", …)` in the Next.js server process → pod
 * stdout → Loki via Alloy), so an event is countable with a Loki query like:
 *
 *   {namespace="apps", pod=~"pulse-frontend.*"} |= `session_lost_on_live_tab`
 *
 * These exist because the 25-08 half-state incident could not be measured:
 * no event, metric, or log recorded "the auth context flipped to logged-out on
 * a live tab" or "marketing chrome rendered over an app route" — the incident
 * had to be reconstructed from a customer's screenshot. Never again.
 * Audit: Infra/Auth/docs/audits/25-08-2026-lost-rotation-reuse-revocation-and-half-state-chrome.md §3, §5.5
 *
 * `sendBeacon` first (survives page teardown, never blocks), fetch fallback.
 * Fire-and-forget by design — telemetry must never affect the session it is
 * observing.
 */
export type ClientEventName =
  | 'session_lost_on_live_tab'
  | 'session_recovered_on_live_tab'
  | 'marketing_fallthrough_on_app_route'
  | 'session_takeover_rendered'
  /** A sign-out id-backend did not confirm (S3: Pulse's own revocation). Detail = status or 'unreachable'. */
  | 'logout_unconfirmed'

export function reportClientEvent(name: ClientEventName, detail?: string): void {
  if (typeof window === 'undefined') return
  try {
    const payload = JSON.stringify({
      message: detail ? `${name}:${detail}` : name,
      url: window.location.pathname,
      timestamp: new Date().toISOString(),
    })
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/client-errors', new Blob([payload], { type: 'application/json' }))
    } else {
      void fetch('/api/client-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    // * Telemetry must never throw into the auth path it observes.
  }
}
