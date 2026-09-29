'use client'

import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import ReportPrint from '@/components/reports/ReportPrint'

// The PDF runner's page (PULSE-133): the report's slides as 16:9 pages, in the
// theme the report was made with. See components/reports/ReportPrint.
function PrintInner() {
  const params = useParams()
  const search = useSearchParams()
  return <ReportPrint token={params.token as string} theme={search.get('theme')} printKey={search.get('pk')} />
}

export default function ReportPrintPage() {
  return (
    <Suspense fallback={null}>
      <PrintInner />
    </Suspense>
  )
}
