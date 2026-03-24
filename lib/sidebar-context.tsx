'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'

const SIDEBAR_KEY = 'pulse_sidebar_collapsed'

interface SidebarState {
  collapsed: boolean
  toggle: () => void
  expand: () => void
  collapse: () => void
}

const SidebarContext = createContext<SidebarState>({
  collapsed: true,
  toggle: () => {},
  expand: () => {},
  collapse: () => {},
})

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem(SIDEBAR_KEY) !== 'false'
  })

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(SIDEBAR_KEY, String(next))
      return next
    })
  }, [])

  const expand = useCallback(() => {
    setCollapsed(false)
    localStorage.setItem(SIDEBAR_KEY, 'false')
  }, [])

  const collapse = useCallback(() => {
    setCollapsed(true)
    localStorage.setItem(SIDEBAR_KEY, 'true')
  }, [])

  // Keyboard shortcut: [ to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        toggle()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [toggle])

  return (
    <SidebarContext.Provider value={{ collapsed, toggle, expand, collapse }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  return useContext(SidebarContext)
}
