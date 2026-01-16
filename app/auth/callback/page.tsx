'use client'

import { useEffect, useState, Suspense, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { AUTH_URL } from '@/lib/api/client'

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const processedRef = useRef(false)

  useEffect(() => {
    if (processedRef.current) return
    
    const token = searchParams.get('token')
    const refreshToken = searchParams.get('refresh_token')
    
    if (token && refreshToken) {
        processedRef.current = true
        try {
            const payload = JSON.parse(atob(token.split('.')[1]))
            login(token, refreshToken, {
                id: payload.sub,
                email: payload.email || 'user@ciphera.net',
                totp_enabled: payload.totp_enabled || false
            })
            const returnTo = searchParams.get('returnTo') || '/'
            router.push(returnTo)
        } catch (e) {
            setError('Invalid token received')
        }
        return
    }

    const code = searchParams.get('code')
    const state = searchParams.get('state')
    
    if (!code || !state) return

    processedRef.current = true

    const storedState = localStorage.getItem('oauth_state')
    const codeVerifier = localStorage.getItem('oauth_code_verifier')

    if (state !== storedState) {
        console.error('State mismatch', { received: state, stored: storedState })
        setError('Invalid state')
        return
    }

    const exchangeCode = async () => {
      try {
        const authApiUrl = process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:8081'
        const res = await fetch(`${authApiUrl}/oauth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
            client_id: 'analytics-app',
            redirect_uri: window.location.origin + '/auth/callback',
            code_verifier: codeVerifier,
          }),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to exchange token')
        }

        const data = await res.json()
        
        const payload = JSON.parse(atob(data.access_token.split('.')[1]))
        
        login(data.access_token, data.refresh_token, {
            id: payload.sub,
            email: payload.email || 'user@ciphera.net',
            totp_enabled: payload.totp_enabled || false
        })
        
        localStorage.removeItem('oauth_state')
        localStorage.removeItem('oauth_code_verifier')
        
        router.push('/')
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

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-800 mx-auto mb-4"></div>
        <p className="text-neutral-600 dark:text-neutral-400">Completing sign in...</p>
      </div>
    </div>
  )
}

export default function AuthCallback() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-800 mx-auto mb-4"></div>
          <p className="text-neutral-600 dark:text-neutral-400">Loading...</p>
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  )
}
