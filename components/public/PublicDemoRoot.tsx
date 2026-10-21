'use client'

import { PublicRoot } from '@/components/public/PublicRoot'
import { usePublicView } from '@/components/public/usePublicView'

/**
 * /demo and every page under it (PUL-34): the product's real pages over the sample site.
 *
 * The site is found through `GET /public/demo`, so no site id is baked into a deployed
 * bundle. While there is no sample site that answers 404 and /demo is what it was before:
 * ciphera.net's own site, sharing its dashboard as a customer's link does.
 */
export default function PublicDemoRoot({ children }: { children: React.ReactNode }) {
  const { state, retry } = usePublicView({ kind: 'demo' })
  return (
    <PublicRoot state={state} basePath="/demo" retry={retry}>
      {children}
    </PublicRoot>
  )
}
