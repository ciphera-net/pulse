'use client'

import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useFeature } from '@/lib/features'

// * The page and assistant-ui load only for a team in the beta: everyone else never downloads them.
const AnalystPage = dynamic(() => import('./AnalystPage'), { ssr: false })

/**
 * Analyst is a beta (the barry flag, PUL-78): the screen shows only while the team's flag is on, and pulse-backend
 * answers 404 to every Analyst route for a team without it. A team without the beta that opens the address is sent to
 * the site's dashboard; nothing renders until /me has answered, so the page never flashes.
 */
export default function AnalystRoute({ siteId }: { siteId: string }) {
  const on = useFeature('barry')
  const router = useRouter()
  useEffect(() => {
    if (on === false) router.replace(`/sites/${siteId}`)
  }, [on, router, siteId])
  if (on !== true) return null
  return <AnalystPage siteId={siteId} />
}
