'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { TIMING } from '@/lib/motion'
import { useAuth } from '@/lib/auth/context'
import { type Site } from '@/lib/api/sites'
import { getUserOrganizations } from '@/lib/api/organization'
import { useSites } from '@/lib/swr/sites'
import { trackWelcomeStepView } from '@/lib/welcomeAnalytics'
import { LoadingOverlay } from '@ciphera-net/ui'
import WelcomeStepper from './WelcomeStepper'
import StepOrganization from './StepOrganization'
import StepAddSite from './StepAddSite'
import StepInstall from './StepInstall'

const TOTAL_STEPS = 3

function WelcomeFlowInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const { sites, isLoading: sitesLoading } = useSites()

  const stepParam = searchParams.get('step')
  const initialStep = stepParam ? Math.min(Math.max(1, parseInt(stepParam, 10)), TOTAL_STEPS) : 1
  const [step, setStepState] = useState(initialStep)
  const [createdSite, setCreatedSite] = useState<Site | null>(null)
  const [resolving, setResolving] = useState(true)
  const [siteDomain, setSiteDomain] = useState('')

  // Clear stale site draft on fresh welcome visit
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('pulse_welcome_site_draft')
    }
  }, [])

  // Track direction for animation (1 = forward, -1 = back)
  const directionRef = useRef(1)

  const setStep = useCallback((next: number) => {
    const s = Math.min(Math.max(1, next), TOTAL_STEPS)
    directionRef.current = s > step ? 1 : -1
    setStepState(s)
    const url = new URL(window.location.href)
    url.searchParams.set('step', String(s))
    window.history.replaceState({}, '', url.pathname + url.search)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Smart entry: skip steps user doesn't need
  useEffect(() => {
    if (authLoading || !user || sitesLoading) return

    const resolve = async () => {
      if (!user.org_id) {
        setResolving(false)
        return
      }

      try {
        const orgs = await getUserOrganizations()
        if (orgs.length === 0) {
          setResolving(false)
          return
        }
      } catch {
        setResolving(false)
        return
      }

      if (sites.length > 0) {
        router.replace('/')
        return
      }

      setStepState(2)
      setResolving(false)
    }

    resolve()
  }, [authLoading, user, sitesLoading, sites, router])

  // Track step views
  useEffect(() => {
    if (!resolving) trackWelcomeStepView(step)
  }, [step, resolving])

  const handleOrgComplete = useCallback(() => {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('pulse_pending_checkout')
      if (raw) {
        try {
          const { planId, interval, limit } = JSON.parse(raw)
          localStorage.removeItem('pulse_pending_checkout')
          router.push(`/checkout?plan=${planId}&interval=${interval || 'month'}&limit=${limit ?? 100000}`)
          return
        } catch {
          localStorage.removeItem('pulse_pending_checkout')
        }
      }
    }
    setStep(2)
  }, [router, setStep])

  const handleSiteComplete = useCallback((site: Site) => {
    setCreatedSite(site)
    setStep(3)
  }, [setStep])

  const handleSiteSkip = useCallback(() => {
    setCreatedSite(null)
    setStep(3)
  }, [setStep])

  // Only show loading on initial page load
  if (resolving && (authLoading || !user)) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" />
  }

  const direction = directionRef.current

  const stepVariants = {
    enter: (d: number) => ({ opacity: 0, y: d * 16 }),
    center: { opacity: 1, y: 0 },
    exit: (d: number) => ({ opacity: 0, y: d * -16 }),
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-10">
      {/* Step indicator */}
      <WelcomeStepper currentStep={step} onStepClick={setStep} />

      {/* Step content */}
      <div className="w-full max-w-lg">
        <AnimatePresence mode="wait" custom={direction}>
          {step === 1 && (
            <motion.div
              key="step1"
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={TIMING}
            >
              <StepOrganization onComplete={handleOrgComplete} />
            </motion.div>
          )}
          {step === 2 && (
            <motion.div
              key="step2"
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={TIMING}
            >
              <StepAddSite
                onComplete={handleSiteComplete}
                onSkip={handleSiteSkip}
                onBack={() => setStep(1)}
                onDomainChange={setSiteDomain}
              />
            </motion.div>
          )}
          {step === 3 && (
            <motion.div
              key="step3"
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={TIMING}
            >
              <StepInstall
                site={createdSite}
                onBack={() => setStep(2)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function WelcomeFlow() {
  return (
    <Suspense fallback={<LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" />}>
      <WelcomeFlowInner />
    </Suspense>
  )
}
