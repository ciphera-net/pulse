/**
 * Onboarding-funnel analytics: the /setup wizard steps, the two site-creation
 * events from the dashboard path, and the Getting Started chip. Same
 * triple-emit shape as lib/tour/analytics.ts: the site's own tracking script
 * when present, a window CustomEvent for listeners, and a capped
 * sessionStorage queue for debugging. All failure-silent — losing an
 * analytics event must never break onboarding.
 *
 * Note: window.pulse.track refuses automated browsers (navigator.webdriver
 * guard in the script), so these events can only be verified server-side or
 * by a human — never from Playwright.
 */

import { track } from '@/lib/pulse'

// Internal-only since 25-08-2026: both types had zero external consumers.
type WelcomeEventName =
  | 'welcome_step_view'
  | 'welcome_workspace_created'
  | 'welcome_site_added'
  | 'welcome_site_skipped'
  | 'welcome_install_skipped'
  | 'welcome_completed'
  | 'site_created_from_dashboard'
  | 'site_created_script_copied'
  | 'onboarding_chip_opened'
  | 'onboarding_item_clicked'
  | 'onboarding_dismissed'

interface WelcomeEventPayload {
  event: WelcomeEventName
  step?: number
  /** The /setup segment the step number stands for — survives reordering. */
  step_name?: string
  /** For workspace_created: arrived from pricing with a plan pre-selected. */
  had_pending_checkout?: boolean
  /** For site_added / completed: whether user added a site in wizard */
  added_site?: boolean
  /** For onboarding_item_clicked: the checklist item's key. */
  item?: string
  /** For onboarding_dismissed / chip_opened: completed steps at that moment. */
  completed_count?: number
}

const STORAGE_KEY = 'pulse_welcome_events'

function emit(event: WelcomeEventName, payload: Omit<WelcomeEventPayload, 'event'> = {}) {
  const full: WelcomeEventPayload = { event, ...payload }
  if (typeof window === 'undefined') return
  try {
    const props: Record<string, string> = {}
    if (payload.step !== undefined) props.step = String(payload.step)
    if (payload.step_name !== undefined) props.step_name = payload.step_name
    if (payload.had_pending_checkout !== undefined) props.had_pending_checkout = String(payload.had_pending_checkout)
    if (payload.added_site !== undefined) props.added_site = String(payload.added_site)
    if (payload.item !== undefined) props.item = payload.item
    if (payload.completed_count !== undefined) props.completed_count = String(payload.completed_count)
    track(event, Object.keys(props).length > 0 ? props : undefined)

    window.dispatchEvent(
      new CustomEvent('pulse_welcome', { detail: full })
    )
    if (process.env.NODE_ENV === 'development') {
      console.debug('[Pulse Welcome]', full)
    }
    const queue = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]')
    queue.push({ ...full, ts: Date.now() })
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(queue.slice(-50)))
  } catch {
    // ignore
  }
}

export function trackWelcomeStepView(step: number, stepName: string) {
  emit('welcome_step_view', { step, step_name: stepName })
}

export function trackWelcomeWorkspaceCreated(hadPendingCheckout: boolean) {
  emit('welcome_workspace_created', { had_pending_checkout: hadPendingCheckout })
}

export function trackWelcomeSiteAdded() {
  emit('welcome_site_added', { added_site: true })
}

export function trackWelcomeSiteSkipped() {
  emit('welcome_site_skipped')
}

// The install step's "Skip for now" used to route through the same
// handleContinue as the Continue button, so "skipped the script install" was
// indistinguishable from "installed and continued" — the exact cohort the
// activation funnel needs to see (a skipped install is the dead-account path).
export function trackWelcomeInstallSkipped() {
  emit('welcome_install_skipped')
}

export function trackWelcomeCompleted(addedSite: boolean) {
  emit('welcome_completed', { added_site: addedSite })
}

export function trackSiteCreatedFromDashboard() {
  emit('site_created_from_dashboard')
}

export function trackSiteCreatedScriptCopied() {
  emit('site_created_script_copied')
}

export function trackOnboardingChipOpened(completedCount: number) {
  emit('onboarding_chip_opened', { completed_count: completedCount })
}

export function trackOnboardingItemClicked(item: string) {
  emit('onboarding_item_clicked', { item })
}

export function trackOnboardingDismissed(completedCount: number) {
  emit('onboarding_dismissed', { completed_count: completedCount })
}
