'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import apiRequest from '@/lib/api/client'
import LoadingOverlay from '@/components/LoadingOverlay'
import { logoutAction, getSessionAction, setSessionAction } from '@/app/actions/auth'
import { getUserOrganizations, switchContext } from '@/lib/api/organization'

interface User {
  id: string
  email: string
  totp_enabled: boolean
  org_id?: string
  role?: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (user: User) => void
  logout: () => void
  refresh: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: () => {},
  logout: () => {},
  refresh: async () => {},
  refreshSession: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  const login = (userData: User) => {
    // * We still store user profile in localStorage for optimistic UI, but NOT the token
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
    router.refresh()
  }

  const logout = useCallback(async () => {
    setIsLoggingOut(true)
    await logoutAction()
    localStorage.removeItem('user')
    // * Clear legacy tokens if they exist
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    
    setTimeout(() => {
      window.location.href = '/'
    }, 500)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const userData = await apiRequest<User>('/auth/user/me')
      
      setUser(prev => {
        const merged = {
          ...userData,
          org_id: prev?.org_id,
          role: prev?.role
        }
        localStorage.setItem('user', JSON.stringify(merged))
        return merged
      })
    } catch (e) {
      console.error('Failed to refresh user data', e)
    }
    router.refresh()
  }, [router])

  const refreshSession = useCallback(async () => {
      await refresh()
  }, [refresh])

  // Initial load
  useEffect(() => {
    const init = async () => {
        // * 1. Check server-side session (cookies)
        const session = await getSessionAction()
        
        if (session) {
            setUser(session)
            localStorage.setItem('user', JSON.stringify(session))
        } else {
            // * Session invalid/expired
            localStorage.removeItem('user')
            setUser(null)
        }
        
        // * Clear legacy tokens if they exist (migration)
        if (localStorage.getItem('token')) {
            localStorage.removeItem('token')
            localStorage.removeItem('refreshToken')
        }

        setLoading(false)
    }
    init()
  }, [])

  // * Organization Wall & Auto-Switch
  useEffect(() => {
    const checkOrg = async () => {
      if (!loading && user) {
        // * If we are on onboarding, skip check
        if (pathname?.startsWith('/onboarding')) return
        
        // * If we are processing auth callback, skip check to avoid redirect loops
        if (pathname?.startsWith('/auth/callback')) return

        try {
          const organizations = await getUserOrganizations()
          
          if (organizations.length === 0) {
            // * No organizations -> Redirect to Onboarding
            router.push('/onboarding')
            return
          }

          // * If user has organizations but no context (org_id), switch to the first one
          if (!user.org_id && organizations.length > 0) {
             const firstOrg = organizations[0]
             console.log('Auto-switching to organization:', firstOrg.organization_name)
             
             try {
                 const { access_token } = await switchContext(firstOrg.organization_id)
                 
                 // * Update session cookie
                 const result = await setSessionAction(access_token)
                 if (result.success && result.user) {
                     setUser(result.user)
                     localStorage.setItem('user', JSON.stringify(result.user))
                     
                     // * Force hard reload to ensure browser sends new cookie to backend
                     // * router.refresh() is not enough for Client Components fetching data immediately
                     // window.location.reload()
                     router.refresh()
                 }
             } catch (e) {
                 console.error('Failed to auto-switch context', e)
             }
          }
        } catch (e) {
          console.error("Failed to fetch organizations", e)
        }
      }
    }
    
    checkOrg()
  }, [loading, user, pathname, router])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, refreshSession }}>
      {isLoggingOut && <LoadingOverlay logoSrc="/ciphera_icon_no_margins.png" title="Pulse" />}
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
