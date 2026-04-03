'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { type Site } from '@/lib/api/sites'
import { verifySite } from '@/lib/api/sites'
import { getRealtime } from '@/lib/api/stats'
import { trackWelcomeCompleted } from '@/lib/welcomeAnalytics'
import { Button, Spinner } from '@ciphera-net/ui'
import { ArrowLeftIcon, CheckCircleIcon, AlertTriangleIcon } from '@ciphera-net/ui'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'

const WELCOME_COMPLETED_KEY = 'pulse_welcome_completed'

type VerificationState = 'idle' | 'checking' | 'success' | 'timeout'

interface StepInstallProps {
  site: Site | null
  onBack: () => void
}

export default function StepInstall({ site, onBack }: StepInstallProps) {
  const router = useRouter()
  const [verifyState, setVerifyState] = useState<VerificationState>('idle')
  const cancelledRef = useRef(false)

  const goToDashboard = () => {
    if (typeof window !== 'undefined') localStorage.setItem(WELCOME_COMPLETED_KEY, 'true')
    trackWelcomeCompleted(!!site)
    router.push('/')
  }

  const goToSite = () => {
    if (!site) return
    if (typeof window !== 'undefined') localStorage.setItem(WELCOME_COMPLETED_KEY, 'true')
    trackWelcomeCompleted(true)
    router.push(`/sites/${site.id}`)
  }

  const cancelVerification = useCallback(() => {
    cancelledRef.current = true
    setVerifyState('idle')
  }, [])

  const startVerification = useCallback(async () => {
    if (!site) return

    cancelledRef.current = false
    setVerifyState('checking')

    const maxAttempts = 15
    const interval = 2000

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (cancelledRef.current) return

      try {
        const data = await getRealtime(site.id)

        if (cancelledRef.current) return

        if (data && data.visitors > 0) {
          await verifySite(site.id)
          setVerifyState('success')
          return
        }
      } catch {
        // endpoint threw — no data yet, keep polling
      }

      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, interval))
      }
    }

    if (!cancelledRef.current) {
      setVerifyState('timeout')
    }
  }, [site])

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-300 mb-8 transition-colors"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back
      </button>

      <div className="text-center mb-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 mb-5">
          <CheckCircleIcon className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          {site ? 'Install the tracking script' : "You're all set"}
        </h1>
        <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
          {site
            ? `Add this snippet to "${site.name}" to start collecting data.`
            : 'Head to your dashboard to add sites and start tracking.'}
        </p>
      </div>

      {site && (
        <>
          <div className="mb-6">
            <ScriptSetupBlock
              site={{ domain: site.domain, name: site.name }}
              showFrameworkPicker
            />
          </div>

          <div className="flex items-center justify-center gap-2 mb-8">
            {verifyState === 'idle' && (
              <>
                <button
                  type="button"
                  onClick={startVerification}
                  className="text-sm font-medium text-brand-orange hover:text-brand-orange/80 transition-colors"
                >
                  Verify installation
                </button>
                <span className="text-xs text-neutral-500">— Check if your site is sending data</span>
              </>
            )}

            {verifyState === 'checking' && (
              <div className="flex items-center gap-2.5 animate-in fade-in duration-200">
                <Spinner size="sm" />
                <span className="text-sm text-neutral-300">Checking for data...</span>
                <button
                  type="button"
                  onClick={cancelVerification}
                  className="text-xs text-neutral-500 hover:text-neutral-400 transition-colors ml-1"
                >
                  Cancel
                </button>
              </div>
            )}

            {verifyState === 'success' && (
              <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-300">
                <CheckCircleIcon className="h-4.5 w-4.5 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-400">Your site is sending data!</span>
              </div>
            )}

            {verifyState === 'timeout' && (
              <div className="flex items-center gap-2 animate-in fade-in duration-200">
                <AlertTriangleIcon className="h-4.5 w-4.5 text-orange-400 flex-shrink-0" />
                <span className="text-sm text-orange-400">
                  No data detected yet. Make sure the script is installed and visit your site.
                </span>
                <button
                  type="button"
                  onClick={startVerification}
                  className="text-xs font-medium text-brand-orange hover:text-brand-orange/80 transition-colors ml-1 flex-shrink-0"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button variant="primary" onClick={goToDashboard} className="min-w-40">
          Go to dashboard
        </Button>
        {site && (
          <Button variant="secondary" onClick={goToSite} className="min-w-40">
            View {site.name}
          </Button>
        )}
      </div>
    </>
  )
}
