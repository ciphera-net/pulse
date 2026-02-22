'use client'

import { useEffect, useCallback } from 'react'

/**
 * Warns users with a browser prompt when they try to navigate away
 * or close the tab while there are unsaved form changes.
 *
 * @param isDirty - Whether the form has unsaved changes
 */
export function useUnsavedChanges(isDirty: boolean) {
  const handleBeforeUnload = useCallback(
    (e: BeforeUnloadEvent) => {
      if (!isDirty) return
      e.preventDefault()
    },
    [isDirty]
  )

  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [handleBeforeUnload])
}
