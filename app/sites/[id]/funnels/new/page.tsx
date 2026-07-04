'use client'

import { useParams, useSearchParams, redirect } from 'next/navigation'

// * Create lives in the modal on the list page — this route lands there,
// * forwarding ?prefill= (and any other params) so seeded creates work.
export default function NewFunnelPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const qs = searchParams.toString()
  redirect(`/sites/${params.id}/funnels${qs ? `?${qs}` : ''}`)
}
