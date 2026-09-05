'use client'

import { Suspense } from 'react'
import { ClaimInner } from '@/components/marketing/ProgrammeClaim'

// /open-source/claim — the open-source programme's claim leg. The flow lives
// in components/marketing/ProgrammeClaim.tsx and is mounted here and at
// /startups/claim with a different programme.
//
// ⚠️ A page.tsx may export ONLY the page contract. Exporting the component
// from here compiled under tsc and FAILED `next build` (pipeline 1471), which
// runs only in the push pipeline — so the PR went green and the deploy died.
export default function OpenSourceClaimPage() {
  return (
    <Suspense fallback={null}>
      <ClaimInner programme="opensource" />
    </Suspense>
  )
}
