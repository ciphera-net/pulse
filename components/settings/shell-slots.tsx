'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Shell portal slots — how a tab hoists content up into the settings shell it
 * renders *inside* of. Each slot is a real DOM node the shell owns; consumers
 * portal into it, so there is no `children`-in-deps re-render loop.
 */

// ─── Masthead action slot ────────────────────────────────────────────────
//
// The shell renders one action slot in the masthead (top-right). A tab that
// wants the page's primary CTA up there renders `<MastheadAction>…</>`; it
// portals into the slot and unmounts cleanly on navigation. Default: nothing.

const MastheadSlotContext = createContext<HTMLElement | null>(null)
export const MastheadSlotProvider = MastheadSlotContext.Provider

/**
 * MastheadAction — register this tab's primary CTA into the shell masthead.
 *
 * P2 usage:
 *   import { MastheadAction } from '@/components/settings/shell-slots'
 *   <MastheadAction><Button>Invite member</Button></MastheadAction>
 *
 * Renders null until the shell's slot has mounted; portals thereafter. Only one
 * tab is mounted at a time, so there is exactly one masthead action per view.
 */
export function MastheadAction({ children }: { children: ReactNode }) {
  const slot = useContext(MastheadSlotContext)
  if (!slot) return null
  return createPortal(children, slot)
}

// ─── SaveBar slot ─────────────────────────────────────────────────────────
//
// The floating SettingsSaveBar docks bottom-center of the *content column*
// (spec §2.4), not the viewport. The shell renders a sticky, centered mount
// node inside the content column and exposes it here; SettingsSaveBar portals
// its bar into it (falling back to document.body if used outside the shell).

const SaveBarSlotContext = createContext<HTMLElement | null>(null)
export const SaveBarSlotProvider = SaveBarSlotContext.Provider
export function useSaveBarSlot(): HTMLElement | null {
  return useContext(SaveBarSlotContext)
}
