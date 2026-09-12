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
import { SETUP_COPY } from '@/lib/setup/copy'
import { Button } from '@ciphera-net/facet'
import InstallStateBlock from '@/components/setup/InstallStateBlock'
import SiteChip from '@/components/setup/SiteChip'
import Confetti from '@/components/setup/Confetti'
import { SiteFavicon } from '@/components/sites/SiteFavicon'

/**
 * Payment-confirmation state machine for arrivals from the Mollie checkout
 * (?from=checkout on the redirect URL). Mollie sends failed/expired/pending
 * returns to the same redirect URL as successes, so "you're in" must be
 * EARNED by observing an active subscription — never assumed.
 *
 * 'init'        — first render, URL not yet inspected (one frame).
 * 'none'        — not a checkout arrival (the normal path): settled by definition.
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
  //
  // ⚠️ F-B14 IS ABOUT THE ANALYTICS FUNNEL, not about the org flag, and the
  // distinction started mattering on 11-09-2026 when the flag moved to site
  // creation. `welcome_completed` measures who finished the WIZARD and must
  // keep its payment gate. The flag measures whether the workspace can receive
  // data, which a pricing decision has never had anything to do with.
  //
  // 🎉 THE CONFETTI TAKES THE SAME GATE. It is the visual twin of
  // welcome_completed: once, only when settled or confirmed, never while the
  // confirming spinner is up and never on a failed or unconfirmed payment. A
  // celebration over an abandoned checkout would be the F-B14 mistake in
  // pixels. `celebrate` is state, not a ref, because the canvas has to MOUNT;
  // the ref is what keeps it to one mount per completion.
  const completionFiredRef = useRef(false)
  const [celebrate, setCelebrate] = useState(false)
  useEffect(() => {
    if (payment !== 'none' && payment !== 'confirmed') return
    if (completionFiredRef.current) return
    completionFiredRef.current = true
    completeStep('done')
    trackWelcomeCompleted(Boolean(site))
    setCelebrate(true)
  }, [payment, completeStep, site])

  // 🔴 NO LONGER THE ONLY WRITE, AND NO LONGER THE ONE THAT MATTERS (11-09-2026).
  // `onboarding_completed_at` is now written the moment a site is created
  // (app/setup/site/page.tsx), because that is when the workspace can receive
  // data — which is the only thing the onboarding wall is waiting for. While
  // this page was the sole writer, the wall was cleared only by completing a
  // funnel that ends in a PRICING decision, so a stranger who would not pick a
  // plan and could not install was locked out of the product. Design:
  // `Pulse/docs/plans/11-09-2026-onboarding-wall-fix-design.md`.
  //
  // ⚠️ THE WRITE STAYS HERE ANYWAY, and deleting it would be the wrong tidy-up:
  // it costs one idempotent request and it covers a wizard already in flight
  // when this shipped, an org whose site predates the change, and any future
  // path to /setup/done that does not pass through the site step. The one-way
  // guard is in ciphera-id's SQL (`WHERE onboarding_completed_at IS NULL`), so
  // a second writer cannot move a timestamp that is already set.
  //
  // It must fire iff a site exists — never site-less (that stranded the two
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

  // ── The moment (direction B, owner pick 11-09-2026) ─────────────────────
  // The site's own icon in a hairline frame where a generic check tile used
  // to be; one big heading; one line; the chip; the install state; ONE button.
  // The three "next steps" cards are gone — they duplicated the sidebar, and
  // a completion screen with a to-do list on it is not a completion screen.
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
    >
      {celebrate && !completionForbidden && <Confetti />}

      <div className="text-center mb-8">
        {site && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-none border border-neutral-800"
            data-testid="done-favicon-frame"
          >
            <SiteFavicon domain={site.domain} name={site.name} size={32} className="h-8 w-8" />
          </motion.div>
        )}
        {payment === 'confirmed' && (
          <p className="mb-3 text-sm font-semibold text-pos">✓ Payment confirmed</p>
        )}
        <h1 className="text-3xl font-bold tracking-tight text-white">
          {completionForbidden ? 'You’re in' : SETUP_COPY.done.heading}
        </h1>
        {/* 🔴 A non-owner reaching here cannot write onboarding_completed_at —
            ciphera-id refuses it — so the workspace is genuinely NOT finished and
            a celebration would be a claim the app knows to be false. The copy
            names the owner rather than handing them an action they cannot take,
            and no confetti fires. Colour lives in a single word, never a tinted
            panel (house rule). */}
        <p className="mt-3 text-sm text-neutral-400 max-w-md mx-auto">
          {completionForbidden
            ? 'Your account is active. The workspace owner still has a step left to finish setting it up — that part isn’t yours to complete.'
            : SETUP_COPY.done.dek}
        </p>
        {site && (
          <div className="mt-4 flex justify-center">
            <SiteChip domain={site.domain} name={site.name} />
          </div>
        )}
      </div>

      {/* First-event state — the server's own install status, not a live
          visitor count, and with a watch window that admits when it lapses. */}
      {site && <InstallStateBlock siteId={site.id} domain={site.domain} />}

      {/* Land on the site that was just added (owner's ruling, 11-09-2026): a
          fleet of one silent card sells nothing, while the site's own dashboard
          shows the install state and the way to the snippet. The fleet stays
          the fallback for a wizard with no site to name — a deep link with the
          sites fetch still resolving — and its cache is written at site
          creation, so it is correct whenever someone does go there. */}
      <Button onClick={() => router.push(site ? `/sites/${site.id}` : '/')} className="w-full h-11 md:h-9">
        {SETUP_COPY.doneButton}
      </Button>
    </motion.div>
  )
}
