'use client'

import { useCallback } from 'react'

/**
 * Provides an onKeyDown handler for WAI-ARIA tab lists.
 * Moves focus between sibling `[role="tab"]` buttons with Left/Right arrow keys.
 */
export function useTabListKeyboard() {
  return useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    const target = e.currentTarget
    const tabs = Array.from(target.querySelectorAll<HTMLElement>('[role="tab"]'))
    const index = tabs.indexOf(e.target as HTMLElement)
    if (index < 0) return

    let next: number | null = null
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1

    if (next !== null) {
      e.preventDefault()
      tabs[next].focus()
      tabs[next].click()
    }
  }, [])
}
