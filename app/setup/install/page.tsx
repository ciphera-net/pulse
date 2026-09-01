'use client'

import { useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSetup } from '@/lib/setup/context'
import { preservePlanParams } from '@/lib/setup/utils'
import { verifySite } from '@/lib/api/sites'
import { useSites } from '@/lib/swr/sites'
import { Button, CheckCircleIcon, GlobeIcon, Spinner } from '@ciphera-net/facet'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'
import InstallStateBlock from '@/components/setup/InstallStateBlock'
import { trackWelcomeInstallSkipped } from '@/lib/welcomeAnalytics'

export default function SetupInstallPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { site, completeStep } = useSetup()
  const { isLoading: sitesLoading } = useSites()

  const handleContinue = () => {
    completeStep('install')
    router.push(`/setup/plan${preservePlanParams(searchParams)}`)
  }

  // An observed event IS the verification a human used to give by pressing
  // "Verify installation", so the flag flips itself the moment the server
  // reports the site reporting. `is_verified` still drives the settings
  // status chip and the integrations gate, so it must keep being set — it
  // just should not depend on someone noticing a button.
  const verifiedRef = useRef(false)
  const markVerified = useCallback(() => {
    if (!site || verifiedRef.current) return
    verifiedRef.current = true
    void verifySite(site.id).catch(() => {
      // Non-fatal: the install state is already correct on screen, and the
      // flag is re-derivable. Never block the wizard on it.
      verifiedRef.current = false
    })
  }, [site])

  // Context rehydrates `site` from GET /sites; until that fetch lands we
  // don't know whether a site exists, and flashing the "no site is attached"
  // notice at someone whose site is about to appear reads as data loss.
  if (!site && sitesLoading) {
    return (
      <div className="py-16 text-center">
        <Spinner className="mx-auto" />
      </div>
    )
  }

  return (
    <>
      <div className="text-center mb-8">
        {/* success check only when a site actually exists; the no-site state
            showed a green check over "no site is attached" copy */}
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-none mb-5 ${
          site ? 'bg-emerald-500/10 text-emerald-400' : 'bg-neutral-800 text-neutral-400'
        }`}>
          {site ? <CheckCircleIcon className="h-7 w-7" /> : <GlobeIcon className="h-7 w-7" />}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Install the tracking script
        </h1>
        <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
          {site
            ? `Add this snippet to "${site.name}" to start collecting data.`
            : 'Each site gets its own snippet once it exists.'}
        </p>
      </div>

      {site && (
        <div className="mb-6">
          {/* `siteId` is deliberately NOT passed: ScriptSetupBlock mounts its
              own InstallVerify panel when it gets one, and this page states
              the install state itself, below. Passing it here would put two
              live status panels on one screen. */}
          <ScriptSetupBlock site={site} />
        </div>
      )}

      {/* The install state, from the server's own install status. This page
          used to poll /realtime 15x2s, but only if the reader pressed
          "Verify installation" — pressing "Continue" or "Skip for now" gave
          no feedback at all. */}
      {site && (
        <InstallStateBlock siteId={site.id} domain={site.domain} onFirstEvent={markVerified} />
      )}

      {site && (
        <div className="flex gap-3">
          <Button onClick={handleContinue} className="flex-1 h-11 md:h-9">
            Continue
          </Button>
        </div>
      )}

      {!site && (
        /* * The heading promises a snippet — when no site is attached to this
         * setup session there is none to show, so say that instead of a
         * silent empty gap above a bare Continue button. */
        <div className="space-y-3">
          <div className="p-4 border border-neutral-800 bg-neutral-900 rounded-none text-center">
            <p className="text-sm text-neutral-400">
              No site is attached to this setup session, so there&apos;s no snippet to
              show yet. Create your site first and the snippet will appear here.
            </p>
          </div>
          {/* Direct hop — the old '/setup' target took three redirects to end
              up on the site step anyway. */}
          <Button onClick={() => router.push('/setup/site')} variant="secondary" className="w-full h-11 md:h-9">
            Back to site setup
          </Button>
          <Button onClick={handleContinue} className="w-full h-11 md:h-9">
            Continue anyway
          </Button>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          trackWelcomeInstallSkipped()
          handleContinue()
        }}
        className="mt-4 w-full min-h-11 md:min-h-0 text-center text-sm text-neutral-500 hover:text-neutral-400 transition-colors"
      >
        Skip for now
      </button>
    </>
  )
}
