'use client'

/**
 * Embedded Stripe Checkout page.
 * Requires plan_id, interval, limit in URL (e.g. /checkout?plan_id=solo&interval=year&limit=100000).
 * Falls back to pulse_pending_checkout from localStorage (after OAuth).
 */

import { useCallback, useEffect, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js'
import { useAuth } from '@/lib/auth/context'
import { createCheckoutSession } from '@/lib/api/billing'
import { LoadingOverlay } from '@ciphera-net/ui'
import Link from 'next/link'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '')

function CheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()

  const planId = searchParams.get('plan_id')
  const interval = searchParams.get('interval')
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? parseInt(limitParam, 10) : null

  const paramsValid = planId && interval && limit != null && !Number.isNaN(limit) && limit > 0

  const fetchClientSecret = useCallback(async () => {
    let pid = planId
    let int = interval
    let lim = limit

    if (!paramsValid) {
      const pending = typeof window !== 'undefined' ? localStorage.getItem('pulse_pending_checkout') : null
      if (pending) {
        try {
          const intent = JSON.parse(pending)
          pid = intent.planId || pid
          int = intent.interval || int
          lim = intent.limit ?? lim
        } catch {
          // ignore
        }
      }
    }

    if (!pid || !int || lim == null || lim <= 0) {
      throw new Error('Missing checkout params. Go to Pricing to subscribe.')
    }

    const { client_secret } = await createCheckoutSession({
      plan_id: pid,
      interval: int,
      limit: lim,
    })
    return client_secret
  }, [planId, interval, limit, paramsValid])

  const options = useMemo(() => ({ fetchClientSecret }), [fetchClientSecret])

  useEffect(() => {
    if (!user) {
      const intent = paramsValid
        ? { planId, interval, limit, fromCheckout: true }
        : typeof window !== 'undefined' ? localStorage.getItem('pulse_pending_checkout') : null
      if (intent && typeof intent === 'string') {
        try {
          const parsed = JSON.parse(intent)
          localStorage.setItem('pulse_pending_checkout', JSON.stringify({ ...parsed, fromCheckout: true }))
        } catch {
          // ignore
        }
      } else if (paramsValid && typeof window !== 'undefined') {
        localStorage.setItem('pulse_pending_checkout', JSON.stringify({ planId, interval, limit, fromCheckout: true }))
      }
      router.replace('/login')
      return
    }

    if (!paramsValid) {
      const pending = typeof window !== 'undefined' ? localStorage.getItem('pulse_pending_checkout') : null
      if (!pending) {
        router.replace('/pricing')
        return
      }
    }
  }, [user, paramsValid, planId, interval, limit, router])

  if (!user) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Redirecting to login…" />
  }

  if (!paramsValid) {
    const pending = typeof window !== 'undefined' ? localStorage.getItem('pulse_pending_checkout') : null
    if (!pending) {
      return (
        <div className="min-h-screen pt-24 px-4 flex flex-col items-center justify-center gap-4">
          <p className="text-neutral-600 dark:text-neutral-400">Missing checkout parameters.</p>
          <Link href="/pricing" className="text-brand-orange hover:underline font-medium">
            Go to Pricing
          </Link>
        </div>
      )
    }
  }

  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    return (
      <div className="min-h-screen pt-24 px-4 flex flex-col items-center justify-center gap-4">
        <p className="text-neutral-600 dark:text-neutral-400">Checkout is not configured.</p>
        <Link href="/pricing" className="text-brand-orange hover:underline font-medium">
          Back to Pricing
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen pt-24 px-4 pb-12 max-w-2xl mx-auto">
      <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Loading checkout…" />}>
      <CheckoutContent />
    </Suspense>
  )
}
