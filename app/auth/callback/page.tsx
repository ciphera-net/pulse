'use client'

import { useEffect, useState, Suspense, useRef, useCallback } from 'react'
import { logger } from '@/lib/utils/logger'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import apiRequest from '@/lib/api/client'
import { exchangeAuthCode } from '@/app/actions/auth'
import { AuthErrorState, LoadingOverlay, type AuthErrorType } from '@ciphera-net/facet'
import { safeRedirectUrl } from '@/lib/utils/safe-redirect'
import { claimPendingAuth, forgetAllPendingAuth } from '@/lib/api/oauth-store'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import { cdnUrl } from '@/lib/cdn'

function AuthCallbackContent() {
  const searchParams = useSearchParams()
  const { login } = useAuth()
  // * A typed error, not a message string. The surface picks its copy and its
  // * controls from the type; nothing downstream inspects message text.
  const [error, setError] = useState<AuthErrorType | null>(null)
  const [restarting, setRestarting] = useState(false)
  const processedRef = useRef(false)
  // * The verifier claimed for this callback. Held so a retry can re-run the
  // * exchange without re-claiming an entry that has already been consumed.
  const verifierRef = useRef<string | null>(null)

  const runCodeExchange = useCallback(
    async (codeVerifier: string | null) => {
      const code = searchParams.get('code')
      const redirectUri = typeof window !== 'undefined' ? window.location.origin + '/auth/callback' : ''
      if (!code) return
      let result: Awaited<ReturnType<typeof exchangeAuthCode>>
      try {
        result = await exchangeAuthCode(code, codeVerifier, redirectUri)
      } catch {
        // * Stale build or network error — retryable via a full navigation.
        setError('network')
        return
      }
      if (result.success && result.user) {
        // * Vault PII is read from .ciphera.net cookie by login() in auth context.
        // * Just fetch full profile and call login — the cookie merge happens automatically.
        try {
          const fullProfile = await apiRequest<{ id: string; email: string; display_name?: string; totp_enabled: boolean; org_id?: string; role?: string }>('/auth/user/me')
          login({
            ...fullProfile,
            org_id: result.user.org_id ?? fullProfile.org_id,
            role: result.user.role ?? fullProfile.role,
          })
        } catch {
          login(result.user)
        }
        // * Signed in — every other attempt still on this device is abandoned.
        forgetAllPendingAuth()
        // * Use full-page navigation (not router.push) so the access_token cookie set
        // * by exchangeAuthCode is guaranteed committed before AuthProvider re-initializes
        // * on the destination route. Eliminates the post-login SWR race where useSites()
        // * fires before cookies are observable and caches an empty/401 result for 30s.
        const storedReturn = localStorage.getItem('pulse_auth_return_to')
        if (storedReturn) {
          localStorage.removeItem('pulse_auth_return_to')
          window.location.assign(safeRedirectUrl(storedReturn))
        } else {
          window.location.assign(safeRedirectUrl(searchParams.get('returnTo')))
        }
      } else {
        if (result.error === 'server') {
          // * The exchange likely succeeded server-side (code was consumed) but the
          // * server action response failed to reach the browser (cold start, network).
          // * Try navigating to home — if cookies were set, user lands on dashboard.
          // * If not, the home page redirects to login naturally.
          const returnTo = searchParams.get('returnTo') || '/'
          const safe = (typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')) ? returnTo : '/'
          window.location.href = safe
          return
        }
        setError(result.error as AuthErrorType)
      }
    },
    [searchParams, login]
  )

  useEffect(() => {
    if (processedRef.current) return

    const code = searchParams.get('code')
    if (!code) {
      // * No code param (stale link, prefetch, or a direct visit) — without an
      // * error the loading overlay would spin forever.
      processedRef.current = true
      setError('stale_attempt')
      return
    }

    const state = searchParams.get('state')
    let codeVerifier: string | null = null

    if (state) {
      // * Full OAuth flow (app-initiated). The entry is looked up by the state the
      // * authorization server echoed back, so a concurrent attempt started in
      // * another tab resolves against its own entry instead of clobbering this one.
      const pending = claimPendingAuth(state)
      if (!pending) {
        // * Unknown, forged, expired or already-claimed state. This is a real
        // * error: never fall through to an unvalidated exchange.
        logger.error('No pending sign-in attempt for the returned state')
        processedRef.current = true
        setError('stale_attempt')
        return
      }
      codeVerifier = pending.verifier
    }
    // * Session flow (from the ID auth hub): the redirect carries a code but no
    // * state, and no PKCE verifier is sent. Pending attempts are left alone —
    // * another tab may still be mid-flow and owns its own entry.

    verifierRef.current = codeVerifier
    processedRef.current = true
    runCodeExchange(codeVerifier)
  }, [searchParams, runCodeExchange])

  const handleRetry = useCallback(() => {
    setError(null)
    // * Re-run the exchange with the verifier already claimed for this callback.
    runCodeExchange(verifierRef.current)
  }, [runCodeExchange])

  // * The recovery action that actually repairs a broken sign-in: drop the
  // * abandoned attempts and start a fresh, fully-formed authorization request.
  // * Linking at a bare ID login URL would omit client_id, redirect_uri, state
  // * and the PKCE challenge, landing the person somewhere that cannot sign in.
  const handleRestart = useCallback(() => {
    setRestarting(true)
    forgetAllPendingAuth()
    initiateOAuthFlow()
  }, [])

  if (error) {
    return (
      <AuthErrorState
        type={error}
        primaryAction={{ label: 'Start sign-in again', onClick: handleRestart }}
        secondaryAction={{ label: 'Back to the homepage', onClick: () => window.location.assign('/') }}
        onRetry={handleRetry}
        busy={restarting}
      />
    )
  }

  // * Use standard Pulse loading screen to make transition to Home seamless
  return <LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Pulse" portal={false} />
}

export default function AuthCallback() {
  return (
    <Suspense fallback={<LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Pulse" portal={false} />}>
      <AuthCallbackContent />
    </Suspense>
  )
}
