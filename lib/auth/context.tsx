     1|'use client'
     2|
     3|import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
     4|import { useRouter } from 'next/navigation'
     5|import apiRequest from '@/lib/api/client'
     6|import LoadingOverlay from '@/components/LoadingOverlay'
     7|import { logoutAction, getSessionAction } from '@/app/actions/auth'
     8|
     9|interface User {
    10|  id: string
    11|  email: string
    12|  totp_enabled: boolean
    13|}
    14|
    15|interface AuthContextType {
    16|  user: User | null
    17|  loading: boolean
    18|  login: (user: User) => void
    19|  logout: () => void
    20|  refresh: () => Promise<void>
    21|  refreshSession: () => Promise<void>
    22|}
    23|
    24|const AuthContext = createContext<AuthContextType>({
    25|  user: null,
    26|  loading: true,
    27|  login: () => {},
    28|  logout: () => {},
    29|  refresh: async () => {},
    30|  refreshSession: async () => {},
    31|})
    32|
    33|export function AuthProvider({ children }: { children: React.ReactNode }) {
    34|  const [user, setUser] = useState<User | null>(null)
    35|  const [loading, setLoading] = useState(true)
    36|  const [isLoggingOut, setIsLoggingOut] = useState(false)
    37|  const router = useRouter()
    38|
    39|  const login = (userData: User) => {
    40|    // * We still store user profile in localStorage for optimistic UI, but NOT the token
    41|    localStorage.setItem('user', JSON.stringify(userData))
    42|    setUser(userData)
    43|    router.refresh()
    44|  }
    45|
    46|  const logout = useCallback(async () => {
    47|    setIsLoggingOut(true)
    48|    await logoutAction()
    49|    localStorage.removeItem('user')
    50|    // * Clear legacy tokens if they exist
    51|    localStorage.removeItem('token')
    52|    localStorage.removeItem('refreshToken')
    53|    
    54|    setTimeout(() => {
    55|      window.location.href = '/'
    56|    }, 500)
    57|  }, [])
    58|
    59|  const refresh = useCallback(async () => {
    60|    try {
    61|      const userData = await apiRequest<User>('/auth/user/me')
    62|      setUser(userData)
    63|      localStorage.setItem('user', JSON.stringify(userData))
    64|    } catch (e) {
    65|      console.error('Failed to refresh user data', e)
    66|    }
    67|    router.refresh()
    68|  }, [router])
    69|
    70|  const refreshSession = useCallback(async () => {
    71|      await refresh()
    72|  }, [refresh])
    73|
    74|  // Initial load
    75|  useEffect(() => {
    76|    const init = async () => {
    77|        // * 1. Check server-side session (cookies)
    78|        const session = await getSessionAction()
    79|        
    80|        if (session) {
    81|            setUser(session)
    82|            localStorage.setItem('user', JSON.stringify(session))
    83|        } else {
    84|            // * Session invalid/expired
    85|            localStorage.removeItem('user')
    86|            setUser(null)
    87|        }
    88|        
    89|        // * Clear legacy tokens if they exist (migration)
    90|        if (localStorage.getItem('token')) {
    91|            localStorage.removeItem('token')
    92|            localStorage.removeItem('refreshToken')
    93|        }
    94|
    95|        setLoading(false)
    96|    }
    97|    init()
    98|  }, [])
    99|
   100|  return (
   101|    <AuthContext.Provider value={{ user, loading, login, logout, refresh, refreshSession }}>
   102|      {isLoggingOut && <LoadingOverlay logoSrc="/ciphera_icon_no_margins.png" title="Ciphera Analytics" />}
   103|      {children}
   104|    </AuthContext.Provider>
   105|  )
   106|}
   107|
   108|export const useAuth = () => useContext(AuthContext)
   109|