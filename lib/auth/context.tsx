'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import apiRequest from '@/lib/api/client'
import LoadingOverlay from '@/components/LoadingOverlay'

interface User {
  id: string
  email: string
  totp_enabled: boolean
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (token: string, refreshToken: string, user: User) => void
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

  const login = (token: string, refreshToken: string, userData: User) => {
    localStorage.setItem('token', token)
    localStorage.setItem('refreshToken', refreshToken)
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
    router.refresh()
  }

  const logout = useCallback(() => {
    setIsLoggingOut(true)
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    
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
      const savedUser = localStorage.getItem('user')
      if (savedUser && !user) {
         try { setUser(JSON.parse(savedUser)) } catch {}
      }
    }
    router.refresh()
  }, [router, user])

  const refreshSession = useCallback(async () => {
      await refresh()
  }, [refresh])

  // Initial load
  useEffect(() => {
    const init = async () => {
        const token = localStorage.getItem('token')
        const savedUser = localStorage.getItem('user')
        
        if (token) {
            // Optimistically set from local storage first
            if (savedUser) {
                try {
                    setUser(JSON.parse(savedUser))
                } catch (e) {
                    localStorage.removeItem('user')
                }
            }
            
            // Then fetch fresh data
            try {
                const userData = await apiRequest<User>('/auth/user/me')
                setUser(userData)
                localStorage.setItem('user', JSON.stringify(userData))
            } catch (e) {
                console.error('Failed to fetch initial user data', e)
            }
        }
        setLoading(false)
    }
    init()
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, refreshSession }}>
      {isLoggingOut && <LoadingOverlay logoSrc="/ciphera_icon_no_margins.png" title="Ciphera Analytics" />}
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
