'use client'

import { useParams } from 'next/navigation'
import PublicReport from '@/components/reports/PublicReport'

// pulse.ciphera.net/r/<token>: a frozen, shared report (PULSE-133). Public
// (middleware PUBLIC_PREFIXES) and standalone (no app or marketing chrome,
// lib/auth/appRoutes isReportRoute); the view lives in the component.
export default function ReportPage() {
  const params = useParams()
  return <PublicReport token={params.token as string} />
}
