'use client'

import { createContext, useContext, useCallback, useRef, useState, useEffect } from 'react'

interface LiveIndicatorContextValue {
  /** Timestamp of the last successful dashboard data fetch */
  lastUpdatedAt: number | null
  /** Call this when dashboard data refreshes */
  markUpdated: () => void
}

const LiveIndicatorContext = createContext<LiveIndicatorContextValue>({
  lastUpdatedAt: null,
  markUpdated: () => {},
})

export function LiveIndicatorProvider({ children }: { children: React.ReactNode }) {
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const markUpdated = useCallback(() => setLastUpdatedAt(Date.now()), [])

  return (
    <LiveIndicatorContext.Provider value={{ lastUpdatedAt, markUpdated }}>
      {children}
    </LiveIndicatorContext.Provider>
  )
}

export function useLiveIndicator() {
  return useContext(LiveIndicatorContext)
}
