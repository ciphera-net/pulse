'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { type Site } from '@/lib/api/sites'

interface PendingPlan {
  planId: string
  interval: string
  limit: number
}

type SetupStep = 'org' | 'site' | 'install' | 'plan' | 'done'

interface SetupContextType {
  orgId: string | null
  orgName: string | null
  setOrg: (id: string, name: string) => void
  site: Site | null
  setSite: (site: Site) => void
  pendingPlan: PendingPlan | null
  completedSteps: Set<SetupStep>
  completeStep: (step: SetupStep) => void
}

const SetupContext = createContext<SetupContextType | null>(null)

export function SetupProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgName, setOrgName] = useState<string | null>(null)
  const [site, setSiteState] = useState<Site | null>(null)
  const [completedSteps, setCompletedSteps] = useState<Set<SetupStep>>(new Set())

  const [pendingPlan] = useState<PendingPlan | null>(() => {
    const planId = searchParams.get('plan')
    const interval = searchParams.get('interval')
    const limit = searchParams.get('limit')
    if (planId && interval && limit) {
      return { planId, interval, limit: Number(limit) }
    }
    return null
  })

  const setOrg = useCallback((id: string, name: string) => {
    setOrgId(id)
    setOrgName(name)
  }, [])

  const setSite = useCallback((s: Site) => {
    setSiteState(s)
  }, [])

  const completeStep = useCallback((step: SetupStep) => {
    setCompletedSteps(prev => new Set(prev).add(step))
  }, [])

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
