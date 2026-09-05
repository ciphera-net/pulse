'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { WarningCircle, Prohibit } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { useSetup } from '@/lib/setup/context'
import { useSites } from '@/lib/swr/sites'
import { completeOnboarding } from '@/lib/api/organization'
import { ApiError } from '@/lib/api/client'
import { getSubscription } from '@/lib/api/billing'
import { trackWelcomeCompleted } from '@/lib/welcomeAnalytics'
import { Button, CheckCircleIcon, UsersIcon, BookOpenIcon, FunnelIcon } from '@ciphera-net/facet'
import InstallStateBlock from '@/components/setup/InstallStateBlock'

/**
 * Payment-confirmation state machine for arrivals from the Mollie checkout
 * (?from=checkout on the redirect URL). Mollie sends failed/expired/pending
 * returns to the same redirect URL as successes, so "you're all set" must be
 * EARNED by observing an active subscription — never assumed.
 *
 * 'init'        — first render, URL not yet inspected (one frame).
 * 'none'        — not a checkout arrival (Hobby / skip path): settled by definition.
 * 'confirming'  — polling for the payment to land (ruled B1 state).
 * 'confirmed'   — subscription observed active/trialing.
 * 'failed'      — a TERMINAL negative (past_due/canceled) — resolves immediately,
 *                 never burns the poll window.
 * 'error'       — the POLL itself keeps failing (401/500/network). A problem on
 *                 our side, not a statement about the payment — its own state,
 *                 never conflated with "couldn't confirm".
 * 'unconfirmed' — window elapsed with the subscription still unactivated.
 */
type PaymentState = 'init' | 'none' | 'confirming' | 'confirmed' | 'failed' | 'error' | 'unconfirmed'

