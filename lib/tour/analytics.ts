/**
 * Tour analytics — same triple-emit shape as lib/welcomeAnalytics.ts: the
 * site's own tracking script when present, a window CustomEvent for listeners,
 * and a capped sessionStorage queue for debugging. All failure-silent: losing
 * an analytics event must never break the tour.
 *
 * Note: window.pulse.track refuses automated browsers (navigator.webdriver
 * guard in the script), so these events can only be verified server-side or
 * by a human — never from Playwright.
 */

export type TourEventName =
  | 'tour_started'
  | 'tour_step_viewed'
  | 'tour_completed'
  | 'tour_skipped'

export interface TourEventPayload {
  event: TourEventName
  /** 'auto' = first-run auto-start; 'manual' = palette or other explicit entry. */
  trigger?: 'auto' | 'manual'
  /** 0 = welcome, 1..7 = counted steps. */
  step?: number
}

const STORAGE_KEY = 'pulse_tour_events'

function emit(event: TourEventName, payload: Omit<TourEventPayload, 'event'> = {}) {
  if (typeof window === 'undefined') return
  const full: TourEventPayload = { event, ...payload }
  try {
    const props: Record<string, string> = {}
    if (payload.trigger !== undefined) props.trigger = payload.trigger
    if (payload.step !== undefined) props.step = String(payload.step)
    const pulse = (window as unknown as { pulse?: { track?: (e: string, p?: Record<string, string>) => void } }).pulse
    if (pulse && typeof pulse.track === 'function') {
      pulse.track(event, Object.keys(props).length > 0 ? props : undefined)
    }
    window.dispatchEvent(new CustomEvent('pulse_tour', { detail: full }))
    const queue = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]')
    queue.push({ ...full, ts: Date.now() })
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(queue.slice(-50)))
  } catch {
    // ignore
  }
}

export function trackTourStarted(trigger: 'auto' | 'manual') {
  emit('tour_started', { trigger })
}

export function trackTourStepViewed(step: number) {
  emit('tour_step_viewed', { step })
}

export function trackTourCompleted() {
  emit('tour_completed')
}

export function trackTourSkipped(atStep: number) {
  emit('tour_skipped', { step: atStep })
}
