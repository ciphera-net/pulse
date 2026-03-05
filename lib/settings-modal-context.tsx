'use client'

import { createContext, useContext, useState, useCallback } from 'react'

interface SettingsModalContextType {
  isOpen: boolean
  openSettings: () => void
  closeSettings: () => void
}

const SettingsModalContext = createContext<SettingsModalContextType>({
  isOpen: false,
  openSettings: () => {},
  closeSettings: () => {},
})

export function SettingsModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const openSettings = useCallback(() => setIsOpen(true), [])
  const closeSettings = useCallback(() => setIsOpen(false), [])

  return (
    <SettingsModalContext.Provider value={{ isOpen, openSettings, closeSettings }}>
      {children}
    </SettingsModalContext.Provider>
  )
}

export function useSettingsModal() {
  return useContext(SettingsModalContext)
}