export default function SetupDonePage() {
  const router = useRouter()
  const { user } = useAuth()
  const { site, completeStep } = useSetup()
  // The sites fetch's own loading flag: completion must not be decided while it
  // is still in flight (see the one-way-door effect below).
  const { isLoading: sitesLoading } = useSites()
  const [payment, setPayment] = useState<PaymentState>('init')
  // Bumped by "Check again" on the error state — restarts the poll.
  const [pollNonce, setPollNonce] = useState(0)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('from') !== 'checkout') {
      setPayment('none')
      return
    }
    setPayment('confirming')
    let cancelled = false
    ;(async () => {
      // ~75s: instant methods confirm in seconds; bank redirects can lag.
      let consecutiveErrors = 0
      for (let i = 0; i < 25; i++) {
        try {
          const sub = await getSubscription()
          if (cancelled) return
          consecutiveErrors = 0
          if (sub.subscription_status === 'active' || sub.subscription_status === 'trialing') {
            setPayment('confirmed')
            // Only now is the param safe to drop — a refresh mid-confirmation
            // must re-enter this check, not fall through to the success page.
            window.history.replaceState({}, '', window.location.pathname)
            return
          }
          if (sub.subscription_status === 'past_due' || sub.subscription_status === 'canceled') {
            // A terminal status is an answer. The old loop only matched
            // success, so a definitively failed payment burned the full 75s
            // before showing anything.
            setPayment('failed')
            return
          }
        } catch {
          // The POLL failed, which says nothing about the payment. One blip is
          // retried; a run of them gets its own state instead of masquerading
          // as "we couldn't confirm your payment" after the full window.
          consecutiveErrors++
          if (consecutiveErrors >= 3) {
            if (!cancelled) setPayment('error')
            return
          }
        }
        await new Promise((r) => setTimeout(r, 3000))
        if (cancelled) return
      }
      if (!cancelled) setPayment('unconfirmed')
    })()
    return () => { cancelled = true }
  }, [pollNonce])

  // 🔴 Completion is EARNED (ruled B1): welcome_completed, completeStep('done')
  // and completeOnboarding fire ONLY once payment state is settled — 'none'
  // (no payment was attempted) or 'confirmed'. They used to fire on MOUNT,
  // while the confirming spinner was still up, so an abandoned checkout
  // counted as a completed onboarding and polluted the funnel (F-B14).
  // The wizard-local step + the analytics event fire once when payment settles.
  // These are safe to fire regardless of the sites fetch and must not be coupled
  // to the one-way onboarding write below.
  const completionFiredRef = useRef(false)
  useEffect(() => {
    if (payment !== 'none' && payment !== 'confirmed') return
    if (completionFiredRef.current) return
    completionFiredRef.current = true
    completeStep('done')
    trackWelcomeCompleted(Boolean(site))
  }, [payment, completeStep, site])

  // 🔴 best-way-B: onboarding_completed_at is the estate's ONE write of that flag,
  // a one-way door, and what the resume flow reads to stop re-offering the site
  // step. It must fire iff a site exists — never site-less (that stranded the two
  // internal orgs) and never MISSED for a real site.
  //
  // 🔴 Its own latch, NOT the shared completionFiredRef: `site` is derived
  // asynchronously from useSites() by the setup context, and useSites() swallows
  // a transient fetch failure to []. On a cold mount (deep-link, stale tab) the
  // effect could fire while `site` is momentarily null, and a shared one-shot ref
  // would lock the write out permanently for a user who genuinely has a site.
  // Instead: wait for the fetch to settle, write only with a site, and let the
  // effect re-run and fire when `site` flips truthy after an SWR retry.
  // 🔴 THE LATCH GUARDS THE WRITE, NOT THE ATTEMPT (05-09-2026).
  //
  // It used to be set on the line BEFORE the await, and the failure was
  // swallowed by `.catch(() => {})`. One line then produced two different
  // outcomes and made them indistinguishable:
  //
  //   - an OWNER hitting a transient 5xx/network error had the write skipped and
  //     the latch locked, so the flag was never written; the org wall bounced
  //     them, /setup/done remounted, the ref reset and it retried. Self-healing
  //     BY ACCIDENT, through a loop that reads to the user as a bug.
  //   - a NON-OWNER got a permanent 403 ("Only the owner can complete
  //     onboarding", ciphera-id organization.go) by exactly the same mechanics —
  //     but a 403 never resolves, so the loop never ends and no error is ever
  //     shown. Their only exit is /settings/*.
  //
  // Permanent and transient failures need OPPOSITE handling, and a bare
  // `.catch(() => {})` is the one construct that guarantees they get the same.
  // So: latch only once the call has actually succeeded, treat 403 as terminal
  // and say so, and let anything else fall through to a retry on the next run.
  //
  // This is the request-failure sibling of the async-state trap the 05-09 review
  // caught — see the comment above onboardingWrittenRef's introduction.
  const onboardingWrittenRef = useRef(false)
  const onboardingInFlightRef = useRef(false)
  const [completionForbidden, setCompletionForbidden] = useState(false)
  useEffect(() => {
    if (payment !== 'none' && payment !== 'confirmed') return
    if (onboardingWrittenRef.current) return
    if (onboardingInFlightRef.current) return // one request at a time, not one attempt ever
    if (completionForbidden) return           // 403 is terminal; retrying cannot change it
    if (!user?.org_id) return
    if (sitesLoading) return // the sites fetch is still in flight — decide nothing yet
    if (!site) return        // settled with no site → the layout guard redirects; never write site-less

    onboardingInFlightRef.current = true
    completeOnboarding(user.org_id)
      .then(() => {
        onboardingWrittenRef.current = true // the WRITE happened; never repeat it
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 403) {
          // Not ours to write. Stop, and let the render say something true
          // instead of claiming the workspace is ready.
          setCompletionForbidden(true)
          return
        }
        // Transient (5xx, network, timeout). Deliberately leaves BOTH refs
        // clear so the next effect run retries — the previous code's silent
        // give-up is what stranded a legitimate owner.
      })
      .finally(() => {
        onboardingInFlightRef.current = false
      })
  }, [payment, site, sitesLoading, user?.org_id, completionForbidden])

  if (payment === 'init') return null

  if (payment === 'confirming') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
        <p className="mx-auto mb-5 flex items-center justify-center gap-2 text-sm font-semibold text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-orange animate-pulse" />
          Confirming your payment
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Almost there
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-400">
          Cards confirm in seconds. Bank redirects can take a minute — your
          plan activates automatically the moment the payment lands.
        </p>
        <p className="mx-auto mt-8 text-xs text-neutral-500">
          Been a while?{' '}
          <Link href="/settings/organization/billing" className="text-brand-orange hover:underline">
            Check billing
          </Link>
          {' '}— you won&apos;t be charged twice.
        </p>
      </motion.div>
    )
  }

  if (payment === 'failed') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-none border border-neutral-800 mb-5">
          <Prohibit weight="fill" className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Your payment didn&apos;t go through
        </h1>
        <p className="mt-3 text-sm text-neutral-400 max-w-md mx-auto">
          The payment was declined or cancelled, so your plan wasn&apos;t
          activated. You can try again with the same or a different payment
          method — nothing has been charged.
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

  if (payment === 'error') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-none border border-neutral-800 mb-5">
          <WarningCircle weight="fill" className="h-8 w-8 text-amber-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          We can&apos;t check your payment right now
        </h1>
        <p className="mt-3 text-sm text-neutral-400 max-w-md mx-auto">
          This is a problem on our side, not with your payment. If you
          completed it, your plan activates automatically — you won&apos;t be
          charged twice.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="default" className="text-sm" onClick={() => setPollNonce((n) => n + 1)}>
            Check again
          </Button>
          <Button variant="secondary" className="text-sm" onClick={() => router.push('/settings/organization/billing')}>
            View billing
          </Button>
        </div>
      </motion.div>
    )
  }

  if (payment === 'unconfirmed') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-10">
        {/* Hairline square, colour only in the glyph (ruled A2 vocabulary —
            tinted panels are the WS2-retired device). */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-none border border-neutral-800 mb-5">
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
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-none border border-neutral-800 mb-5"
        >
          <CheckCircleIcon className="h-8 w-8 text-pos" />
        </motion.div>
        {payment === 'confirmed' && (
          <p className="mb-3 text-sm font-semibold text-pos">✓ Payment confirmed</p>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-white">
          {completionForbidden ? 'You\u2019re in' : (<>You&apos;re all set!</>)}
        </h1>
        {/* 🔴 A non-owner reaching here cannot write onboarding_completed_at —
            ciphera-id refuses it — so the workspace is genuinely NOT finished and
            saying "your workspace is ready" would be a claim the app knows to be
            false. It also is not this person's job to fix, so the copy names the
            owner rather than handing them an action they cannot take.
            Colour lives in a single word, never a tinted panel (house rule). */}
        <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
          {completionForbidden
            ? 'Your account is active. The workspace owner still has a step left to finish setting it up \u2014 that part isn\u2019t yours to complete.'
            : 'Your workspace is ready. Here are some things to do next.'}
        </p>
      </div>

      {/* First-event state — the server's own install status, not a live
          visitor count, and with a watch window that admits when it lapses.
          The old block here polled /realtime 30x3s and then stopped WITHOUT
          any state for having stopped, so the spinner claimed to still be
          checking forever. */}
      {site && <InstallStateBlock siteId={site.id} domain={site.domain} />}

      {/* Next steps cards — hairline icon squares, colour only in the glyph
          (ruled A2). The goal card is site-scoped, so a site-less org (site
          step skipped) doesn't get a link into settings for a site that
          doesn't exist. */}
      <div className="space-y-3 mb-8">
        {site && (
          <Link
            href="/settings/site/goals"
            className="flex items-center gap-3 p-3 rounded-none border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/30 transition-all"
            onClick={() => {
              sessionStorage.setItem('pulse_active_site', site.id)
            }}
          >
            <div className="h-9 w-9 rounded-none border border-neutral-800 flex items-center justify-center shrink-0">
              <FunnelIcon className="h-4.5 w-4.5 text-brand-orange" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Set up a goal</p>
              <p className="text-xs text-neutral-500">Track conversions and key events</p>
            </div>
          </Link>
        )}

        <Link
          href="/settings/organization/members"
          className="flex items-center gap-3 p-3 rounded-none border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/30 transition-all"
        >
          <div className="h-9 w-9 rounded-none border border-neutral-800 flex items-center justify-center shrink-0">
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
          <div className="h-9 w-9 rounded-none border border-neutral-800 flex items-center justify-center shrink-0">
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
