'use client'

import { useParams, redirect } from 'next/navigation'

export default function NewFunnelPage() {
  const params = useParams()
  redirect(`/sites/${params.id}/funnels`)
}
