'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import apiRequest from '@/lib/api/client'
import LoadingOverlay from '@/components/LoadingOverlay'
import { logoutAction, getSessionAction } from '@/app/actions/auth'

interface User {
  id: string
  email: string
  totp_enabled: boolean
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
      setUser(userData)
      localStorage.setItem('user', JSON.stringify(userData))
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

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, refreshSession }}>
      {isLoggingOut && <LoadingOverlay logoSrc="/ciphera_icon_no_margins.png" title="Ciphera Pulse" />}
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
