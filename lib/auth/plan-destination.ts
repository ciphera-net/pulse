import { TRAFFIC_TIERS, PLAN_CATALOG } from '@/lib/plans'
import { getUserOrganizations } from '@/lib/api/organization'

export type PlanInterval = 'month' | 'year'

export interface PlanQuery {
  plan: string
  interval: PlanInterval
  limit: number
}

const VALID_PLAN_IDS = new Set(PLAN_CATALOG.map((p) => p.id))
const VALID_LIMITS = new Set<number>(TRAFFIC_TIERS.map((t) => t.value))

/**
 * Parses and validates `?plan=&interval=&limit=` — the only shape this
 * address (and the marketing `/pricing` buttons that will link to it, D43)
 * understands. Anything outside the known catalog is not "this page with odd
 * defaults", it is the wrong page: the caller sends it to `/pricing` instead
 * of guessing a default.
 *
 * Free and custom-traffic ("10M+", contact us) are deliberately NOT accepted
 * here — PricingSection never routes either of those through this address
 * (see its own CTA branches), so a query naming them is not a request this
 * page recognises.
 */
export function parsePlanQuery(params: URLSearchParams): PlanQuery | null {
  const plan = params.get('plan')
  const interval = params.get('interval')
  const limitRaw = params.get('limit')

  if (!plan || !VALID_PLAN_IDS.has(plan)) return null
  if (interval !== 'month' && interval !== 'year') return null

  const limit = Number(limitRaw)
  if (!limitRaw || !Number.isFinite(limit) || !VALID_LIMITS.has(limit)) return null

  return { plan, interval, limit }
}

/** The query-string shape every destination below is built from. */
export function planQueryString({ plan, interval, limit }: PlanQuery): string {
  return `plan=${plan}&interval=${interval}&limit=${limit}`
}

export type PlanDestination =
  // Anonymous: the caller remembers `returnTarget` (rememberReturnTarget) and
  // starts a signup (initiateSignupFlow) — kept as two steps rather than one
  // so neither this module nor its callers need to import `window`.
  | { kind: 'signup'; returnTarget: string }
  | { kind: 'navigate'; path: string }

/**
 * ONE decision, shared by the in-app pricing section
 * (components/PricingSection.tsx's handleSubscribe) and the dashboard start
 * address the marketing `/pricing` buttons will link to (`/start/plan`, D43)
 * — so the two cannot drift apart on what a plan pick actually does.
 *
 * Anonymous → remember where to land and start a signup. Signed in with an
 * active subscription → the plan switcher. Everyone else → the setup wizard,
 * at whichever step their organization state calls for (no org yet vs. one
 * that still needs a plan).
 */
export async function resolvePlanDestination(params: {
  isSignedIn: boolean
  subscriptionStatus?: string | null
  query: PlanQuery
}): Promise<PlanDestination> {
  const planParams = planQueryString(params.query)

  if (!params.isSignedIn) {
    return { kind: 'signup', returnTarget: `/setup/org?${planParams}` }
  }

  if (params.subscriptionStatus === 'active') {
    return { kind: 'navigate', path: `/switch?${planParams}` }
  }

  try {
    const orgs = await getUserOrganizations()
    return { kind: 'navigate', path: orgs.length === 0 ? `/setup/org?${planParams}` : `/setup/plan?${planParams}` }
  } catch {
    return { kind: 'navigate', path: `/setup/plan?${planParams}` }
  }
}
