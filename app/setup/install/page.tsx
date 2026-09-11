'use client'

import { useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSetup } from '@/lib/setup/context'
import { preservePlanParams } from '@/lib/setup/utils'
import { SETUP_COPY } from '@/lib/setup/copy'
import { verifySite } from '@/lib/api/sites'
import { useSites } from '@/lib/swr/sites'
import { Button, Spinner } from '@ciphera-net/facet'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'
import InstallStateBlock from '@/components/setup/InstallStateBlock'
import SiteChip from '@/components/setup/SiteChip'

export default function SetupInstallPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { site, pendingPlan, completeStep } = useSetup()
  const { isLoading: sitesLoading } = useSites()

  // 🔴 CONTINUE GOES TO DONE, NOT TO A PRICING PAGE (11-09-2026). Step 4 of
  // the old ladder was /setup/plan — a full pricing page shown to somebody who
  // had not yet seen a single chart. Two of two external signups reached it
  // and left. The plan step is out of the forward path.
  //
  // 🔑 THE ONE EXCEPTION IS INTENT THE PERSON BROUGHT WITH THEM. Somebody who
  // clicked a plan on the pricing page and THEN signed up carries it through
  // the wizard as `pendingPlan` (preservePlanParams threads ?plan=&interval=
  // &limit= from /setup/org onward, and the context validates it against the
  // catalog). For them, checkout is what they came for, so Continue still
  // finishes there. Cutting this edge unconditionally would land a buyer on
  // /setup/done and never ask them to pay.
  const handleContinue = () => {
    completeStep('install')
    router.push(pendingPlan ? `/setup/plan${preservePlanParams(searchParams)}` : '/setup/done')
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
      {/* Direction B (owner pick, 11-09-2026): one big centred heading, one
          line under it, and the person's own site as a chip — so the step is
          visibly about THEIR site and no heading has to repeat the domain.
          The icon tile above the heading is gone: tinted panels are the
          retired device, and colour here lives in the rail and the button. */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          {SETUP_COPY.install.heading}
        </h1>
        <p className="mt-3 text-sm text-neutral-400 max-w-md mx-auto">
          {site ? SETUP_COPY.install.dek : 'Each site gets its own snippet once it exists.'}
        </p>
        {site && (
          <div className="mt-4 flex justify-center">
            <SiteChip domain={site.domain} name={site.name} />
          </div>
        )}
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
          "Verify installation" — pressing "Continue" gave no feedback at all. */}
      {site && (
        <InstallStateBlock siteId={site.id} domain={site.domain} onFirstEvent={markVerified} />
      )}

      {/* ONE forward control. There is no separate "Skip for now" any more:
          it existed to bypass a pricing step that is no longer on the path,
          and it wrote nothing server-side — a door that was not a door
          (measured on Pulse's first external signup). Leaving is free
          because Continue leads to the dashboard, and the dek says so. */}
      {site && (
        <Button onClick={handleContinue} className="w-full h-11 md:h-9">
          {pendingPlan ? SETUP_COPY.installContinueToCheckout : SETUP_COPY.installContinue}
        </Button>
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
    </>
  )
}
