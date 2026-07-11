'use client'

import { useParams, useSearchParams, redirect } from 'next/navigation'

// * Create lives in the modal on the list page — this route lands there,
// * forwarding ?prefill= (and any other params) so seeded creates work. A
// * bare /funnels/new also opens the empty modal via ?create=1: "new" should
// * always start creating, not park on the list.
export default function NewFunnelPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const qs = searchParams.toString()
  const suffix = qs ? `?${qs}` : '?create=1'
  redirect(`/sites/${params.id}/funnels${suffix}`)
}
