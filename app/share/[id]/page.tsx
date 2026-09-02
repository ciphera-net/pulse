'use client'

import { useParams } from 'next/navigation'
import PublicDashboard from '@/components/share/PublicDashboard'

// Thin wrapper since 02-09-2026: the whole view lives in
// components/share/PublicDashboard so /demo can mount the SAME surface
// pinned to ciphera.net. Everything share-specific that must survive —
// password+captcha gate, suppression note, presets-only picker, noindex
// (app/share/[id]/layout.tsx) — lives in the component and the layout,
// not here.
export default function PublicDashboardPage() {
  const params = useParams()
  return <PublicDashboard siteId={params.id as string} />
}
