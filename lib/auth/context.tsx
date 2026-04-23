'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSWRConfig } from 'swr'
import apiRequest, { setRefreshHandler } from '@/lib/api/client'
import { LoadingOverlay, useSessionSync, SessionExpiryWarning, useSessionRefresh } from '@ciphera-net/ui'
import { cdnUrl } from '@/lib/cdn'
import { logoutAction, getSessionAction, setSessionAction } from '@/app/actions/auth'
import { getUserOrganizations, switchContext, getOrganization } from '@/lib/api/organization'
import { logger } from '@/lib/utils/logger'
import { cleanupStaleStorage } from '@/lib/utils/storage-cleanup'

/** Read vault PII from the cross-subdomain cookie set by id-frontend. */
function getVaultPII(): { email?: string; display_name?: string } {
  if (typeof document === 'undefined') return {}
  const match = document.cookie.match(/(?:^|;\s*)ciphera_pii=([^;]+)/)
  if (!match) return {}
  try { return JSON.parse(atob(match[1])) } catch { return {} }
}

interface User {
  id: string
  email: string
  display_name?: string
  totp_enabled: boolean
  org_id?: string
  role?: string
  preferences?: {
    email_notifications?: {
      new_file_received: boolean
      file_downloaded: boolean
      login_alerts: boolean
      password_alerts: boolean
      two_factor_alerts: boolean
    }
  }
}

