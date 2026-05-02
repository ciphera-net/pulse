'use client'

import { useParams, redirect } from 'next/navigation'

export default function EditFunnelPage() {
  const params = useParams()
  redirect(`/sites/${params.id}/funnels`)
}
