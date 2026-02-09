'use client'

import { useEffect, useState, Suspense, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { AUTH_URL, default as apiRequest } from '@/lib/api/client'
import { exchangeAuthCode, setSessionAction } from '@/app/actions/auth'
import { authMessageFromErrorType, type AuthErrorType } from '@/lib/utils/authErrors'
import { LoadingOverlay } from '@ciphera-net/ui'

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)
  const processedRef = useRef(false)

  const runCodeExchange = useCallback(async () => {
    const code = searchParams.get('code')
    const codeVerifier = localStorage.getItem('oauth_code_verifier')
    const redirectUri = typeof window !== 'undefined' ? window.location.origin + '/auth/callback' : ''
    if (!code || !codeVerifier) return
    const result = await exchangeAuthCode(code, codeVerifier, redirectUri)
    if (result.success && result.user) {
      // * Fetch full profile (including display_name) before navigating so header shows correct name on first paint
      try {
        const fullProfile = await apiRequest<{ id: string; email: string; display_name?: string; totp_enabled: boolean; org_id?: string; role?: string }>('/auth/user/me')
        const merged = { ...fullProfile, org_id: result.user.org_id ?? fullProfile.org_id, role: result.user.role ?? fullProfile.role }
        login(merged)
      } catch {
        login(result.user)
      }
      localStorage.removeItem('oauth_state')
      localStorage.removeItem('oauth_code_verifier')
      if (localStorage.getItem('pulse_pending_checkout')) {
        router.push('/welcome')
      } else {
        router.push('/')
      }
    } else {
      setError(authMessageFromErrorType(result.error as AuthErrorType))
    }
  }, [searchParams, login, router])

  useEffect(() => {
    // * Prevent double execution (React Strict Mode or fast re-renders)
    if (processedRef.current && !isRetrying) return

    // * Check for direct token passing (from auth-frontend direct login)
    // * This flow exposes tokens in URL, kept for legacy support.
    // * Recommended: Use Authorization Code flow (below)
    const token = searchParams.get('token')
    const refreshToken = searchParams.get('refresh_token')

    if (token && refreshToken) {
      processedRef.current = true
      const handleDirectTokens = async () => {
        const result = await setSessionAction(token, refreshToken)
        if (result.success && result.user) {
          // * Fetch full profile (including display_name) before navigating so header shows correct name on first paint
          try {
            const fullProfile = await apiRequest<{ id: string; email: string; display_name?: string; totp_enabled: boolean; org_id?: string; role?: string }>('/auth/user/me')
            const merged = { ...fullProfile, org_id: result.user.org_id ?? fullProfile.org_id, role: result.user.role ?? fullProfile.role }
            login(merged)
          } catch {
            login(result.user)
          }
          if (typeof window !== 'undefined' && localStorage.getItem('pulse_pending_checkout')) {
            router.push('/welcome')
          } else {
            const raw = searchParams.get('returnTo') || '/'
            const safe = (typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')) ? raw : '/'
            router.push(safe)
          }
        } else {
          setError(authMessageFromErrorType('invalid'))
        }
      }
      handleDirectTokens()
      return
    }

    const code = searchParams.get('code')
    const state = searchParams.get('state')

    if (!code || !state) return

    const storedState = localStorage.getItem('oauth_state')
    const codeVerifier = localStorage.getItem('oauth_code_verifier')

    if (!codeVerifier) {
      setError('Missing code verifier')
      return
    }
    if (state !== storedState) {
      console.error('State mismatch', { received: state, stored: storedState })
      setError('Invalid state')
      return
    }

    processedRef.current = true
    if (isRetrying) setIsRetrying(false)
    runCodeExchange()
  }, [searchParams, login, router, isRetrying, runCodeExchange])

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
