'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LoadingOverlay } from '@ciphera-net/facet'
import { useAuth } from '@/lib/auth/context'
import { useSubscription } from '@/lib/swr/dashboard'
import { cdnUrl } from '@/lib/cdn'
import { parsePlanQuery, resolvePlanDestination } from '@/lib/auth/plan-destination'
import { rememberReturnTarget } from '@/lib/auth/return-target'
import { initiateSignupFlow } from '@/lib/api/oauth'

/**
 * The ONE dashboard address the marketing `/pricing` page's plan buttons will
 * link to (D43, the marketing-app split): `/start/plan?plan=&interval=&limit=`.
 * The marketing app carries no session, so every plan pick lands here and this
 * page runs today's `handleSubscribe` decision (see
 * lib/auth/plan-destination.ts, shared with components/PricingSection.tsx)
 * against whatever session THIS origin actually holds.
 *
 * Reachable signed OUT — middleware.ts lists it in PUBLIC_ROUTES — because an
 * anonymous visitor picking a plan is exactly the case this address exists
 * for: it starts a signup and remembers the plan to land on.
 */
function StartPlanRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  // SWR's key for this hook is null until `user` resolves, so `isLoading` is
  // already false (not true) while auth itself is still loading — the same
  // trap /switch's own loading guard documents. Only wait on it once a user
  // exists; an anonymous visitor has no subscription to wait for.
  const { data: subscription, isLoading: subscriptionLoading } = useSubscription()

  useEffect(() => {
    if (authLoading) return

    const query = parsePlanQuery(searchParams)
    if (!query) {
      router.replace('/pricing')
      return
    }

    // Signed in: wait for the subscription read before deciding. Resolving
    // early would treat an active subscriber as if they had none — the one
    // mistake resolvePlanDestination cannot see, since it trusts whatever
    // status it is handed.
    if (user && subscriptionLoading) return

    let cancelled = false
    void (async () => {
      const destination = await resolvePlanDestination({
        isSignedIn: !!user,
        subscriptionStatus: subscription?.subscription_status,
        query,
      })
      if (cancelled) return
      if (destination.kind === 'signup') {
        rememberReturnTarget(destination.returnTarget)
        initiateSignupFlow()
        return
      }
      router.replace(destination.path)
    })()

    return () => {
      cancelled = true
    }
  }, [authLoading, user, subscriptionLoading, subscription, searchParams, router])

  // A brief, neutral hold while auth resolves and the destination is worked
  // out — the same device /switch shows during its own auth-dependent wait.
  return <LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Pulse" />
}

export default function StartPlanPage() {
  return (
    <Suspense fallback={<LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Pulse" />}>
      <StartPlanRedirect />
    </Suspense>
  )
}
