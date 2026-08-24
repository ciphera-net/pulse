'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { WarningCircle } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { useSetup } from '@/lib/setup/context'
import { completeOnboarding } from '@/lib/api/organization'
import { getSubscription } from '@/lib/api/billing'
import { Button, Spinner, CheckCircleIcon, UsersIcon, BookOpenIcon, FunnelIcon } from '@ciphera-net/facet'
import InstallStateBlock from '@/components/setup/InstallStateBlock'

/**
 * Payment-confirmation state for arrivals from the Mollie checkout
 * (?from=checkout on the redirect URL). Mollie sends failed/expired/pending
 * returns to the same redirect URL as successes, so "you're all set" must be
 * EARNED by observing an active subscription — never assumed.
 */
type PaymentState = 'none' | 'confirming' | 'confirmed' | 'unconfirmed'

export default function SetupDonePage() {
  const router = useRouter()
  const { user } = useAuth()
  const { site, completeStep } = useSetup()
  const [payment, setPayment] = useState<PaymentState>('none')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('from') !== 'checkout') return
    setPayment('confirming')
    let cancelled = false
    ;(async () => {
      // ~75s: instant methods confirm in seconds; bank redirects can lag.
      for (let i = 0; i < 25; i++) {
        try {
          const sub = await getSubscription()
          if (cancelled) return
          if (sub.subscription_status === 'active' || sub.subscription_status === 'trialing') {
            setPayment('confirmed')
            // Only now is the param safe to drop — a refresh mid-confirmation
            // must re-enter this check, not fall through to the success page.
            window.history.replaceState({}, '', window.location.pathname)
            return
          }
        } catch {
          // transient — keep polling
        }
        await new Promise((r) => setTimeout(r, 3000))
        if (cancelled) return
      }
      if (!cancelled) setPayment('unconfirmed')
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    completeStep('done')
    if (user?.org_id) {
      completeOnboarding(user.org_id).catch(() => {})
    }
  }, [completeStep, user?.org_id])

  if (payment === 'confirming') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
        <Spinner className="mx-auto mb-5" />
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Confirming your payment...
        </h1>
        <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
          This usually takes a few seconds. Your plan activates automatically
          as soon as the payment is confirmed.
        </p>
      </motion.div>
    )
  }

  if (payment === 'unconfirmed') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-none bg-amber-900/20 border border-amber-900/40 mb-5">
          <WarningCircle weight="fill" className="h-8 w-8 text-amber-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          We couldn&apos;t confirm your payment
        </h1>
        <p className="mt-3 text-sm text-neutral-400 max-w-md mx-auto">
          If you cancelled or the payment failed, no charge was made — you can
          simply try again. If you did complete the payment, your plan
          activates automatically within a few minutes; you won&apos;t be
          charged twice.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="default" className="text-sm" onClick={() => router.push('/setup/plan')}>
            Try again
          </Button>
          <Button variant="secondary" className="text-sm" onClick={() => router.push('/settings/organization/billing')}>
            View billing
          </Button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="text-center mb-10">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-none bg-emerald-500/20 mb-5"
        >
          <CheckCircleIcon className="h-8 w-8 text-emerald-400" />
        </motion.div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          You&apos;re all set!
        </h1>
        <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
          Your workspace is ready. Here are some things to do next.
        </p>
      </div>

      {/* First-event state — the server's own install status, not a live
          visitor count, and with a watch window that admits when it lapses.
          The old block here polled /realtime 30x3s and then stopped WITHOUT
          any state for having stopped, so the spinner claimed to still be
          checking forever. */}
      {site && <InstallStateBlock siteId={site.id} domain={site.domain} />}

      {/* Next steps cards */}
      <div className="space-y-3 mb-8">
        <Link
          href="/settings/site/goals"
          className="flex items-center gap-3 p-3 rounded-none border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/30 transition-all"
          onClick={() => {
            if (site) sessionStorage.setItem('pulse_active_site', site.id)
          }}
        >
          <div className="h-9 w-9 rounded-none bg-brand-orange/10 flex items-center justify-center shrink-0">
            <FunnelIcon className="h-4.5 w-4.5 text-brand-orange" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Set up a goal</p>
            <p className="text-xs text-neutral-500">Track conversions and key events</p>
          </div>
        </Link>

        <Link
          href="/settings/organization/members"
          className="flex items-center gap-3 p-3 rounded-none border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/30 transition-all"
        >
          <div className="h-9 w-9 rounded-none bg-brand-orange/10 flex items-center justify-center shrink-0">
            <UsersIcon className="h-4.5 w-4.5 text-brand-orange" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Invite your team</p>
            <p className="text-xs text-neutral-500">Add members to your workspace</p>
          </div>
        </Link>

        <a
          href="https://help.ciphera.net/docs/pulse"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 rounded-none border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/30 transition-all"
        >
          <div className="h-9 w-9 rounded-none bg-brand-orange/10 flex items-center justify-center shrink-0">
            <BookOpenIcon className="h-4.5 w-4.5 text-brand-orange" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Read the docs</p>
            <p className="text-xs text-neutral-500">Guides, API reference, and more</p>
          </div>
        </a>
      </div>

      <Button onClick={() => router.push('/')} className="w-full h-11 md:h-9">
        Go to dashboard
      </Button>
    </motion.div>
  )
}
