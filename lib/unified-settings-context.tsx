'use client'

import { createContext, useContext, useState, useCallback } from 'react'

type InitialTab = { context?: 'site' | 'workspace' | 'account'; tab?: string; siteId?: string } | null

interface UnifiedSettingsContextType {
  isOpen: boolean
  openUnifiedSettings: (initialTab?: InitialTab) => void
  closeUnifiedSettings: () => void
  initialTab: InitialTab
}

const UnifiedSettingsContext = createContext<UnifiedSettingsContextType>({
  isOpen: false,
  openUnifiedSettings: () => {},
  closeUnifiedSettings: () => {},
  initialTab: null,
})

export function UnifiedSettingsProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [initialTab, setInitialTab] = useState<InitialTab>(null)

  const openUnifiedSettings = useCallback((init?: InitialTab) => {
    setInitialTab(init || null)
    setIsOpen(true)
  }, [])

  const closeUnifiedSettings = useCallback(() => {
    setIsOpen(false)
    setInitialTab(null)
  }, [])

  return (
    <UnifiedSettingsContext.Provider value={{ isOpen, openUnifiedSettings, closeUnifiedSettings, initialTab }}>
      {children}
    </UnifiedSettingsContext.Provider>
  )
}

export function useUnifiedSettings() {
  return useContext(UnifiedSettingsContext)
}
