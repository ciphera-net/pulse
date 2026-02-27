// * Custom hook for visibility-aware polling
// * Pauses polling when tab is not visible, resumes when visible
// * Reduces server load when users aren't actively viewing the dashboard

import { useEffect, useRef, useState, useCallback } from 'react'

interface UseVisibilityPollingOptions {
  // * Polling interval when tab is visible (in milliseconds)
  visibleInterval: number
  // * Polling interval when tab is hidden (in milliseconds, or null to pause)
  hiddenInterval: number | null
}

interface UseVisibilityPollingReturn {
  // * Whether polling is currently active
  isPolling: boolean
  // * Time since last poll
  lastPollTime: number | null
  // * Force a poll immediately
  triggerPoll: () => void
}

export function useVisibilityPolling(
  callback: () => void | Promise<void>,
  options: UseVisibilityPollingOptions
): UseVisibilityPollingReturn {
  const { visibleInterval, hiddenInterval } = options
  const [isPolling, setIsPolling] = useState(false)
  const [lastPollTime, setLastPollTime] = useState<number | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const callbackRef = useRef(callback)

  // * Keep callback reference up to date
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  // * Get current polling interval based on visibility
  const getInterval = useCallback((): number | null => {
    if (typeof document === 'undefined') return null

    const isVisible = document.visibilityState === 'visible'
    if (isVisible) {
      return visibleInterval
    }
    return hiddenInterval
  }, [visibleInterval, hiddenInterval])

  // * Start polling with current interval
  const startPolling = useCallback(() => {
    const interval = getInterval()
    if (interval === null) {
      setIsPolling(false)
      return
    }

    setIsPolling(true)

    // * Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    // * Set up new interval
    intervalRef.current = setInterval(() => {
      callbackRef.current()
      setLastPollTime(Date.now())
    }, interval)
  }, [getInterval])

  // * Stop polling
  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsPolling(false)
  }, [])

  // * Trigger immediate poll
  const triggerPoll = useCallback(() => {
    callbackRef.current()
    setLastPollTime(Date.now())

    // * Restart polling timer
    startPolling()
  }, [startPolling])

  // * Handle visibility changes
  useEffect(() => {
    if (typeof document === 'undefined') return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // * Tab became visible - resume polling with visible interval
        startPolling()
        // * Trigger immediate poll to get fresh data
        triggerPoll()
      } else {
        // * Tab hidden - switch to hidden interval or pause
        const interval = getInterval()
        if (interval === null) {
          stopPolling()
        } else {
          // * Restart with hidden interval
          startPolling()
        }
      }
    }

    // * Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // * Start polling initially
    startPolling()

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      stopPolling()
    }
  }, [startPolling, stopPolling, triggerPoll, getInterval])

  return {
    isPolling,
    lastPollTime,
    triggerPoll,
  }
}
