'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { getUserOrganizations } from '@/lib/api/organization'
import { listSites } from '@/lib/api/sites'
import { SetupProvider, useSetup } from '@/lib/setup/context'
import SetupStepper from '@/components/setup/SetupStepper'
import { trackWelcomeStepView } from '@/lib/welcomeAnalytics'
import { LoadingOverlay } from '@ciphera-net/facet'
import { cdnUrl } from '@/lib/cdn'

// Funnel step numbers per /setup segment. Fixed per page — the guard can
// route around steps (site-skip lands on plan, an existing site skips org),
// so these are identities, not a strict order. Numbering MATCHES the stepper
// (org→site→install→plan→done): it used to emit plan=3/install=4 while the
// stepper showed install=③/plan=④, so /setup/plan told the user "Step 4"
// while recording step 3 and every funnel drop-off read one step early.
// (Analytics note, 25-08-2026: welcome_step_view rows before this date carry
// the OLD numbering for steps 3/4.)
const SETUP_STEPS: Record<string, number> = {
  '/setup/org': 1,
  '/setup/site': 2,
  '/setup/install': 3,
  '/setup/plan': 4,
  '/setup/done': 5,
}

function SetupGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const { completedSteps } = useSetup()
  const [resolved, setResolved] = useState(false)
  const isNewOrg = searchParams.get('new') === '1'

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

          // Already has org — skip past org creation (unless creating a new one)
          if (pathname === '/setup/org' && !isNewOrg) {
            router.replace(hasSites ? '/setup/install' : '/setup/site')
            return
          }

          // best-way-B hard gate: a workspace cannot finish setup without a
          // site. Any step that requires one — install, or the terminal
          // /setup/done — reached without a site returns to /setup/site, the
          // one place a site is created. /setup/plan is deliberately NOT gated:
          // a purchase before a site exists is legitimate, and /setup/done then
          // catches the completion. This replaces the old redirect that routed
          // a site-less user AROUND install to /setup/plan (further from a site).
          if (!hasSites && (pathname === '/setup/install' || pathname === '/setup/done')) {
            router.replace('/setup/site')
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

  // Step views only AFTER the guard resolves: an arrival it redirects away
  // (e.g. /setup/org with an existing org) was never shown and must not count.
  useEffect(() => {
    if (!resolved) return
    const step = SETUP_STEPS[pathname]
    if (step) trackWelcomeStepView(step, pathname.replace('/setup/', ''))
  }, [resolved, pathname])

  if (authLoading || !resolved) {
    return <LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Pulse" />
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
    <Suspense fallback={<LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Pulse" />}>
      <SetupProvider>
        <SetupGuard>{children}</SetupGuard>
      </SetupProvider>
    </Suspense>
  )
}
