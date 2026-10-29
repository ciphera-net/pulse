'use client'

import { useParams } from 'next/navigation'
import FunnelDetailSurface from '@/components/surfaces/FunnelDetailSurface'

// The page body is a surface component so /demo and /share/<id> render the same page (PUL-34).
// The site comes from the scope (app/sites/[id]/SiteLayoutShell.tsx provides it); the funnel is
// this route's own parameter, so the route reads it and hands it down.
export default function FunnelDetailPage() {
  const { funnelId } = useParams<{ funnelId: string }>()
  return <FunnelDetailSurface funnelId={funnelId} />
}
