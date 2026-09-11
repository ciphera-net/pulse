import { describe, it, expect, vi, beforeEach } from 'vitest'

// * ═══ WHERE A SIGN-IN LANDS IS RESOLVED, NOT GUESSED ═══
// *
// * Reported 08-09-2026 by the owner's own signup: "it first shows pulse /sites
// * page with the empty placeholder with no sites & then it goes to /setup/site".
// * Four hops, each correct alone — no return target → `/` → the edge sends an
// * authed `/` to `/sites` → `/sites` RENDERS → the wall (a client effect, one
// * render later) pushes the wizard. These pin the resolution that removes the
// * first three.

const getOrganization = vi.fn()
const completeOnboarding = vi.fn()
vi.mock('@/lib/api/organization', () => ({
  getOrganization: (...a: unknown[]) => getOrganization(...a),
  completeOnboarding: (...a: unknown[]) => completeOnboarding(...a),
}))

const listSites = vi.fn()
vi.mock('@/lib/api/sites', () => ({
  listSites: (...a: unknown[]) => listSites(...a),
}))

const loggerError = vi.fn()
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: (...a: unknown[]) => loggerError(...a), warn: vi.fn(), info: vi.fn() },
}))

import { ApiError } from '@/lib/api/client'
import {
  markOnboardingComplete,
  onboardingDoneCacheKey,
  resolveLandingTarget,
  resumeTargetForSites,
} from '../landing-target'
import type { Site } from '@/lib/api/sites'

const site = (install_status: string | undefined) => ({ install_status } as unknown as Site)

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  completeOnboarding.mockResolvedValue(undefined)
})

describe('resumeTargetForSites — one definition, two callers', () => {
  // 🔴 THE CONTRACT CHANGED 11-09-2026. It used to answer '/setup/install' for a
  // site that had never reported an event, and '/setup/plan' for one that had.
  // Both gated the product on work that happens on a different machine, and
  // "Skip for now" wrote nothing — so every attempt to leave recomputed the same
  // answer and pushed the person back. Now: a site is the finish line.
  it('sends a workspace with no sites to the step that creates one', () => {
    expect(resumeTargetForSites([])).toBe('/setup/site')
  })

  it('has NOTHING to resume once a site exists, however silent that site is', () => {
    expect(resumeTargetForSites([site('never_installed')])).toBeNull()
  })

  it('treats a missing install_status the same — install is never a gate', () => {
    expect(resumeTargetForSites([site(undefined)])).toBeNull()
  })

  it('has nothing to resume for a live install either', () => {
    expect(resumeTargetForSites([site('never_installed'), site('active')])).toBeNull()
  })
})

describe('markOnboardingComplete — one-way, idempotent, never blocking', () => {
  it('writes the flag and caches it where the wall reads it', async () => {
    await markOnboardingComplete('o1')
    expect(completeOnboarding).toHaveBeenCalledWith('o1')
    expect(localStorage.getItem(onboardingDoneCacheKey('o1'))).toBe('1')
  })

  it('does NOT cache a transient failure, so the next evaluation retries', async () => {
    completeOnboarding.mockRejectedValueOnce(new ApiError('upstream blew up', 500))
    await markOnboardingComplete('o1')
    expect(localStorage.getItem(onboardingDoneCacheKey('o1'))).toBeNull()
    expect(loggerError).toHaveBeenCalled()
  })

  it('swallows a 403 silently — a non-owner is not walled and cannot write it', async () => {
    completeOnboarding.mockRejectedValueOnce(new ApiError('Only the owner can complete onboarding', 403))
    await markOnboardingComplete('o1')
    expect(localStorage.getItem(onboardingDoneCacheKey('o1'))).toBeNull()
    expect(loggerError).not.toHaveBeenCalled()
  })
})

