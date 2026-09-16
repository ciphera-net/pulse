'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useSites } from '@/lib/swr/sites'
import type { Site } from '@/lib/api/sites'

/**
 * ActiveSite context — the single owner of "which site are we configuring".
 *
 * Consolidates the per-tab site-picker logic that used to live in
 * `app/settings/site/[tab]/page.tsx`: it fetches the sites list once, resolves
 * the active site (a valid sessionStorage-stored id, else the first site), and
 * persists the selection. The shell's Site context band (the switcher), the site
 * route page (which passes `siteId` to the tab) and the dashboard chrome (which
 * keeps the outer sidebar in site mode on /settings/site/*) all read from here,
 * so there is one selection and one fetch across the whole surface.
 *
 * 🔑 Mounted in `app/layout-content.tsx`, ABOVE DashboardShell — it has to
 * outrank the shell for the sidebar to read it, so it now spans the whole
 * authenticated dashboard branch rather than a single settings visit. That is
 * why the hydrate effect below is keyed on the PATHNAME instead of running once
 * at mount: the provider no longer remounts on the way into settings, and a
 * mount-only read would miss both entry paths (a ?siteId= deep link from the
 * site sidebar, and InstallBanner writing sessionStorage then navigating with
 * no query at all).
 */
const ACTIVE_SITE_KEY = 'pulse_active_site'

/**
 * Drop a consumed `?siteId=` from the CURRENT history entry, keeping every
 * other param and the hash. A deep link is consumed exactly once; the moment
 * it has been adopted it must leave the address bar, or the entry it sits on
 * will hand the old site back to the pathname-keyed read below the next time
 * Back lands there (and a copied URL would name a site the user moved off).
 *
 * replaceState, not router.replace: the entry is CORRECTED in place, with no
 * new history step and no route re-render — Next patches the native history
 * methods and keeps usePathname/useSearchParams in step.
 */
function eraseSiteIdParam() {
  const params = new URLSearchParams(window.location.search)
  if (!params.has('siteId')) return
  params.delete('siteId')
  const query = params.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
}

interface ActiveSiteValue {
  sites: Site[]
  activeSite: Site | null
  /** The resolved active site id — non-null only when it maps to a real site. */
  activeSiteId: string | null
  setActiveSiteId: (id: string) => void
  isLoading: boolean
  error: unknown
  mutate: () => void
}

const ActiveSiteContext = createContext<ActiveSiteValue | null>(null)

export function ActiveSiteProvider({ children }: { children: ReactNode }) {
  const { sites, isLoading, error, mutate } = useSites()
  const pathname = usePathname()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // The resolve effect must not run before hydration: on the first pass both
  // effects fire in one batch, and resolving against the pre-hydration null
  // stomped the stored/deep-linked selection with the first site (this is why
  // settings always opened on the org's first site after a fresh mount).
  const [hydrated, setHydrated] = useState(false)

  // Hydrate the selection on the client (kept out of the initial render so
  // server and first client render agree — no hydration mismatch). A ?siteId=
  // deep link (the site sidebar's Settings entry carries the current site)
  // outranks the stored selection; a param is also written back to storage so
  // the next query-less navigation keeps it. Validity is enforced by the
  // resolve effect below (an unknown id falls back to the first site).
  //
  // ⚠️ Read from `window.location`, never `useSearchParams`: this provider hangs
  // off the root layout, which also renders the static marketing pages, and
  // useSearchParams there demands a Suspense boundary.
  //
  // Re-runs on every pathname change, which is what lets a writer hand the
  // selection over by "set sessionStorage, then navigate" (InstallBanner's link
  // to /settings/site/general carries no query). In-settings switching is still
  // never fought: setActiveSiteId writes storage itself, and the settings rail's
  // own hrefs carry no query, so a re-read after a tab change finds exactly what
  // the switcher last chose.
  //
  // 🔴 The param is ERASED the moment it is adopted. With a re-read on every
  // pathname change, a history entry that still carried `?siteId=A` would hand
  // A back on Back — after the user had switched to B on some later tab. So no
  // entry ever keeps a consumed deep link: not the one it arrived on, and not
  // (see setActiveSiteId) the one a switch happens on.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const param = new URLSearchParams(window.location.search).get('siteId')
    if (param) {
      setSelectedId(param)
      sessionStorage.setItem(ACTIVE_SITE_KEY, param)
      eraseSiteIdParam()
    } else {
      const stored = sessionStorage.getItem(ACTIVE_SITE_KEY)
      if (stored) setSelectedId(stored)
    }
    setHydrated(true)
  }, [pathname])

  // Resolve: once sites load, if nothing valid is selected, fall back to the
  // first site and persist it. Centralised here so no two surfaces race to set
  // the active site.
  useEffect(() => {
    if (!hydrated || sites.length === 0) return
    const valid = selectedId && sites.some((s) => s.id === selectedId)
    if (!valid) {
      const id = sites[0].id
      setSelectedId(id)
      if (typeof window !== 'undefined') sessionStorage.setItem(ACTIVE_SITE_KEY, id)
    }
  }, [hydrated, sites, selectedId])

  const setActiveSiteId = useCallback((id: string) => {
    setSelectedId(id)
    if (typeof window === 'undefined') return
    sessionStorage.setItem(ACTIVE_SITE_KEY, id)

    // Belt and braces: adoption already stripped the param from the entry it
    // arrived on, so a switch normally finds none — but a param that reached
    // this entry any other way is superseded by this choice and goes the same way.
    eraseSiteIdParam()
  }, [])

  const activeSite = sites.find((s) => s.id === selectedId) ?? null

  const value: ActiveSiteValue = {
    sites,
    activeSite,
    activeSiteId: activeSite?.id ?? null,
    setActiveSiteId,
    isLoading,
    error,
    mutate,
  }

  return <ActiveSiteContext.Provider value={value}>{children}</ActiveSiteContext.Provider>
}

export function useActiveSite(): ActiveSiteValue {
  const ctx = useContext(ActiveSiteContext)
  if (!ctx) throw new Error('useActiveSite must be used within an ActiveSiteProvider')
  return ctx
}
