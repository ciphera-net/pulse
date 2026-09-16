'use client'

import Link from 'next/link'
import { ArrowRightIcon, Button } from '@ciphera-net/facet'
import { initiateSignupFlow } from '@/lib/api/oauth'

// The hero's call-to-action row — the only interactive island in an otherwise
// server-rendered marketing hero. "Try Pulse Free" kicks off the SIGNUP flow
// (browser-only), so it must run on the client; the "Live demo" link is a
// plain route link kept alongside it for a single, self-contained CTA cluster.
export function HeroCtas() {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
      {/* 🔴 SIGNUP, NOT SIGN-IN. "Try Pulse Free" is read by somebody with no
          account; the OPAQUE sign-in form greets them with "Welcome back" and
          asks for a password they never set. The header nav has always split
          these two correctly — this, the closing CTA and the pricing cards
          had not. */}
      <Button size="lg" onClick={() => initiateSignupFlow()}>
        Try Pulse Free
        <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
      </Button>
      <Button asChild variant="outline" size="lg">
        <Link href="/demo">
          Live demo
          <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  )
}
