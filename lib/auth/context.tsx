'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSWRConfig } from 'swr'
import apiRequest, { setRefreshHandler } from '@/lib/api/client'
import { LoadingOverlay, useSessionSync, SessionExpiryWarning, useSessionRefresh } from '@ciphera-net/facet'
import { cdnUrl } from '@/lib/cdn'
import { logoutAction, getSessionAction, setSessionAction } from '@/app/actions/auth'
import { getUserOrganizations, switchContext, getOrganization } from '@/lib/api/organization'
import { listSites } from '@/lib/api/sites'
import { logger } from '@/lib/utils/logger'
import { cleanupStaleStorage } from '@/lib/utils/storage-cleanup'
import { forgetAllPendingAuth } from '@/lib/api/oauth-store'
import { isTransientRefreshFailure } from '@/lib/auth/refresh-outcome'
import { reportClientEvent } from '@/lib/utils/clientEvents'
import { isAuthedAppRoute } from '@/lib/auth/appRoutes'

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
  /** True while init's transient-failure retry loop is actively trying to
   * restore the session — the state the takeover renders as "Restoring". */
  recovering: boolean
  login: (user: User) => void
  logout: () => void
  refresh: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  hadPriorSession: false,
  recovering: false,
  login: () => {},
  logout: () => {},
  refresh: async () => {},
  refreshSession: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [hadPriorSession, setHadPriorSession] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const { mutate: swrMutate } = useSWRConfig()

  // * Returns WHY a refresh failed, not just that it did.
  // *
  // * `transient` means we never got a verdict — the network was down, the route
  // * 5xx'd, id-backend was mid-rollout. The session may be perfectly valid, so
  // * the caller must retry quietly rather than announce "Session expired". Only
  // * a definitive rejection (the server said the credential is dead) ends the
  // * session. See @ciphera-net/facet useSessionRefresh.
  // * Audit: Infra/Auth/docs/audits/20-08-2026-session-loss-root-cause-audit.md §4 F-G
  // Re-read the freshly minted cookie's org_id/role into the user snapshot.
  // The slug gates (useIsOwner/useIsAdminOrOwner) read user.role, which is
  // otherwise hydrated only at page init and org switch — without this, a
  // role change stays invisible for the life of the tab while the token
  // quietly rotates every ~13 minutes.
  const rehydrateRoleSnapshot = useCallback(async () => {
    try {
      const session = await getSessionAction()
      if (!session) return
      setUser((prev) => {
        if (!prev) return prev
        if (prev.org_id === session.org_id && prev.role === session.role) return prev
        const merged = { ...prev, org_id: session.org_id, role: session.role }
        localStorage.setItem('user', JSON.stringify(merged))
        return merged
      })
    } catch {
      // * Stale build — the snapshot keeps its last value; the next full
      // * navigation re-hydrates from fresh HTML/JS.
    }
  }, [])

  const refreshToken = useCallback(async (signal?: AbortSignal): Promise<{ ok: boolean; transient: boolean }> => {
    const signals = () => ({
      screen_width: window.screen.width,
      screen_height: window.screen.height,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    // * Thread the hook's deadline AbortSignal into the fetch so a refresh the
    // * client has given up on is actually cancelled, not left in flight to
    // * commit a rotation the browser will never receive (the lost-rotation
    // * shape). Audit: 25-08-2026-lost-rotation-reuse-revocation-and-half-state-chrome.md §5.
    const post = (orgId: string) =>
      fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal,
        body: JSON.stringify({ ...signals(), org_id: orgId }),
      })

    try {
      const cachedUser = localStorage.getItem('user')
      const lastOrgId = cachedUser ? (JSON.parse(cachedUser).org_id ?? '') : ''

      const res = await post(lastOrgId)
      if (res.ok) {
        await rehydrateRoleSnapshot()
        return { ok: true, transient: false }
      }

      const data = await res.json().catch(() => null)
      if (data?.retryable) {
        const retry = await post(lastOrgId)
        if (retry.ok) {
          await rehydrateRoleSnapshot()
          return { ok: true, transient: false }
        }
        const retryData = await retry.json().catch(() => null)
        return { ok: false, transient: isTransientRefreshFailure(retry.status, retryData) }
      }
      return { ok: false, transient: isTransientRefreshFailure(res.status, data) }
    } catch {
      // * The request never completed. That is a statement about the network,
      // * never about the session.
      return { ok: false, transient: true }
    }
  }, [rehydrateRoleSnapshot])

  const login = (userData: User) => {
    // * Zero-knowledge accounts carry no server-side PII: the column was dropped
    // * (migration 045) and the access token has no email claim. Normalise the
    // * absent email to '' so every consumer takes the documented empty path.
    const enriched = {
      ...userData,
      email: userData.email || '',
      display_name: userData.display_name,
    }
    localStorage.setItem('user', JSON.stringify(enriched))
    localStorage.setItem('ciphera_token_refreshed_at', Date.now().toString())
    setUser(enriched)
    router.refresh()
    // * Fetch full profile — keep whatever the previous state already held for
    // * the fields the server cannot return.
    apiRequest<User>('/auth/user/me')
      .then((fullProfile) => {
        setUser((prev) => {
          const merged = {
            ...fullProfile,
            email: fullProfile.email || prev?.email || '',
            display_name: fullProfile.display_name || prev?.display_name,
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
    // 🔴 The result is READ, not discarded. `revoked` is the only signal that
    // id-backend actually killed the refresh family; `success` only means the
    // local cookies were cleared. Until 03-09-2026 logoutAction reached
    // id-backend with no cookie, no Authorization header and no CSRF header, so
    // it was answered 401 every time — the browser looked signed out while the
    // family stayed live in `refresh_tokens` for up to 30 days, and nothing
    // anywhere said so.
    try {
      const result = await logoutAction()
      if (!result.revoked) {
        logger.error('Sign-out was not confirmed by Ciphera ID — the session may still be live elsewhere', {
          status: result.status,
        })
      }
    } catch (e) {
      /* stale build — continue with client-side cleanup */
      logger.error('logoutAction failed; continuing with client-side cleanup', e)
    }
    localStorage.removeItem('user')
    localStorage.removeItem('ciphera_token_refreshed_at')
    localStorage.removeItem('ciphera_last_activity')
    // * Logout ends with a full navigation to /login, which starts a fresh
    // * attempt. Anything still pending belongs to the session being ended.
    forgetAllPendingAuth()
    document.cookie = 'csrf_token=; Max-Age=0; path=/;'
    document.cookie = 'csrf_token=; Max-Age=0; path=/; domain=.ciphera.net;'
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('cw_auth_') || key.startsWith('cw_pubsub_')) {
        localStorage.removeItem(key)
      }
    })
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const channel = new BroadcastChannel('ciphera_session')
      channel.postMessage({ type: 'LOGOUT' })
      channel.close()
    }
    // Full page reload ensures the browser sends updated (deleted) cookies
    // to the server. Client-side router.push would race with cookie deletion.
    window.location.href = '/login'
  }, [])

  const { showExpiredModal, refreshWithMutex, refreshDetailed } = useSessionRefresh({
    isAuthenticated: !!user,
    onRefresh: refreshToken,
  })

  // * Inject the DETAILED handler into the API client, not the boolean one — the
  // * client must see `transient` so it does not wipe the cached user on a
  // * network blip. See lib/api/client.ts.
  useEffect(() => {
    setRefreshHandler(refreshDetailed)
    return () => setRefreshHandler(null)
  }, [refreshDetailed])

  const refresh = useCallback(async () => {
    try {
      const session = await getSessionAction()
      const userData = await apiRequest<User>('/auth/user/me')

      setUser((prev) => {
        // * For ZKE users the server returns empty email/display_name.
        // * Prefer server → state → empty.
        const merged = {
          ...userData,
          email: userData.email || prev?.email || '',
          display_name: userData.display_name || prev?.display_name,
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

  // Rotate the token, THEN re-hydrate. The plain refresh() re-reads the
  // CURRENT cookie, which after a server-side role change (ownership
  // transfer) still carries the old role — only a rotation mints a cookie
  // from the server's truth. Callers that changed their own role go through
  // this, not refresh().
  const refreshSession = useCallback(async () => {
      await refreshWithMutex()
      await refresh()
  }, [refreshWithMutex, refresh])

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

        // * 2. If no access_token but user was previously logged in, try refresh.
        // *
        // * 🔴 On a TRANSIENT failure (network down, 5xx, timeout) this retries on
        // * a backoff while `loading` holds — it does NOT null the user. A wake-time
        // * blip used to take the definitive path here, wipe the cached user, and
        // * leave the context logged-out for the life of the browser profile with
        // * no way back. Only the server saying "this credential is dead" ends the
        // * session; an unreachable server proves nothing.
        // * Audit: 25-08-2026-lost-rotation-reuse-revocation-and-half-state-chrome.md §3, §5.3
        const cachedUser = typeof window !== 'undefined' ? localStorage.getItem('user') : null
        let definitiveReject = false
        if (!session && cachedUser) {
          setHadPriorSession(true)
          const INIT_BACKOFF_MS = [5_000, 15_000, 45_000, 60_000]
          for (let attempt = 0; ; attempt++) {
            const outcome = await refreshDetailed()
            if (outcome.ok) {
              try {
                session = await getSessionAction()
              } catch {
                // * Stale build — fall through (cache kept: the refresh proved
                // * the session alive; a full navigation re-hydrates).
              }
              break
            }
            if (!outcome.transient) {
              definitiveReject = true
              break
            }
            // * Entering the retry loop: surface it, so app routes can render
            // * the "Restoring your session" takeover instead of a blank frame.
            setRecovering(true)
            // * Transient: wait out the backoff, but return early the moment the
            // * browser reports the network back.
            const delay = INIT_BACKOFF_MS[Math.min(attempt, INIT_BACKOFF_MS.length - 1)]
            await new Promise<void>((resolve) => {
              const timer = setTimeout(() => {
                window.removeEventListener('online', onOnline)
                resolve()
              }, delay)
              const onOnline = () => {
                clearTimeout(timer)
                window.removeEventListener('online', onOnline)
                resolve()
              }
              window.addEventListener('online', onOnline)
            })
          }
          setRecovering(false)
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
              // * Check localStorage for anything a previous session unlocked.
              let cachedPII: Partial<User> = {}
              const stored = localStorage.getItem('user')
              if (stored) { try { cachedPII = JSON.parse(stored) } catch { /* ignore */ } }
              const merged = {
                ...userData,
                email: userData.email || cachedPII.email || session.email,
                display_name: userData.display_name || cachedPII.display_name,
                org_id: session.org_id,
                role: session.role,
              }
              setUser(merged)
              localStorage.setItem('user', JSON.stringify(merged))
            } catch (e) {
              logger.error('Failed to fetch full profile', e)
            }
        } else {
            // * No session. Wipe the cache ONLY when the server definitively
            // * rejected the credential (or there was never a cached user).
            // * After an ok-refresh-but-stale-build, or with no verdict at all,
            // * the cache is the recovery path's seed — destroying it makes the
            // * logged-out state permanent.
            if (!cachedUser || definitiveReject) {
              localStorage.removeItem('user')
            }
            if (definitiveReject && cachedUser) {
              reportClientEvent('session_lost_on_live_tab', 'init_definitive_reject')
            }
            setUser(null)
        }

        setLoading(false)
    }
    init()
  }, [])

  // * Durable session-history signal for the takeover: a 1-year cookie set on
  // * every authenticated session, NEVER cleared by logout. It only says "this
  // * browser has signed in before" — display-only, no auth weight — and it is
  // * what lets the takeover tell "signed out" from "never signed in" after
  // * every fragile in-memory flag is gone (cross-tab logout, cache wipe).
  // * Audit: 25-08-2026-lost-rotation-reuse-revocation-and-half-state-chrome.md §5.2
  useEffect(() => {
    if (user && typeof document !== 'undefined') {
      document.cookie = 'pulse_had_session=1; Max-Age=31536000; Path=/; SameSite=Lax'
    }
  }, [user])

  // * A DEFINITIVE session death on an app route ends the session in state, so
  // * the route renders the takeover — the one thing a dead session shows
  // * (design D, approved 26-08-2026). The facet modal remains the surface for
  // * marketing routes, where there is no app chrome to take over; it clears
  // * itself when isAuthenticated flips false.
  useEffect(() => {
    if (showExpiredModal && pathname && isAuthedAppRoute(pathname)) {
      localStorage.removeItem('user')
      setUser(null)
    }
  }, [showExpiredModal, pathname])

  // * RECOVERY PATH. Once the context flipped to logged-out, nothing used to
  // * ever re-check: `user` went null, useSessionRefresh unmounted, and data
  // * hooks kept succeeding or failing on their own — the context could not
  // * come back even when the session was fine (another tab refreshed it, the
  // * network returned, the cookie jar is valid again). Re-probe the session on
  // * the signals that it may be back; on success the user is restored in place.
  // * Audit: 25-08-2026-lost-rotation-reuse-revocation-and-half-state-chrome.md §3, §5.3
  useEffect(() => {
    if (user || loading || !hadPriorSession || typeof window === 'undefined') return
    let cancelled = false
    let probing = false
    const tryRecover = async () => {
      if (cancelled || probing) return
      probing = true
      try {
        let session = await getSessionAction().catch(() => null)
        if (!session) {
          // * No live access token — the refresh cookie may still be good.
          const outcome = await refreshDetailed()
          if (outcome.ok) {
            session = await getSessionAction().catch(() => null)
          }
        }
        if (!cancelled && session) {
          localStorage.setItem('user', JSON.stringify(session))
          localStorage.setItem('ciphera_token_refreshed_at', Date.now().toString())
          setUser(session)
          reportClientEvent('session_recovered_on_live_tab')
        }
      } finally {
        probing = false
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tryRecover()
    }
    const onStorage = (e: StorageEvent) => {
      // * Another tab on this origin refreshed successfully — its token is in
      // * the shared jar, so this tab's session is live again.
      if (e.key === 'ciphera_token_refreshed_at' && e.newValue) void tryRecover()
    }
    const onOnline = () => void tryRecover()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('storage', onStorage)
    window.addEventListener('online', onOnline)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('online', onOnline)
    }
  }, [user, loading, hadPriorSession, refreshDetailed])

  // * Telemetry: the moment the expiry modal goes up IS "a session was lost on
  // * a live tab" — the event the 25-08 incident had to be reconstructed
  // * without. Counted, not screenshotted, from now on.
  useEffect(() => {
    if (showExpiredModal) {
      reportClientEvent('session_lost_on_live_tab', 'expiry_modal_shown')
    }
  }, [showExpiredModal])

  // * Sync session across browser tabs using BroadcastChannel
  useSessionSync({
    onLogout: () => {
      localStorage.removeItem('user')
      localStorage.removeItem('ciphera_token_refreshed_at')
      localStorage.removeItem('ciphera_last_activity')
      setUser(null)
      // * hadPriorSession deliberately NOT cleared: this browser demonstrably
      // * had a session (a sibling tab just ended it). Clearing it here was one
      // * of the two paths into the marketing-over-app franken-state. The
      // * durable pulse_had_session cookie is the takeover's real signal now.
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
            if (pathname?.startsWith('/setup') || pathname?.startsWith('/join')) return
            router.push('/setup/org')
            return
          }

          // * Onboarding lock: if current org hasn't completed onboarding, redirect to setup.
          // * /settings/* is EXEMPT (ruled C1, 25-08-2026): the wall used to gate every
          // * app route, so an org abandoned mid-wizard could not be managed or even
          // * DELETED — the danger zone sat behind the wall it needed to escape.
          if (
            userOrgId &&
            !pathname?.startsWith('/setup') &&
            !pathname?.startsWith('/settings')
          ) {
            const cacheKey = `pulse_onboarding_done_${userOrgId}`
            const cached = typeof window !== 'undefined' && localStorage.getItem(cacheKey)
            if (!cached) {
              try {
                const org = await getOrganization(userOrgId)
                if (!org.onboarding_completed_at) {
                  // * Resume at the furthest incomplete step, computed from server
                  // * state — the fixed '/setup/site' target invited a duplicate
                  // * site from every org that already had one.
                  let target = '/setup/site'
                  try {
                    const sites = await listSites()
                    if (sites.length > 0) {
                      target = sites.some(s => s.install_status && s.install_status !== 'never_installed')
                        ? '/setup/plan'
                        : '/setup/install'
                    }
                  } catch {
                    // sites fetch failed — the default target still resumes the wizard
                  }
                  router.push(target)
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
    <AuthContext.Provider value={{ user, loading, hadPriorSession, recovering, login, logout, refresh, refreshSession }}>
      {isLoggingOut && <LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Pulse" />}
      {/* On app routes the takeover IS the expired surface — the modal would be
          a second voice over it. It stays for marketing routes. */}
      <SessionExpiryWarning
        show={showExpiredModal && !(pathname && isAuthedAppRoute(pathname))}
        onSignIn={logout}
      />
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
