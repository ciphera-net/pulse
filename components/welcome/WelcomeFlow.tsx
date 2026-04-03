'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/context'
import { listSites, type Site } from '@/lib/api/sites'
import { trackWelcomeStepView } from '@/lib/welcomeAnalytics'
import { LoadingOverlay } from '@ciphera-net/ui'
import pulseIcon from '@/public/pulse_icon_no_margins.png'
import FeatureSlideshow from '@/components/checkout/FeatureSlideshow'
import StepOrganization from './StepOrganization'
import StepAddSite from './StepAddSite'
import StepInstall from './StepInstall'

const TOTAL_STEPS = 3

function WelcomeFlowInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  const stepParam = searchParams.get('step')
  const initialStep = stepParam ? Math.min(Math.max(1, parseInt(stepParam, 10)), TOTAL_STEPS) : 1
  const [step, setStepState] = useState(initialStep)
  const [createdSite, setCreatedSite] = useState<Site | null>(null)
  const [resolving, setResolving] = useState(true)

  const setStep = useCallback((next: number) => {
    const s = Math.min(Math.max(1, next), TOTAL_STEPS)
    setStepState(s)
    const url = new URL(window.location.href)
    url.searchParams.set('step', String(s))
    window.history.replaceState({}, '', url.pathname + url.search)
  }, [])

  // Smart entry: skip steps user doesn't need
  useEffect(() => {
    if (authLoading || !user) return
    let cancelled = false

    async function resolve() {
      // No org context → must start at step 1
      if (!user!.org_id) {
        setResolving(false)
        return
      }

      // Has org — check if they also have sites
      try {
        const sites = await listSites()
        if (cancelled) return
        if (sites.length > 0) {
          // Has org + sites → skip onboarding entirely
          router.replace('/')
          return
        }
      } catch {
        // If sites fetch fails, just continue the flow
      }

      // Has org but no sites → start at step 2
      if (!cancelled) {
        setStep(2)
        setResolving(false)
      }
    }

    resolve()
    return () => { cancelled = true }
  }, [authLoading, user, router, setStep])

  // Track step views
  useEffect(() => {
    if (!resolving) trackWelcomeStepView(step)
  }, [step, resolving])

  // Handle pending checkout redirect (called after org creation/selection)
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

  if (authLoading || resolving) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" />
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left — Feature slideshow (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative h-full overflow-hidden">
        <FeatureSlideshow />
      </div>

      {/* Right — Step content (scrollable) */}
      <div className="w-full lg:w-1/2 flex flex-col h-full overflow-y-auto">
        {/* Logo on mobile only */}
        <div className="px-6 py-5 lg:hidden">
          <Link href="/" className="flex items-center gap-2 w-fit hover:opacity-80 transition-opacity">
            <Image
              src={pulseIcon}
              alt="Pulse"
              width={36}
              height={36}
              unoptimized
              className="object-contain w-8 h-8"
            />
            <span className="text-xl font-bold text-white tracking-tight">Pulse</span>
          </Link>
        </div>

        {/* Main content */}
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-12 pt-6 lg:pt-10 sm:px-6 lg:px-10">
          {/* Progress indicator */}
          <div
            className="flex justify-center gap-2 mb-10"
            role="progressbar"
            aria-valuenow={step}
            aria-valuemin={1}
            aria-valuemax={TOTAL_STEPS}
            aria-label={`Step ${step} of ${TOTAL_STEPS}`}
          >
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i + 1 <= step
                    ? 'bg-brand-orange w-8'
                    : 'bg-neutral-700 w-6'
                }`}
              />
            ))}
          </div>

          {/* Step content */}
          <div className="w-full max-w-lg">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
                >
                  <StepOrganization onComplete={handleOrgComplete} />
                </motion.div>
              )}
              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
                >
                  <StepAddSite
                    onComplete={handleSiteComplete}
                    onSkip={handleSiteSkip}
                    onBack={() => setStep(1)}
                  />
                </motion.div>
              )}
              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
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
