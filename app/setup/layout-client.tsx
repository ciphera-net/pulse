'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { getUserOrganizations } from '@/lib/api/organization'
import { listSites } from '@/lib/api/sites'
import { SetupProvider, useSetup } from '@/lib/setup/context'
import SetupStepper from '@/components/setup/SetupStepper'
import { LoadingOverlay } from '@ciphera-net/ui'

function SetupGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading: authLoading } = useAuth()
  const { completedSteps } = useSetup()
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    if (authLoading || !user) return

    const guard = async () => {
      try {
        const orgs = await getUserOrganizations()
        const hasOrg = orgs.length > 0
        let hasSites = false

        if (hasOrg) {
          const sites = await listSites()
          hasSites = sites.length > 0

          // Already has org — skip past org creation
          if (pathname === '/setup/org') {
            router.replace(hasSites ? '/setup/install' : '/setup/site')
            return
          }

          // No site but on install step — skip to plan
          if (!hasSites && pathname === '/setup/install') {
            router.replace('/setup/plan')
            return
          }
        } else {
          if (pathname !== '/setup/org') {
            router.replace('/setup/org')
            return
          }
        }
      } catch {
        // API error — stay on current page
      }

      setResolved(true)
    }

    guard()
  }, [authLoading, user, pathname, router])

  if (authLoading || !resolved) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" />
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-10">
      <SetupStepper completedSteps={completedSteps} />
      <div className="w-full max-w-lg">
        {children}
      </div>
    </div>
  )
}

export default function SetupLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" />}>
      <SetupProvider>
        <SetupGuard>{children}</SetupGuard>
      </SetupProvider>
    </Suspense>
  )
}
