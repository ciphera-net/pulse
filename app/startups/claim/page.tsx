'use client'

import { Suspense } from 'react'
import { ClaimInner } from '@/components/marketing/ProgrammeClaim'

// /startups/claim — the startups programme's claim leg. Same token contract
// and same backend endpoint as /open-source/claim (which grants by the
// application's kind); only the words differ, and they differ because a
// startup must never be told it is claiming the Open Source plan.
//
// PUBLIC route on purpose, for the same reason as its sibling: the login
// round-trip loses deep links, so an unauthenticated click must land on a
// page that says "sign in, then open the link again".
//
// ⚠️ This file was MISSING from #566: the script that was meant to create it
// crashed on an earlier step, and the middleware entry shipped for a route
// that did not exist. Exporting default only — see the note on its sibling.
export default function StartupsClaimPage() {
  return (
    <Suspense fallback={null}>
      <ClaimInner programme="startups" />
    </Suspense>
  )
}
