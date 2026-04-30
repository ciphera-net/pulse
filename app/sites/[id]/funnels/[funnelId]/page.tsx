'use client'

import { useParams, redirect } from 'next/navigation'

export default function FunnelDetailPage() {
  const params = useParams()
  const siteId = params.id as string
  redirect(`/sites/${siteId}/funnels`)
}
