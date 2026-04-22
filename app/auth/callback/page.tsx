'use client'

import { useEffect, useState, Suspense, useRef, useCallback } from 'react'
import { logger } from '@/lib/utils/logger'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { AUTH_URL, default as apiRequest } from '@/lib/api/client'
import { exchangeAuthCode } from '@/app/actions/auth'
import { authMessageFromErrorType, type AuthErrorType } from '@ciphera-net/ui'
import { LoadingOverlay } from '@ciphera-net/ui'

function AuthCallbackContent() {
  const searchParams = useSearchParams()
  const { login } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)
  const processedRef = useRef(false)

  const runCodeExchange = useCallback(async () => {
    const code = searchParams.get('code')
    const codeVerifier = localStorage.getItem('oauth_code_verifier')
    const redirectUri = typeof window !== 'undefined' ? window.location.origin + '/auth/callback' : ''
    if (!code) return
    const rememberMe = searchParams.get('remember_me') !== 'false'
    let result: Awaited<ReturnType<typeof exchangeAuthCode>>
    try {
      result = await exchangeAuthCode(code, codeVerifier, redirectUri, rememberMe)
    } catch {
      // * Stale build or network error — show error so user can retry via full navigation
      setError('Something went wrong. Please try logging in again.')
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
      localStorage.removeItem('oauth_state')
      localStorage.removeItem('oauth_code_verifier')
      // * Use full-page navigation (not router.push) so the access_token cookie set
      // * by exchangeAuthCode is guaranteed committed before AuthProvider re-initializes
      // * on the destination route. Eliminates the post-login SWR race where useSites()
      // * fires before cookies are observable and caches an empty/401 result for 30s.
      const storedReturn = localStorage.getItem('pulse_auth_return_to')
      if (storedReturn) {
        localStorage.removeItem('pulse_auth_return_to')
        const safe = (typeof storedReturn === 'string' && storedReturn.startsWith('/') && !storedReturn.startsWith('//')) ? storedReturn : '/'
        window.location.assign(safe)
      } else {
        const raw = searchParams.get('returnTo') || '/'
        const safe = (typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')) ? raw : '/'
        window.location.assign(safe)
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
      setError(authMessageFromErrorType(result.error as AuthErrorType))
    }
  }, [searchParams, login])

  useEffect(() => {
    if (processedRef.current && !isRetrying) return

    const code = searchParams.get('code')
    if (!code) return

    const state = searchParams.get('state')
    const storedState = localStorage.getItem('oauth_state')
    const codeVerifier = localStorage.getItem('oauth_code_verifier')

    // * Session flow (from auth hub): redirect has code but no state. Clear stale PKCE
    // * data from any previous app-initiated OAuth so exchange proceeds without validation.
    if (!state) {
      localStorage.removeItem('oauth_state')
      localStorage.removeItem('oauth_code_verifier')
    } else {
      // * Full OAuth flow (app-initiated): validate state + use PKCE
      const isFullOAuth = !!storedState && !!codeVerifier
      if (isFullOAuth && state !== storedState) {
        logger.error('State mismatch', { received: state, stored: storedState })
        setError('Invalid state')
        return
      }
    }

    processedRef.current = true
    if (isRetrying) setIsRetrying(false)
    runCodeExchange()
  }, [searchParams, login, isRetrying, runCodeExchange])

  const handleRetry = () => {
    setError(null)
    processedRef.current = false
    setIsRetrying(true)
  }

  if (error) {
    const isNetworkError = error.includes('Network error')
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4 text-red-500">
          {error}
          <div className="mt-4 flex flex-col gap-2">
            {isNetworkError && (
              <button type="button" onClick={handleRetry} className="text-sm underline text-left">
                Try again
              </button>
            )}
            <button
              type="button"
              onClick={() => { window.location.href = `${AUTH_URL}/login` }}
              className="text-sm underline text-left"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  // * Use standard Pulse loading screen to make transition to Home seamless
  return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" portal={false} />
}

export default function AuthCallback() {
  return (
    <Suspense fallback={<LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" portal={false} />}>
      <AuthCallbackContent />
    </Suspense>
  )
}
