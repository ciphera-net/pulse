'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import { safeRedirectUrl } from '@/lib/utils/safe-redirect'
import { LoadingOverlay } from '@ciphera-net/facet'
import { cdnUrl } from '@/lib/cdn'
import { rememberReturnTarget } from '@/lib/auth/return-target'

function LoginRedirect() {
  const searchParams = useSearchParams()

  useEffect(() => {
    // 🔴 REMEMBER WHERE THEY WERE GOING, THEN START THE SIGN-IN.
    //
    // The middleware sends a cold visitor here from whatever protected route
    // they asked for, and now names that route in `returnTo`. Storing it under
    // the key the auth callback already consumes is the whole fix: the
    // mechanism existed and worked for SessionTakeover and /join, and only
    // this hop never filled it in — so an emailed dashboard link signed you in
    // and then dropped you at the front door, looking broken.
    //
    // ⚠️ VALIDATED, NOT TRUSTED. The parameter is attacker-controllable (this
    // page is public and anyone can craft the URL), so it goes through
    // safeRedirectUrl, which admits only same-origin paths. A rejected value
    // falls back to '/' — which means "no stored target", so nothing is
    // written and the callback resolves the destination itself.
    //
    // ⚠️ Absence must not CLEAR an existing target. /join and SessionTakeover
    // write the same key before sending people here.
    const wanted = searchParams.get('returnTo')
    if (wanted) {
      const safe = safeRedirectUrl(wanted)
      if (safe !== '/') {
        try {
          rememberReturnTarget(safe)
        } catch {
          // * Storage blocked — sign-in still works, the deep link is simply
          // * not resumed. Never let this stop the flow.
        }
      }
    }
    initiateOAuthFlow()
  }, [searchParams])

  return (
    <LoadingOverlay
      logoSrc={cdnUrl('/pulse_icon_no_margins.png')}
      title="Redirecting to log in..."
    />
  )
}

export default function LoginPage() {
  // useSearchParams cannot sit in a route's default export — the production
  // build refuses to render it statically without a boundary.
  return (
    <Suspense
      fallback={
        <LoadingOverlay
          logoSrc={cdnUrl('/pulse_icon_no_margins.png')}
          title="Redirecting to log in..."
        />
      }
    >
      <LoginRedirect />
    </Suspense>
  )
}
