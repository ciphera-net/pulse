'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useSites } from '@/lib/swr/sites'
import type { Site } from '@/lib/api/sites'

/**
 * ActiveSite context — the single owner of "which site are we configuring".
 *
 * Consolidates the per-tab site-picker logic that used to live in
 * `app/settings/site/[tab]/page.tsx`: it fetches the sites list once, resolves
 * the active site (a valid sessionStorage-stored id, else the first site), and
 * persists the selection. Both the shell's Site context band (the switcher) and
 * the site route page (which passes `siteId` to the tab) read from here, so
 * there is one selection and one fetch across the whole settings surface.
 */
const ACTIVE_SITE_KEY = 'pulse_active_site'

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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // The resolve effect must not run before hydration: on the first pass both
  // effects fire in one batch, and resolving against the pre-hydration null
  // stomped the stored/deep-linked selection with the first site (this is why
  // settings always opened on the org's first site after a fresh mount).
  const [hydrated, setHydrated] = useState(false)

  // Hydrate the selection on the client (kept out of the initial render so
  // server and first client render agree — no hydration mismatch). A ?siteId=
  // deep link (the site sidebar's Settings entry carries the current site)
  // outranks the stored selection — read once at mount via window.location so
  // in-settings switching afterwards is never fought, and no useSearchParams
  // Suspense boundary is needed. Validity is enforced by the resolve effect
  // below (an unknown id falls back to the first site).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const param = new URLSearchParams(window.location.search).get('siteId')
    if (param) {
      setSelectedId(param)
      sessionStorage.setItem(ACTIVE_SITE_KEY, param)
    } else {
      const stored = sessionStorage.getItem(ACTIVE_SITE_KEY)
      if (stored) setSelectedId(stored)
    }
    setHydrated(true)
  }, [])

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
    if (typeof window !== 'undefined') sessionStorage.setItem(ACTIVE_SITE_KEY, id)
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
