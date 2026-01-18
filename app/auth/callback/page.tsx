     1|'use client'
     2|
     3|import { useEffect, useState, Suspense, useRef } from 'react'
     4|import { useRouter, useSearchParams } from 'next/navigation'
     5|import { useAuth } from '@/lib/auth/context'
     6|import { AUTH_URL } from '@/lib/api/client'
     7|import { exchangeAuthCode, setSessionAction } from '@/app/actions/auth'
     8|
     9|function AuthCallbackContent() {
    10|  const router = useRouter()
    11|  const searchParams = useSearchParams()
    12|  const { login } = useAuth()
    13|  const [error, setError] = useState<string | null>(null)
    14|  const processedRef = useRef(false)
    15|
    16|  useEffect(() => {
    17|    // * Prevent double execution (React Strict Mode or fast re-renders)
    18|    if (processedRef.current) return
    19|    
    20|    // * Check for direct token passing (from auth-frontend direct login)
    21|    // * TODO: This flow exposes tokens in URL, should be deprecated in favor of Authorization Code flow
    22|    const token = searchParams.get('token')
    23|    const refreshToken = searchParams.get('refresh_token')
    24|    
    25|    if (token && refreshToken) {
    26|        processedRef.current = true
    27|        
    28|        const handleDirectTokens = async () => {
    29|            const result = await setSessionAction(token, refreshToken)
    30|            if (result.success && result.user) {
    31|                login(result.user)
    32|                const returnTo = searchParams.get('returnTo') || '/'
    33|                router.push(returnTo)
    34|            } else {
    35|                setError('Invalid token received')
    36|            }
    37|        }
    38|        handleDirectTokens()
    39|        return
    40|    }
    41|
    42|    const code = searchParams.get('code')
    43|    const state = searchParams.get('state')
    44|    
    45|    // * Skip if params are missing (might be initial render before params are ready)
    46|    if (!code || !state) return
    47|
    48|    processedRef.current = true
    49|
    50|    const storedState = localStorage.getItem('oauth_state')
    51|    const codeVerifier = localStorage.getItem('oauth_code_verifier')
    52|
    53|    if (!code || !state) {
    54|      setError('Missing code or state')
    55|      return
    56|    }
    57|
    58|    if (state !== storedState) {
    59|        console.error('State mismatch', { received: state, stored: storedState })
    60|        setError('Invalid state')
    61|        return
    62|    }
    63|
    64|    if (!codeVerifier) {
    65|        setError('Missing code verifier')
    66|        return
    67|    }
    68|
    69|    const exchangeCode = async () => {
    70|      try {
    71|        const redirectUri = window.location.origin + '/auth/callback'
    72|        const result = await exchangeAuthCode(code, codeVerifier, redirectUri)
    73|
    74|        if (!result.success || !result.user) {
    75|            throw new Error(result.error || 'Failed to exchange token')
    76|        }
    77|        
    78|        login(result.user)
    79|        
    80|        // * Cleanup
    81|        localStorage.removeItem('oauth_state')
    82|        localStorage.removeItem('oauth_code_verifier')
    83|        
    84|        router.push('/')
    85|      } catch (err: any) {
    86|        setError(err.message)
    87|      }
    88|    }
    89|
    90|    exchangeCode()
    91|  }, [searchParams, login, router])
    92|
    93|  if (error) {
    94|    return (
    95|      <div className="flex min-h-screen items-center justify-center p-4">
    96|        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4 text-red-500">
    97|          Error: {error}
    98|          <div className="mt-4">
    99|            <button 
   100|                onClick={() => window.location.href = `${AUTH_URL}/login`}
   101|                className="text-sm underline"
   102|            >
   103|                Back to Login
   104|            </button>
   105|          </div>
   106|        </div>
   107|      </div>
   108|    )
   109|  }
   110|
   111|  return (
   112|    <div className="flex min-h-screen items-center justify-center p-4">
   113|      <div className="text-center">
   114|        <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-800 mx-auto mb-4"></div>
   115|        <p className="text-neutral-600 dark:text-neutral-400">Completing sign in...</p>
   116|      </div>
   117|    </div>
   118|  )
   119|}
   120|
   121|export default function AuthCallback() {
   122|  return (
   123|    <Suspense fallback={
   124|      <div className="flex min-h-screen items-center justify-center p-4">
   125|        <div className="text-center">
   126|          <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-800 mx-auto mb-4"></div>
   127|          <p className="text-neutral-600 dark:text-neutral-400">Loading...</p>
   128|        </div>
   129|      </div>
   130|    }>
   131|      <AuthCallbackContent />
   132|    </Suspense>
   133|  )
   134|}
   135|