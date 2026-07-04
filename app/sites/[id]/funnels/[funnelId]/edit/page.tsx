'use client'

import { useParams, redirect } from 'next/navigation'

// * Editing lives in the modal on the detail page — this route just lands there.
export default function EditFunnelPage() {
  const params = useParams()
  redirect(`/sites/${params.id}/funnels/${params.funnelId}`)
}
