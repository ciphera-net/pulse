'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth/context'
import { useSubscription } from '@/lib/swr/dashboard'
import { getSubscription } from '@/lib/api/billing'
import { TRAFFIC_TIERS } from '@/lib/plans'
import PlanSummary from '@/components/checkout/PlanSummary'
import PaymentForm from '@/components/checkout/PaymentForm'
import FeatureSlideshow from '@/components/checkout/FeatureSlideshow'
import pulseIcon from '@/public/pulse_icon_no_margins.png'

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_PLANS = new Set(['solo', 'team', 'business'])
const VALID_INTERVALS = new Set(['month', 'year'])
const VALID_LIMITS = new Set<number>(TRAFFIC_TIERS.map((t) => t.value))

function isValidCheckoutParams(plan: string | null, interval: string | null, limit: string | null) {
  if (!plan || !interval || !limit) return false
  const limitNum = Number(limit)
  if (!VALID_PLANS.has(plan)) return false
  if (!VALID_INTERVALS.has(interval)) return false
  if (!VALID_LIMITS.has(limitNum)) return false
  return true
}

// ---------------------------------------------------------------------------
// Success polling component (post-3DS return)
// ---------------------------------------------------------------------------

function CheckoutSuccess() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    let cancelled = false
    const timeout = setTimeout(() => setTimedOut(true), 30000)

    const poll = async () => {
      for (let i = 0; i < 15; i++) {
        if (cancelled) return
        try {
          const data = await getSubscription()
          if (data.subscription_status === 'active' || data.subscription_status === 'trialing') {
            setReady(true)
            clearTimeout(timeout)
            setTimeout(() => router.push('/?subscribed=1'), 2000)
            return
          }
        } catch {
          // ignore — keep polling
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
      setTimedOut(true)
    }
    poll()

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center"
      >
        {ready ? (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
              <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white">You&apos;re all set!</h2>
            <p className="mt-2 text-sm text-zinc-400">Redirecting to dashboard...</p>
          </>
        ) : timedOut ? (
          <>
            <h2 className="text-xl font-semibold text-white">Taking longer than expected</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Your payment was received. It may take a moment to activate.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors ease-apple"
            >
              Go to dashboard
            </Link>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
            <h2 className="text-xl font-semibold text-white">Setting up your subscription...</h2>
            <p className="mt-2 text-sm text-zinc-400">This usually takes a few seconds.</p>
          </>
        )}
      </motion.div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main checkout content (reads searchParams)
// ---------------------------------------------------------------------------

function CheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const { data: subscription } = useSubscription()
  const [country, setCountry] = useState('')
  const [vatId, setVatId] = useState('')

  const status = searchParams.get('status')
  const plan = searchParams.get('plan')
  const interval = searchParams.get('interval')
  const limit = searchParams.get('limit')

  // -- Auth guard --
  useEffect(() => {
    if (!authLoading && !user) {
      const returnUrl = encodeURIComponent(window.location.pathname + window.location.search)
      router.replace(`/login?redirect=${returnUrl}`)
    }
  }, [authLoading, user, router])

  // -- Subscription guard (skip on success page — it handles its own redirect) --
  useEffect(() => {
    if (status === 'success') return
    if (subscription && (subscription.subscription_status === 'active' || subscription.subscription_status === 'trialing')) {
      router.replace('/')
    }
  }, [subscription, status, router])

  // -- Param validation --
  useEffect(() => {
    if (status === 'success') return // success state doesn't need plan params
    if (!authLoading && user && !isValidCheckoutParams(plan, interval, limit)) {
      router.replace('/pricing')
    }
  }, [authLoading, user, plan, interval, limit, status, router])

  // -- Post-3DS success --
  if (status === 'success') {
    return <CheckoutSuccess />
  }

  // -- Loading state --
  if (authLoading || !user || !isValidCheckoutParams(plan, interval, limit)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
      </div>
    )
  }

  const planId = plan!
  const billingInterval = interval as 'month' | 'year'
  const pageviewLimit = Number(limit)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left — Feature slideshow (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative h-full overflow-hidden">
        <FeatureSlideshow />
      </div>

      {/* Right — Payment (scrollable) */}
      <div className="w-full lg:w-1/2 flex flex-col h-full overflow-y-auto">
        {/* Logo on mobile only (desktop logo is on the left panel) */}
        <div className="px-6 py-5 lg:hidden">
          <Link href="/pricing" className="flex items-center gap-2 w-fit hover:opacity-80 transition-opacity ease-apple">
            <Image
              src={pulseIcon}
              alt="Pulse"
              width={36}
              height={36}
              unoptimized
              className="object-contain w-8 h-8"
            />
            <span className="text-xl font-bold text-white tracking-tight">Pulse</span>
          </Link>
        </div>

        {/* Main content */}
        <div className="flex flex-1 flex-col px-4 pb-12 pt-6 lg:pt-10 sm:px-6 lg:px-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="w-full max-w-lg mx-auto flex flex-col gap-6"
          >
            {/* Plan summary (compact) */}
            <PlanSummary
              plan={planId}
              interval={billingInterval}
              limit={pageviewLimit}
              country={country}
              vatId={vatId}
              onCountryChange={setCountry}
              onVatIdChange={setVatId}
            />

            {/* Payment form */}
            <PaymentForm
              plan={planId}
              interval={billingInterval}
              limit={pageviewLimit}
              country={country}
              vatId={vatId}
            />
          </motion.div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page wrapper with Suspense (required for useSearchParams in App Router)
// ---------------------------------------------------------------------------

export default function CheckoutPage() {
  return (
    <div className="min-h-screen bg-zinc-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900/40 via-zinc-950 to-zinc-950">
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
          </div>
        }
      >
        <CheckoutContent />
      </Suspense>
    </div>
  )
}
