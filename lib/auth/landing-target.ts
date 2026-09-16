'use client'

import type { Site } from '@/lib/api/sites'
import { listSites } from '@/lib/api/sites'
import { completeOnboarding, getOrganization } from '@/lib/api/organization'
import { ApiError } from '@/lib/api/client'
import { isSubjectToOnboardingWall } from '@/lib/auth/permissions'
import { AUTHED_HOME } from '@/lib/routes'
import { logger } from '@/lib/utils/logger'

/**
 * Where a signed-in account actually belongs — resolved ONCE, at the moment of
 * arrival, instead of being discovered by a page that has already rendered.
 *
 * 🔴 WHY THIS EXISTS. Until 08-09-2026 the auth callback had no destination for
 * a fresh signup, so it landed on `/`, the edge redirected that to
 * {@link AUTHED_HOME}, `/sites` RENDERED its empty-fleet placeholder, and only
 * then did the onboarding wall — a client effect, one render later — push the
 * person into the wizard. A brand-new account was shown "you have no sites" by
 * a page that was already on its way somewhere else. Four hops, each correct on
 * its own.
 *
 * The wall stays exactly where it is: it is the catch-all for every entry point
 * that never passes through the callback, and for a resolution that fails. What
 * changes is that the callback no longer *starts* by guessing.
 *
 * ⚠️ This deliberately does NOT live in `middleware.ts`. The edge has no org
 * context — no membership, no onboarding flag, no site list — and teaching it to
 * fetch one would make the map a second source of truth about where a person
 * belongs, on the hottest path in the app.
 */

/** localStorage key holding "this org has finished onboarding", per org. */
export function onboardingDoneCacheKey(orgId: string): string {
  return `pulse_onboarding_done_${orgId}`
}

/**
 * The step an unfinished workspace must resume at, or `null` when there is
 * nothing left to resume.
 *
 * 🔴 THE MEANING CHANGED ON 11-09-2026, AND SO DID THE FLAG'S. It used to map a
 * site whose `install_status` was `never_installed` to `/setup/install`, and a
 * site that had reported an event to `/setup/plan`. Both were wrong in the same
 * way: they gate the product on work that happens somewhere else.
 *
 * Installing means LEAVING — your CMS, your repo, your deploy pipeline, often a
 * different machine and frequently a different person. A wall that resumes at
 * `/setup/install` therefore resumes at a step that structurally cannot complete
 * in the session, and "Skip for now" wrote nothing, so every attempt to leave
 * recomputed the same answer. Measured on Pulse's first external signup
 * (pomofocus.io, 10-09-2026): two seconds on `/sites`, pushed back to
 * `/setup/install`, skipped again, gone. Reproduced live 11-09.
 *
 * 🔑 The wizard's job ends when the workspace can RECEIVE data. A site is that
 * moment. Install and plan are tasks IN the product, carried on the dashboard —
 * not gates in front of it. Design:
 * `Pulse/docs/plans/11-09-2026-onboarding-wall-fix-design.md`.
 *
 * ⚠️ The site-less case is UNCHANGED and is the one the wall was built for: an
 * org with no site genuinely has nothing to show and is sent to `/setup/site`.
 *
 * 🔴 ONE DEFINITION, TWO CALLERS: the onboarding wall in `lib/auth/context.tsx`
 * and the auth callback. A fixed `/setup/site` target invited a duplicate site
 * from every org that already had one, which is why this reads server state
 * rather than assuming a beginning — and why the two callers must not each
 * carry their own copy of the mapping.
 */
export function resumeTargetForSites(sites: Site[]): string | null {
  return sites.length === 0 ? '/setup/site' : null
}

/**
 * Write `onboarding_completed_at`, and cache the answer where the wall reads it.
 *
 * 🔴 IT IS THE SAME ONE-WAY DOOR IT ALWAYS WAS — only its trigger moved. The
 * write itself is idempotent and one-way in SQL: ciphera-id's CompleteOnboarding
 * is `UPDATE ... WHERE id = $1 AND onboarding_completed_at IS NULL`, so a second
 * caller cannot move a timestamp that is already set. That is what makes it safe
 * for more than one place to fire it.
 *
 * ⚠️ NEVER BLOCK ON IT, AND NEVER CACHE A FAILURE. The callers use it to heal
 * state forward while letting the person through; a transient 5xx must leave the
 * cache empty so the next evaluation retries, and a permanent 403 (ciphera-id
 * refuses a non-owner) must not be retried in a loop or mistaken for success.
 * A non-owner is not walled in the first place, so the 403 costs them nothing.
 */
