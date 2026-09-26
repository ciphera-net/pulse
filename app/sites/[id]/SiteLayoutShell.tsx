'use client'

import { useEffect, useRef } from 'react'
import { rememberLastSite, markSessionEntered } from '@/lib/last-site'
import { useSite } from '@/lib/swr/dashboard'
import { SiteInAnotherTeam } from '@/components/sites/SiteInAnotherTeam'

/**
 * A site from another of the reader's teams: the server's plain cross-team 403,
 * `{"error":"Access denied"}` with NO code. Every other 403 on this route carries
 * one — ORG_REQUIRED (no team in the session), ORGANIZATION_DELETED and
 * ACCOUNT_DELETED (a token outliving its team or account, EnsureMembership's
 * tombstone path) — and none of those is "another team", so none gets that state
 * (review, 26-09-2026). Duck-typed, not instanceof: chunk-split bundles can hold
 * two ApiError classes (the funnel detail page's measured lesson).
 */
function isOtherTeam(error: unknown): boolean {
  const e = error as { status?: number; data?: { code?: unknown } } | undefined
  return e?.status === 403 && e.data?.code === undefined
}

/**
 * The sites layout's client half. It no longer mounts the dashboard shell —
 * app/layout-content.tsx mounts ONE DashboardShell for every dashboard route,
 * site pages included, so a site page → settings navigation keeps the same
 * shell and the sidebar's highlight glides across it (settings tail, item 10,
 * 17-09-2026; before that the shell lived here for site pages and in
 * layout-content for everything else, and the boundary remounted it).
 *
 * What stays is what was only ever this layout's: remembering the site — and,
 * since PULSE-87, the one place a site from ANOTHER of the reader's teams is
 * recognised. That site answers 403 to every request, and each page used to fail
 * its own way (a skeleton forever, empty data that was not true, a Retry that
 * could never work). Deciding it here, above every page, means no page mounts
 * against a site the session cannot read, and a page added later cannot forget.
 * The site request is the SAME SWR key the pages use, so it costs nothing extra.
 * Every other failure (404, 5xx, network, a coded 403) is left to the page, which
 * states it.
 */
export default function SiteLayoutShell({
  siteId,
  children,
}: {
  siteId: string
  children: React.ReactNode
}) {
  const { data: site, error } = useSite(siteId)
  const otherTeam = !site && isOtherTeam(error)

  useEffect(() => {
    if (siteId) {
      sessionStorage.setItem('pulse_active_site', siteId)
      // * Feed the entry redirect ("/" → last-visited site) and spend this
      // * session's redirect, so a deep link into a site doesn't bounce the
      // * next "Your Sites" click straight back here. Both readers validate the
      // * id against the team's own sites, so remembering a site this session
      // * cannot read is harmless.
      rememberLastSite(siteId)
      markSessionEntered()
    }
  }, [siteId])

  // * After an in-place team switch the state unmounts under the reader's focus
  // * (they had just pressed "Switch to …"), which would drop focus to <body> with
  // * nothing announced. When the state gives way to the page, focus moves to the
  // * page's main region instead (review, 26-09-2026).
  const wasOtherTeam = useRef(false)
  useEffect(() => {
    if (otherTeam) {
      wasOtherTeam.current = true
      return
    }
    if (wasOtherTeam.current && site) {
      wasOtherTeam.current = false
      const frame = requestAnimationFrame(() => {
        const main = document.querySelector('main')
        if (!main) return
        if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1')
        main.focus({ preventScroll: true })
      })
      return () => cancelAnimationFrame(frame)
    }
  }, [otherTeam, site])

  if (otherTeam) {
    return <SiteInAnotherTeam siteId={siteId} />
  }
  return <>{children}</>
}
