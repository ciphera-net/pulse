'use client'

import { useEffect, useState, Suspense, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { AUTH_URL } from '@/lib/api/client'
import { exchangeAuthCode, setSessionAction } from '@/app/actions/auth'
import { LoadingOverlay } from '@ciphera-net/ui'

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const processedRef = useRef(false)

  useEffect(() => {
    // * Prevent double execution (React Strict Mode or fast re-renders)
    if (processedRef.current) return
    
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
                login(result.user)
                const returnTo = searchParams.get('returnTo') || '/'
                router.push(returnTo)
            } else {
                setError('Invalid token received')
            }
        }
        handleDirectTokens()
        return
    }

    const code = searchParams.get('code')
    const state = searchParams.get('state')
    
    // * Skip if params are missing (might be initial render before params are ready)
    if (!code || !state) return

    processedRef.current = true

    const storedState = localStorage.getItem('oauth_state')
    const codeVerifier = localStorage.getItem('oauth_code_verifier')

    if (!code || !state) {
      setError('Missing code or state')
      return
    }

    if (state !== storedState) {
        console.error('State mismatch', { received: state, stored: storedState })
        setError('Invalid state')
        return
    }

    if (!codeVerifier) {
        setError('Missing code verifier')
        return
    }

    const exchangeCode = async () => {
      try {
        const redirectUri = window.location.origin + '/auth/callback'
        const result = await exchangeAuthCode(code, codeVerifier, redirectUri)

        if (!result.success || !result.user) {
            throw new Error(result.error || 'Failed to exchange token')
        }
        
        login(result.user)
        
        // * Cleanup
        localStorage.removeItem('oauth_state')
        localStorage.removeItem('oauth_code_verifier')
        
        // * Check for pending checkout
        if (localStorage.getItem('pulse_pending_checkout')) {
            router.push('/pricing')
        } else {
            router.push('/')
        }
      } catch (err: any) {
        setError(err.message)
      }
    }

    exchangeCode()
  }, [searchParams, login, router])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4 text-red-500">
          Error: {error}
          <div className="mt-4">
            <button 
                onClick={() => window.location.href = `${AUTH_URL}/login`}
                className="text-sm underline"
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
