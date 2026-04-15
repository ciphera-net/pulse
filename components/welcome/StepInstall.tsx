'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { type Site } from '@/lib/api/sites'
import { verifySite } from '@/lib/api/sites'
import { getRealtime } from '@/lib/api/stats'
import { trackWelcomeCompleted } from '@/lib/welcomeAnalytics'
import { Button, Spinner } from '@ciphera-net/ui'
import { CheckCircleIcon, AlertTriangleIcon } from '@ciphera-net/ui'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'

const WELCOME_COMPLETED_KEY = 'pulse_welcome_completed'

type VerificationState = 'idle' | 'checking' | 'success' | 'timeout'

interface StepInstallProps {
  site: Site | null
  onBack: () => void
}

export default function StepInstall({ site }: StepInstallProps) {
  const router = useRouter()
  const [verifyState, setVerifyState] = useState<VerificationState>('idle')
  const cancelledRef = useRef(false)

  const finish = (path: string) => {
    if (typeof window !== 'undefined') localStorage.setItem(WELCOME_COMPLETED_KEY, 'true')
    trackWelcomeCompleted(!!site)
    router.push(path)
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
                  className="text-sm font-medium text-brand-orange hover:text-brand-orange/80 transition-colors ease-apple"
                >
                  Verify installation
                </button>
                <span className="text-xs text-neutral-500">— Check if your site is sending data</span>
              </>
            )}

            {verifyState === 'checking' && (
              <div className="flex items-center gap-2.5 animate-in fade-in duration-base">
                <Spinner size="sm" />
                <span className="text-sm text-neutral-300">Checking for data...</span>
                <button
                  type="button"
                  onClick={cancelVerification}
                  className="text-xs text-neutral-500 hover:text-neutral-400 transition-colors ml-1 ease-apple"
                >
                  Cancel
                </button>
              </div>
            )}

            {verifyState === 'success' && (
              <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-slow">
                <CheckCircleIcon className="h-4.5 w-4.5 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-400">Your site is sending data!</span>
              </div>
            )}

            {verifyState === 'timeout' && (
              <div className="flex items-center gap-2 animate-in fade-in duration-base">
                <AlertTriangleIcon className="h-4.5 w-4.5 text-orange-400 flex-shrink-0" />
                <span className="text-sm text-orange-400">
                  No data detected yet. Make sure the script is installed and visit your site.
                </span>
                <button
                  type="button"
                  onClick={startVerification}
                  className="text-xs font-medium text-brand-orange hover:text-brand-orange/80 transition-colors ml-1 flex-shrink-0 ease-apple"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex justify-center">
        <Button
          variant="primary"
          onClick={() => finish(site ? `/sites/${site.id}` : '/')}
          className="min-w-48"
        >
          {site ? `View ${site.name}` : 'Go to dashboard'}
        </Button>
      </div>
    </>
  )
}
