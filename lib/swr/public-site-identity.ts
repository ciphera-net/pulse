// * The site's name and domain for the public headers (/demo and /share/<id>; PUL-34 Phase 2).
// *
// * The demo is served its site record (useSite, a demo-class read). A share link is served only the five
// * customer routes (lib/swr/site-read.ts), never the record, so its name comes from the dashboard payload's own
// * `site`, which the dashboard surface records here once it has it: the share page has always named the site from
// * that payload. Neither hook makes a request of its own, and nothing is recorded where the record can be read (a
// * member, whose headers name the site from the sites list, and the demo).
//
// Its own module, not lib/swr/dashboard.ts: that file's hooks are pinned read by read for members
// (__tests__/member-reads-unchanged.test.tsx), and nothing here is a member read.

import { useEffect } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { useOptionalSiteScope } from '@/lib/scope/SiteScope'
import { useSite } from '@/lib/swr/dashboard'
import { useSiteRead } from '@/lib/swr/site-read'

export interface PublicSiteIdentity {
  name: string
  domain: string
}

/** The cache key of a site's name and domain as the dashboard payload last reported them. */
const identityKey = (siteKey: string) => ['public-site-identity', siteKey]

/**
 * Records the site's name and domain from a dashboard payload where the site record cannot be read: under a share
 * link's scope only (a member's and the demo's record names the site, so nothing is written for them). Called by the
 * dashboard surface with `dashboard.site`; writes the cache and makes no request.
 */
export function useRecordPublicSiteIdentity(siteId: string, site: { name?: string; domain?: string } | null | undefined) {
  const scope = useOptionalSiteScope()
  const { siteKey } = useSiteRead(siteId, 'customer')
  const { available: recordReadable } = useSiteRead(siteId, 'demo')
  const { mutate } = useSWRConfig()
  const needed = scope?.mode === 'public' && !recordReadable
  const name = site?.name
  const domain = site?.domain
  useEffect(() => {
    if (needed && siteId && name) void mutate(identityKey(siteKey), { name, domain: domain ?? '' }, { revalidate: false })
  }, [needed, mutate, siteId, siteKey, name, domain])
}

/** The demo's site record, else what the dashboard surface recorded; undefined until either is known. */
export function usePublicSiteIdentity(siteId: string): PublicSiteIdentity | undefined {
  const { data: record } = useSite(siteId)
  const { siteKey } = useSiteRead(siteId, 'customer')
  const { data: recorded } = useSWR<PublicSiteIdentity>(siteId ? identityKey(siteKey) : null, null)
  if (record?.name) return { name: record.name, domain: record.domain }
  return recorded
}