describe('resolveLandingTarget', () => {
  it('a workspace created seconds ago goes to the first step, asking nobody', async () => {
    // * The whole point of the created flag: a workspace that did not exist a
    // * moment ago cannot have sites or a completion flag, so the answer is
    // * knowable without a round trip on the one path where latency shows.
    const target = await resolveLandingTarget({ orgId: 'o1', role: 'owner', createdWorkspace: true })
    expect(target).toBe('/setup/site')
    expect(getOrganization).not.toHaveBeenCalled()
    expect(listSites).not.toHaveBeenCalled()
  })

  it('a NON-OWNER is never sent into the wizard, even mid-onboarding', async () => {
    // 🔴 ciphera-id lets only the owner write onboarding_completed_at, and the
    // wizard's last step is a BILLING step a member is refused. The wall does
    // not bind them; neither may this.
    const target = await resolveLandingTarget({ orgId: 'o1', role: 'member' })
    expect(target).toBe('/sites')
    expect(getOrganization).not.toHaveBeenCalled()
  })

  it('an UNKNOWN role is still treated as walled — we relax only on evidence', async () => {
    getOrganization.mockResolvedValue({ onboarding_completed_at: null })
    listSites.mockResolvedValue([])
    const target = await resolveLandingTarget({ orgId: 'o1', role: undefined })
    expect(target).toBe('/setup/site')
  })

  it('a finished workspace goes straight to the app, skipping the edge redirect', async () => {
    getOrganization.mockResolvedValue({ onboarding_completed_at: '2026-09-01T00:00:00Z' })
    const target = await resolveLandingTarget({ orgId: 'o1', role: 'owner' })
    expect(target).toBe('/sites')
    expect(listSites).not.toHaveBeenCalled()
    // * and it caches the answer where the wall reads it, so the wall's own
    // * fetch on the destination route does not repeat the question.
    expect(localStorage.getItem(onboardingDoneCacheKey('o1'))).toBe('1')
  })

  it('reads the cache the wall writes, so a returning device pays nothing', async () => {
    localStorage.setItem(onboardingDoneCacheKey('o1'), '1')
    const target = await resolveLandingTarget({ orgId: 'o1', role: 'owner' })
    expect(target).toBe('/sites')
    expect(getOrganization).not.toHaveBeenCalled()
  })

  it('resumes a SITE-LESS workspace at the step that creates one', async () => {
    getOrganization.mockResolvedValue({ onboarding_completed_at: null })
    listSites.mockResolvedValue([])
    expect(await resolveLandingTarget({ orgId: 'o1', role: 'owner' })).toBe('/setup/site')
    expect(completeOnboarding).not.toHaveBeenCalled()
  })

  it('lands a site-owning workspace on the PRODUCT, and heals the stale flag', async () => {
    // 🔴 THE REGRESSION THIS PINS. An org created before 11-09-2026 has a NULL
    // flag and always would have: the only writer was /setup/done, after a
    // pricing decision. Its site is silent because installing happens
    // elsewhere. That org must reach the app, not the wizard.
    getOrganization.mockResolvedValue({ onboarding_completed_at: null })
    listSites.mockResolvedValue([site('never_installed')])
    expect(await resolveLandingTarget({ orgId: 'o1', role: 'owner' })).toBe('/sites')
    expect(completeOnboarding).toHaveBeenCalledWith('o1')
  })

  it('answers null — never a guess — when the org cannot be read, and says so', async () => {
    // * An org we could not read might be finished. Sending it to the wizard
    // * would be a worse wrong answer than the default, and the wall re-asks
    // * on the destination route anyway.
    getOrganization.mockRejectedValue(new Error('502'))
    expect(await resolveLandingTarget({ orgId: 'o1', role: 'owner' })).toBeNull()
    expect(loggerError).toHaveBeenCalled()
  })

  it('answers null with no org, rather than inventing a destination', async () => {
    expect(await resolveLandingTarget({ orgId: null, role: 'owner' })).toBeNull()
    expect(getOrganization).not.toHaveBeenCalled()
  })
})