export async function markOnboardingComplete(orgId: string): Promise<void> {
  try {
    await completeOnboarding(orgId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      // Not ours to write (ciphera-id: owner only). Nothing to retry, and
      // nothing to report — a member is exempt from the wall anyway.
      return
    }
    // Transient. Leave the cache clear so the next evaluation asks again.
    logger.error('Could not record onboarding completion', e)
    return
  }
  try {
    localStorage.setItem(onboardingDoneCacheKey(orgId), '1')
  } catch {
    // Cache write failed — the server answer is still correct, just not cached.
  }
}

/** What the caller already knows about the account it just signed in. */
export interface LandingContext {
  /** The organisation the session is now scoped to. */
  orgId: string | null | undefined
  /** The member's role in that organisation, as the session reports it. */
  role: string | null | undefined
  /**
   * True when this workspace was created by the call that just ran, i.e. the
   * account had none. A workspace that did not exist a moment ago has no sites
   * and no completion flag, so its destination is knowable without asking.
   */
  createdWorkspace?: boolean
}

/**
 * Resolve where to land, or `null` when it cannot be known.
 *
 * 🔴 `null` IS NOT AN ERROR STATE — it means "no better answer than the default",
 * and the caller keeps its existing behaviour. Sign-in must never fail because
 * the destination could not be computed; the wall picks the person up on the
 * next route either way. Every failure is logged rather than swallowed.
 */
export async function resolveLandingTarget({
  orgId,
  role,
  createdWorkspace,
}: LandingContext): Promise<string | null> {
  if (!orgId) return null

  // A workspace minted seconds ago by ensure-default. It cannot have sites and
  // cannot carry `onboarding_completed_at`, and the person who caused it to
  // exist is its owner — so the first step of the wizard is certain, and costs
  // no extra round trip on the one path where latency is most visible.
  if (createdWorkspace) return '/setup/site'

  // 🔴 A NON-OWNER IS NEVER WALLED (ruled 05-09-2026), so it must never be sent
  // into the wizard: ciphera-id lets only the owner write the completion flag,
  // and the wizard's last step is a BILLING step they are refused. The rule is
  // read from the same predicate the wall uses — an unknown role is treated as
  // walled, exactly as there, because we relax only on positive evidence.
  if (!isSubjectToOnboardingWall(role)) return AUTHED_HOME

  try {
    // The wall's own cache. A returning person on a known device pays nothing.
    if (typeof window !== 'undefined' && localStorage.getItem(onboardingDoneCacheKey(orgId))) {
      return AUTHED_HOME
    }
  } catch {
    // Storage unreadable — fall through and ask the server, which is the
    // authority anyway. Never skip the resolution because a cache is missing.
  }

  try {
    const org = await getOrganization(orgId)
    if (org.onboarding_completed_at) {
      try {
        localStorage.setItem(onboardingDoneCacheKey(orgId), '1')
      } catch {
        // Cache write failed — the answer is still correct, just not cached.
      }
      return AUTHED_HOME
    }
    const sites = await listSites()
    const target = resumeTargetForSites(sites)
    if (target) return target
    // 🔑 A SITE EXISTS, SO ONBOARDING IS SATISFIED — the flag just predates the
    // rule. Heal it forward (idempotent, one-way, never blocking) and land on
    // the product. This is what carries every org created BEFORE 11-09-2026
    // over: their flag is NULL and always would have been, because the only
    // writer was a funnel that ends in a pricing decision.
    void markOnboardingComplete(orgId)
    return AUTHED_HOME
  } catch (e) {
    // The wizard target is a guess we are not entitled to make from here: an
    // org whose state we could not read might be finished. Hand back null and
    // let the wall — which will re-ask on the destination route — decide.
    logger.error('Could not resolve where to land after sign-in', e)
    return null
  }
}
