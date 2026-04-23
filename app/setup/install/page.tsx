'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSetup } from '@/lib/setup/context'
import { preservePlanParams } from '@/lib/setup/utils'
import { verifySite } from '@/lib/api/sites'
import { getRealtime } from '@/lib/api/stats'
import { Button, Spinner, CheckCircleIcon } from '@ciphera-net/ui'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'

type VerificationState = 'idle' | 'checking' | 'success' | 'timeout'

export default function SetupInstallPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { site, completeStep } = useSetup()
  const [verifyState, setVerifyState] = useState<VerificationState>('idle')
  const cancelledRef = useRef(false)

  const handleContinue = () => {
    completeStep('install')
    router.push(`/setup/plan${preservePlanParams(searchParams)}`)
  }

  const startVerification = useCallback(async () => {
    if (!site) return
    cancelledRef.current = false
    setVerifyState('checking')

    for (let attempt = 0; attempt < 15; attempt++) {
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
        // no data yet
      }

      if (attempt < 14) {
        await new Promise((r) => setTimeout(r, 2000))
      }
    }

    if (!cancelledRef.current) setVerifyState('timeout')
  }, [site])

  const cancelVerification = useCallback(() => {
    cancelledRef.current = true
    setVerifyState('idle')
  }, [])

  return (
    <>
      <div className="text-center mb-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 mb-5">
          <CheckCircleIcon className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Install the tracking script
        </h1>
        <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
          {site
            ? `Add this snippet to "${site.name}" to start collecting data.`
            : 'Add the Pulse snippet to your site.'}
        </p>
      </div>

      {site && (
        <div className="mb-6">
          <ScriptSetupBlock site={site} />
        </div>
      )}

      {verifyState === 'idle' && site && (
        <div className="flex gap-3">
          <Button onClick={startVerification} variant="secondary" className="flex-1">
            Verify installation
          </Button>
          <Button onClick={handleContinue} className="flex-1">
            Continue
          </Button>
        </div>
      )}

      {verifyState === 'checking' && (
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-neutral-400">
            <Spinner size="sm" />
            <span className="text-sm">Listening for the first pageview...</span>
          </div>
          <button type="button" onClick={cancelVerification} className="text-xs text-neutral-600 hover:text-neutral-400">
            Cancel
          </button>
        </div>
      )}

      {verifyState === 'success' && (
        <div className="text-center space-y-4">
          <p className="text-sm text-emerald-400 font-medium">Script verified — data is flowing!</p>
          <Button onClick={handleContinue} className="w-full">Continue</Button>
        </div>
      )}

      {verifyState === 'timeout' && (
        <div className="text-center space-y-4">
          <p className="text-sm text-neutral-400">
            No data received yet. You can continue and check back later.
          </p>
          <div className="flex gap-3">
            <Button onClick={startVerification} variant="secondary" className="flex-1">
              Try again
            </Button>
            <Button onClick={handleContinue} className="flex-1">
              Continue anyway
            </Button>
          </div>
        </div>
      )}

      {!site && (
        <Button onClick={handleContinue} className="w-full">
          Continue
        </Button>
      )}

      <button
        type="button"
        onClick={handleContinue}
        className="mt-4 w-full text-center text-sm text-neutral-500 hover:text-neutral-400 transition-colors"
      >
        Skip for now
      </button>
    </>
  )
}
