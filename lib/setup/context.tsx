'use client'

import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { useSites } from '@/lib/swr/sites'
import { type Site } from '@/lib/api/sites'
import { PLAN_CATALOG, TRAFFIC_TIERS } from '@/lib/plans'

interface PendingPlan {
  planId: string
  interval: string
  limit: number
}

export type SetupStep = 'org' | 'site' | 'install' | 'plan' | 'done'

interface SetupContextType {
  orgId: string | null
  orgName: string | null
  setOrg: (id: string, name: string) => void
  site: Site | null
  setSite: (site: Site) => void
  pendingPlan: PendingPlan | null
  /** Steps that are DONE — the union of what this session did and what the
   *  server says already exists. See the provider comment. */
  completedSteps: Set<SetupStep>
  completeStep: (step: SetupStep) => void
}

const SetupContext = createContext<SetupContextType | null>(null)

export function SetupProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { sites } = useSites()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgName, setOrgName] = useState<string | null>(null)
  const [site, setSiteState] = useState<Site | null>(null)
  const [sessionSteps, setSessionSteps] = useState<Set<SetupStep>>(new Set())

  // Rehydrate the session's site from server truth. Context state is per-tab:
  // a hard refresh on /setup/install used to lose the just-created site and
  // render the "no site is attached" dead end, whose escape button looped
  // straight back to the same screen (the guard saw hasSites and routed to
  // install; nothing ever re-adopted the site). The newest site is the one
  // this wizard is onboarding.
  useEffect(() => {
    if (site || sites.length === 0) return
    const newest = [...sites].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    setSiteState(newest)
  }, [site, sites])

  const [pendingPlan] = useState<PendingPlan | null>(() => {
    const planId = searchParams.get('plan')
    const interval = searchParams.get('interval')
    const limit = searchParams.get('limit')
    if (!planId || !interval || !limit) return null
    // These are USER-EDITABLE URL params. Unvalidated, ?plan=bogus&limit=7
    // rendered a submittable checkout for "Bogus" at €0.00 with the slider
    // showing a different tier than would be submitted. Anything off-catalog
    // is treated as absent, not honored.
    const parsedLimit = Number(limit)
    if (
      !PLAN_CATALOG.some((p) => p.id === planId) ||
      (interval !== 'month' && interval !== 'year') ||
      !TRAFFIC_TIERS.some((t) => t.value === parsedLimit)
    ) {
      return null
    }
    return { planId, interval, limit: parsedLimit }
  })

  const setOrg = useCallback((id: string, name: string) => {
    setOrgId(id)
    setOrgName(name)
  }, [])

  const setSite = useCallback((s: Site) => {
    setSiteState(s)
  }, [])

  const completeStep = useCallback((step: SetupStep) => {
    setSessionSteps(prev => new Set(prev).add(step))
  }, [])

  // The stepper reads TRUTH, not session memory. `sessionSteps` alone made a
  // fresh session show "Create workspace ①" undone on an org that exists, and
  // survives only until a refresh. Server-derivable steps (the org exists, a
  // site exists, a script has reported) come from server state; the wizard's
  // own vocabulary (plan chosen, done reached) stays session-local because the
  // server has no per-step record of those.
  const completedSteps = useMemo(() => {
    const merged = new Set(sessionSteps)
    if (user?.org_id) merged.add('org')
    if (sites.length > 0) {
      merged.add('site')
      if (sites.some(s => s.install_status && s.install_status !== 'never_installed')) {
        merged.add('install')
      }
    }
    return merged
  }, [sessionSteps, user?.org_id, sites])

  return (
    <SetupContext.Provider value={{
      orgId, orgName, setOrg,
      site, setSite,
      pendingPlan,
      completedSteps, completeStep,
    }}>
      {children}
    </SetupContext.Provider>
  )
}

export function useSetup() {
  const ctx = useContext(SetupContext)
  if (!ctx) throw new Error('useSetup must be used within SetupProvider')
  return ctx
}
