// Onboarding-funnel analytics: the triple emit (window.pulse.track, the
// pulse_welcome CustomEvent, the sessionStorage debug queue) and the exact
// event names + stringified props. The names are the funnel's schema — a
// rename here silently splits the funnel series server-side, so they are
// pinned. window.pulse is a mock: the real script refuses automated browsers
// (navigator.webdriver), which is exactly why this is a unit test and not a
// Playwright assertion.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  trackWelcomeStepView,
  trackWelcomeWorkspaceCreated,
  trackWelcomeSiteAdded,
  trackWelcomeSiteSkipped,
  trackWelcomeCompleted,
  trackOnboardingChipOpened,
  trackOnboardingItemClicked,
  trackOnboardingDismissed,
} from '@/lib/welcomeAnalytics'

const track = vi.fn()

beforeEach(() => {
  sessionStorage.clear()
  track.mockClear()
  ;(window as unknown as { pulse: unknown }).pulse = { track, cleanPath: () => '/' }
})

afterEach(() => {
  delete (window as unknown as { pulse?: unknown }).pulse
})

describe('welcome analytics', () => {
  it('step view carries number and segment name', () => {
    trackWelcomeStepView(2, 'site')
    expect(track).toHaveBeenCalledWith('welcome_step_view', { step: '2', step_name: 'site' }, undefined)
  })

  it('workspace created carries the pending-checkout flag as a string', () => {
    trackWelcomeWorkspaceCreated(true)
    expect(track).toHaveBeenCalledWith('welcome_workspace_created', { had_pending_checkout: 'true' }, undefined)
  })

  it('site added / skipped / completed use the pinned names', () => {
    trackWelcomeSiteAdded()
    trackWelcomeSiteSkipped()
    trackWelcomeCompleted(false)
    expect(track).toHaveBeenNthCalledWith(1, 'welcome_site_added', { added_site: 'true' }, undefined)
    expect(track).toHaveBeenNthCalledWith(2, 'welcome_site_skipped', undefined, undefined)
    expect(track).toHaveBeenNthCalledWith(3, 'welcome_completed', { added_site: 'false' }, undefined)
  })

  it('chip events carry item key and completed count', () => {
    trackOnboardingChipOpened(2)
    trackOnboardingItemClicked('goal')
    trackOnboardingDismissed(3)
    expect(track).toHaveBeenNthCalledWith(1, 'onboarding_chip_opened', { completed_count: '2' }, undefined)
    expect(track).toHaveBeenNthCalledWith(2, 'onboarding_item_clicked', { item: 'goal' }, undefined)
    expect(track).toHaveBeenNthCalledWith(3, 'onboarding_dismissed', { completed_count: '3' }, undefined)
  })

  it('dispatches the pulse_welcome CustomEvent and appends the debug queue', () => {
    const seen: unknown[] = []
    const listener = (e: Event) => seen.push((e as CustomEvent).detail)
    window.addEventListener('pulse_welcome', listener)
    trackWelcomeSiteAdded()
    window.removeEventListener('pulse_welcome', listener)
    expect(seen).toEqual([{ event: 'welcome_site_added', added_site: true }])
    const queue = JSON.parse(sessionStorage.getItem('pulse_welcome_events') || '[]')
    expect(queue).toHaveLength(1)
    expect(queue[0].event).toBe('welcome_site_added')
  })

  it('survives a missing window.pulse — analytics must never break onboarding', () => {
    delete (window as unknown as { pulse?: unknown }).pulse
    expect(() => trackWelcomeCompleted(true)).not.toThrow()
    const queue = JSON.parse(sessionStorage.getItem('pulse_welcome_events') || '[]')
    expect(queue).toHaveLength(1)
  })
})
