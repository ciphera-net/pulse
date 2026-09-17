'use client'

import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react'

/**
 * PanelSequence — hands each SettingsPanel its position in the page so the
 * panels can rise in sequence (round two, M1: 250 ms on the house curve, 60 ms
 * apart, the way the uptime page's sections and the dashboard's rows arrive).
 *
 * The provider lives inside the shell's keyed content group, so the count
 * restarts on every tab change and the first panel on the new page is index 0
 * again. Outside a provider (the setup flow, unit tests of a tab on its own)
 * `usePanelIndex` returns null and the panel renders still: the rise is a
 * property of the settings surface, not of the panel.
 */
const PanelSequenceContext = createContext<{ next: () => number } | null>(null)

export function PanelSequenceProvider({ children }: { children: ReactNode }) {
  const counter = useRef(0)
  const value = useMemo(() => ({ next: () => counter.current++ }), [])
  return <PanelSequenceContext.Provider value={value}>{children}</PanelSequenceContext.Provider>
}

/** The panel's index in the sequence, taken once per mount; null outside a provider. */
export function usePanelIndex(): number | null {
  const ctx = useContext(PanelSequenceContext)
  const idx = useRef<number | null>(null)
  if (ctx && idx.current === null) idx.current = ctx.next()
  return ctx ? idx.current : null
}
