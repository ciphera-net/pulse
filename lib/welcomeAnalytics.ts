/**
 * Welcome/onboarding analytics. Emits custom events for step views and actions
 * so drop-off and funnel can be measured. Listen for 'pulse_welcome' or use
 * the payload with your analytics backend.
 */

export type WelcomeEventName =
  | 'welcome_step_view'
  | 'welcome_workspace_created'
  | 'welcome_plan_continue'
  | 'welcome_plan_skip'
  | 'welcome_site_added'
  | 'welcome_site_skipped'
  | 'welcome_completed'

export interface WelcomeEventPayload {
  event: WelcomeEventName
  step?: number
  /** For workspace_created: has pending checkout */
  had_pending_checkout?: boolean
  /** For site_added: whether user added a site in wizard */
  added_site?: boolean
}

const STORAGE_KEY = 'pulse_welcome_events'

function emit(event: WelcomeEventName, payload: Omit<WelcomeEventPayload, 'event'> = {}) {
  const full: WelcomeEventPayload = { event, ...payload }
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent('pulse_welcome', { detail: full })
    )
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug('[Pulse Welcome]', full)
    }
    const queue = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]')
    queue.push({ ...full, ts: Date.now() })
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(queue.slice(-50)))
  } catch {
    // ignore
  }
}

export function trackWelcomeStepView(step: number) {
  emit('welcome_step_view', { step })
}

export function trackWelcomeWorkspaceCreated(hadPendingCheckout: boolean) {
  emit('welcome_workspace_created', { had_pending_checkout: hadPendingCheckout })
}

export function trackWelcomePlanContinue() {
  emit('welcome_plan_continue')
}

export function trackWelcomePlanSkip() {
  emit('welcome_plan_skip')
}

export function trackWelcomeSiteAdded() {
  emit('welcome_site_added', { added_site: true })
}

export function trackWelcomeSiteSkipped() {
  emit('welcome_site_skipped')
}

export function trackWelcomeCompleted(addedSite: boolean) {
  emit('welcome_completed', { added_site: addedSite })
}
