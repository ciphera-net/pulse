'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowRightIcon, Button } from '@ciphera-net/facet'
import apiRequest, { ApiError } from '@/lib/api/client'

// The claim leg of the open-source plan (design doc §4c): the approval email
// links here with a single-use token; claiming attaches the caller's
// workspace and grants the plan.
//
// This page is a PUBLIC route on purpose: the login round-trip loses deep
// links (ledger 5-3), so an unauthenticated click must land on a page that
// explains "sign in, then open the link again" rather than bouncing through
// the OAuth flow and dropping the token on the floor. The email link is
// durable — clicking it twice is the recovery path.

// One claim flow, two routes. The programme is known from the ROUTE before
// the backend answers, so every word on the page can be right up front —
// the plan-agnostic copy this page briefly shipped with was wrong: a startup
// following /startups/claim must never read "Open Source plan".
export type Programme = 'opensource' | 'startups'

const PROGRAMME_COPY: Record<Programme, { eyebrow: string; plan: string; terms: string }> = {
  opensource: {
    eyebrow: 'Open source',
    plan: 'Open Source plan',
    terms: 'five sites, 100,000 pageviews a month, 2-year retention, every feature, €0.',
  },
  startups: {
    eyebrow: 'Startups',
    plan: 'Startups plan',
    terms: 'five sites, 100,000 pageviews a month, 2-year retention, every feature, €0 for a year.',
  },
}

export function ClaimInner({ programme }: { programme: Programme }) {
  const copy = PROGRAMME_COPY[programme]
  const token = useSearchParams().get('token') ?? ''
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [project, setProject] = useState<string | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [needsAuth, setNeedsAuth] = useState(false)

  const claim = async () => {
    setState('working')
    setError(null)
    setNeedsAuth(false)
    try {
      // billingGroup mounts at /api/billing (not /api/v1) — the leading /api/
      // makes apiRequest pass the path through unprefixed.
      const res = await apiRequest<{ status: string; project: string; plan_id?: string; kind?: string }>(
        '/api/billing/claim-opensource',
        { method: 'POST', body: JSON.stringify({ token }) }
      )
      setProject(res.project)
      setState('done')
    } catch (err) {
      setState('error')
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setNeedsAuth(true)
        setError('You need to be signed in to the workspace that should receive the plan.')
      } else {
        setError(
          err instanceof Error
            ? err.message
            : 'Something went wrong — try again, or reply to the approval email.'
        )
      }
    }
  }

  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-2xl px-6 py-20 sm:py-28">
        <p className="text-xs text-muted-foreground">Pulse · {copy.eyebrow}</p>
        <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
          {state === 'done' ? 'The plan is yours.' : `Claim the ${programme === 'startups' ? 'startups' : 'open-source'} plan.`}
        </h1>

        {state === 'done' ? (
          <>
            <p className="mt-6 text-base leading-relaxed text-muted-foreground">
              {project ? `${project} now runs` : 'Your workspace now runs'} on the{' '}
              {copy.plan}: {copy.terms} It shows on your billing page immediately.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild>
                <Link href="/settings/organization/billing">
                  See it on your billing page
                  <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/sites">Go to your sites</Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-6 text-base leading-relaxed text-muted-foreground">
              This link came with your approval email. Claiming attaches the{' '}
              {copy.plan} to the workspace you&rsquo;re signed in to: {copy.terms}
            </p>
            {!token && (
              <p className="mt-4 text-sm text-red-500" role="alert">
                The link is missing its token — open the full link from the
                approval email.
              </p>
            )}
            {error && (
              <p className="mt-4 text-sm text-red-500" role="alert">
                {error}
              </p>
            )}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button onClick={claim} disabled={!token || state === 'working'}>
                {state === 'working' ? 'Claiming…' : 'Claim the plan'}
                <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
              {needsAuth && (
                <Button asChild variant="outline">
                  <Link href="/login">Sign in, then open this link again</Link>
                </Button>
              )}
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              No workspace yet? Sign up free first — then come back to this
              link. Stuck? Reply to the approval email; a human reads it.
            </p>
          </>
        )}
      </div>
    </section>
  )
}