interface AuthContextType {
  user: User | null
  loading: boolean
  hadPriorSession: boolean
  login: (user: User) => void
  logout: () => void
  refresh: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  hadPriorSession: false,
  login: () => {},
  logout: () => {},
  refresh: async () => {},
  refreshSession: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [hadPriorSession, setHadPriorSession] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const { mutate: swrMutate } = useSWRConfig()

  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          screen_width: window.screen.width,
          screen_height: window.screen.height,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
      if (res.ok) return true
      const data = await res.json().catch(() => null)
      if (data?.retryable) {
        const retry = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            screen_width: window.screen.width,
            screen_height: window.screen.height,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        })
        return retry.ok
      }
      return false
    } catch {
      return false
    }
  }, [])

  const login = (userData: User) => {
    // * Merge vault PII from cross-subdomain cookie (set by id-frontend)
    const pii = getVaultPII()
    const enriched = {
      ...userData,
      email: userData.email || pii.email || '',
      display_name: userData.display_name || pii.display_name,
    }
    localStorage.setItem('user', JSON.stringify(enriched))
    localStorage.setItem('ciphera_token_refreshed_at', Date.now().toString())
    setUser(enriched)
    router.refresh()
    // * Fetch full profile — merge with vault PII for any server-side fields
    apiRequest<User>('/auth/user/me')
      .then((fullProfile) => {
        setUser((prev) => {
          const merged = {
            ...fullProfile,
            email: fullProfile.email || prev?.email || pii.email || '',
            display_name: fullProfile.display_name || prev?.display_name || pii.display_name,
            org_id: prev?.org_id ?? fullProfile.org_id,
            role: prev?.role ?? fullProfile.role,
          }
          localStorage.setItem('user', JSON.stringify(merged))
          return merged
        })
      })
      .catch((e) => logger.error('Failed to fetch full profile after login', e))
  }

  const logout = useCallback(async () => {
    setIsLoggingOut(true)
    try { await logoutAction() } catch { /* stale build — continue with client-side cleanup */ }
    localStorage.removeItem('user')
    localStorage.removeItem('ciphera_token_refreshed_at')
    localStorage.removeItem('ciphera_last_activity')
    document.cookie = 'csrf_token=; Max-Age=0; path=/;'
    document.cookie = 'csrf_token=; Max-Age=0; path=/; domain=.ciphera.net;'
    document.cookie = 'ciphera_pii=; Max-Age=0; path=/;'
    document.cookie = 'ciphera_pii=; Max-Age=0; path=/; domain=.ciphera.net;'
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const channel = new BroadcastChannel('ciphera_session')
      channel.postMessage({ type: 'LOGOUT' })
      channel.close()
    }
    setUser(null)
    setHadPriorSession(false)
    setIsLoggingOut(false)
    router.push('/')
    router.refresh()
  }, [router])

  const { showExpiredModal, refreshWithMutex } = useSessionRefresh({
    isAuthenticated: !!user,
    onRefresh: refreshToken,
  })

  useEffect(() => {
    setRefreshHandler(refreshWithMutex)
    return () => setRefreshHandler(null)
  }, [refreshWithMutex])

  const refresh = useCallback(async () => {
    try {
      const session = await getSessionAction()
      const userData = await apiRequest<User>('/auth/user/me')

      setUser((prev) => {
        // * For ZKE users the server returns empty email/display_name.
        // * Prefer state → cookie → empty.
        const pii = getVaultPII()
        const merged = {
          ...userData,
          email: userData.email || prev?.email || pii.email || '',
          display_name: userData.display_name || prev?.display_name || pii.display_name,
          org_id: session?.org_id ?? userData.org_id,
          role: session?.role ?? userData.role,
        }
        localStorage.setItem('user', JSON.stringify(merged))
        return merged
      })
    } catch (e) {
      logger.error('Failed to refresh user data', e)
    }
    // * Clear SWR cache so stale data isn't served after token refresh
    swrMutate(() => true, undefined, { revalidate: true })
    router.refresh()
  }, [router, swrMutate])

  const refreshSession = useCallback(async () => {
      await refresh()
  }, [refresh])

  // Initial load
  useEffect(() => {
    const init = async () => {
        cleanupStaleStorage()

        // * 1. Check server-side session (cookies)
        let session: Awaited<ReturnType<typeof getSessionAction>> = null
        try {
          session = await getSessionAction()
        } catch {
          // * Stale build — treat as no session. The login page will redirect
          // * to the auth service via window.location.href (full navigation),
          // * which fetches fresh HTML/JS from the server on return.
        }

        // * 2. If no access_token but user was previously logged in, try refresh
        const cachedUser = typeof window !== 'undefined' ? localStorage.getItem('user') : null
        if (!session && cachedUser) {
          setHadPriorSession(true)
          const refreshed = await refreshWithMutex()
          if (refreshed) {
            try {
              session = await getSessionAction()
            } catch {
              // * Stale build — fall through
            }
          }
        }

        if (session) {
            setUser(session)
            localStorage.setItem('user', JSON.stringify(session))
            localStorage.setItem('ciphera_token_refreshed_at', Date.now().toString())
            // * Fetch full profile from API; preserve org_id/role from session.
            // * For ZKE users the server returns empty email/display_name — preserve
            // * the values from the session (JWT payload / localStorage).
            try {
              const userData = await apiRequest<User>('/auth/user/me')
              // * Check localStorage + cross-subdomain cookie for vault PII
              let cachedPII: Partial<User> = {}
              const stored = localStorage.getItem('user')
              if (stored) { try { cachedPII = JSON.parse(stored) } catch { /* ignore */ } }
              const pii = getVaultPII()
              const merged = {
                ...userData,
                email: userData.email || cachedPII.email || pii.email || session.email,
                display_name: userData.display_name || cachedPII.display_name || pii.display_name,
                org_id: session.org_id,
                role: session.role,
              }
              setUser(merged)
              localStorage.setItem('user', JSON.stringify(merged))
            } catch (e) {
              logger.error('Failed to fetch full profile', e)
            }
        } else {
            // * Session invalid/expired
            localStorage.removeItem('user')
            setUser(null)
        }

        setLoading(false)
    }
    init()
  }, [])

  // * Sync session across browser tabs using BroadcastChannel
  useSessionSync({
    onLogout: () => {
      localStorage.removeItem('user')
      localStorage.removeItem('ciphera_token_refreshed_at')
      localStorage.removeItem('ciphera_last_activity')
      setUser(null)
      setHadPriorSession(false)
      router.push('/')
      router.refresh()
    },
    onLogin: (userData) => {
      setUser(userData as User)
      router.refresh()
    },
    onRefresh: () => {
      refresh()
    },
  })

  // * Stable primitives for the effect dependency array — avoids re-running
  // * on every render when the `user` object reference changes.
  const isAuthenticated = !!user
  const userOrgId = user?.org_id

  // * Organization Wall & Auto-Switch
  useEffect(() => {
    const checkOrg = async () => {
      if (!loading && isAuthenticated) {
        if (pathname?.startsWith('/auth/callback')) return

        try {
          const organizations = await getUserOrganizations()

          if (organizations.length === 0) {
            if (pathname?.startsWith('/setup')) return
            router.push('/setup/org')
            return
          }

          // * Onboarding lock: if current org hasn't completed onboarding, redirect to setup
          if (userOrgId && !pathname?.startsWith('/setup')) {
            const cacheKey = `pulse_onboarding_done_${userOrgId}`
            const cached = typeof window !== 'undefined' && localStorage.getItem(cacheKey)
            if (!cached) {
              try {
                const org = await getOrganization(userOrgId)
                if (!org.onboarding_completed_at) {
                  router.push('/setup/site')
                  return
                }
                localStorage.setItem(cacheKey, '1')
              } catch {
                // org fetch failed — don't block
              }
            }
          }

          // * If user has organizations but no context (org_id), switch to the first one
          if (!userOrgId && organizations.length > 0) {
             const firstOrg = organizations[0]
             
             try {
                 const { access_token } = await switchContext(firstOrg.organization_id)
                 
                 // * Update session cookie
                 const result = await setSessionAction(access_token)
                 if (result.success && result.user) {
                     try {
                       const fullProfile = await apiRequest<{ id: string; email: string; display_name?: string; totp_enabled: boolean; org_id?: string; role?: string }>('/auth/user/me')
                       // * For ZKE users, preserve existing PII when server returns empty values
                       const merged = {
                         ...fullProfile,
                         email: fullProfile.email || user?.email || result.user.email,
                         display_name: fullProfile.display_name || user?.display_name,
                         org_id: result.user.org_id ?? fullProfile.org_id,
                         role: result.user.role ?? fullProfile.role,
                       }
                       setUser(merged)
                       localStorage.setItem('user', JSON.stringify(merged))
                     } catch {
                       setUser(result.user)
                       localStorage.setItem('user', JSON.stringify(result.user))
                     }
                     router.refresh()
                 }
             } catch (e) {
                 logger.error('Failed to auto-switch context', e)
             }
          }
        } catch (e) {
          logger.error("Failed to fetch organizations", e)
        }
      }
    }
    
    checkOrg()
  }, [loading, isAuthenticated, userOrgId, pathname, router])

  return (
    <AuthContext.Provider value={{ user, loading, hadPriorSession, login, logout, refresh, refreshSession }}>
      {isLoggingOut && <LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Pulse" />}
      <SessionExpiryWarning
        show={showExpiredModal}
        onSignIn={logout}
      />
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
