'use client'

import { useSyncExternalStore } from 'react'

/**
 * The palette actually on screen, 'dark' or 'light'. For code that reads colours
 * in JavaScript (d3 charts reading CSS variables) and must re-read them when the
 * theme changes.
 *
 * It resolves `theme-system` the way the stylesheet does, with the same media
 * query, and follows both inputs live: the class ThemeSync writes on <html>, and
 * an OS light/dark change. Components must use this and never read
 * `prefers-color-scheme` themselves, or a chart could disagree with the page
 * around it.
 */
export type ResolvedTheme = 'dark' | 'light'

const QUERY = '(prefers-color-scheme: light)'

function resolve(): ResolvedTheme {
  const cl = document.documentElement.classList
  if (cl.contains('light')) return 'light'
  if (cl.contains('theme-system') && window.matchMedia(QUERY).matches) return 'light'
  return 'dark'
}

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY)
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  mql.addEventListener('change', onChange)
  return () => {
    observer.disconnect()
    mql.removeEventListener('change', onChange)
  }
}

export function useResolvedTheme(): ResolvedTheme {
  // The server renders dark (the default), and the snapshot matches it until the
  // client reads the real class, so hydration never mismatches.
  return useSyncExternalStore(subscribe, resolve, () => 'dark')
}
