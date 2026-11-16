'use client'

import dynamic from 'next/dynamic'

// * The page and assistant-ui load with this route only: the rest of the dashboard never downloads them.
const AnalystPage = dynamic(() => import('./AnalystPage'), { ssr: false })

/** Analyst (PUL-78), for every team since 16-11-2026. */
export default function AnalystRoute({ siteId }: { siteId: string }) {
  return <AnalystPage siteId={siteId} />
}
