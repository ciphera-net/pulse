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
 *
 * PRECEDENCE: while a SettingsSaveBar owns the masthead (dirty / saving / just-
 * saved), the save cluster is the action area — the CTA yields and renders null,
 * restoring the instant the view is clean again.
 */
export function MastheadAction({ children }: { children: ReactNode }) {
  const slot = useContext(MastheadSlotContext)
  const { active } = useSaveActive()
  if (!slot || active) return null
  return createPortal(children, slot)
}

// ─── Masthead save slot ───────────────────────────────────────────────────
//
// Owner-chosen save model (option D): the buffered-save cluster lives in the
// masthead action area, not a floating bottom dock. The shell renders a mount
// node next to the action slot; `SettingsSaveBar` portals its compact cluster
// (dirty dot + status + Discard/Save + ⌘S) into it.

const MastheadSaveSlotContext = createContext<HTMLElement | null>(null)
export const MastheadSaveSlotProvider = MastheadSaveSlotContext.Provider
export function useMastheadSaveSlot(): HTMLElement | null {
  return useContext(MastheadSaveSlotContext)
}

// ─── Save-active signal ───────────────────────────────────────────────────
//
// The save cluster lives deep inside a tab but the shell needs to know when it
// is present, to (a) hide any MastheadAction CTA and (b) make the masthead
// title+action row sticky-while-dirty. `SettingsSaveBar` reports its occupancy
// through `register`; the shell owns the boolean and exposes it as `active`.

interface SaveActiveValue {
  active: boolean
  register: (active: boolean) => void
}

const SaveActiveContext = createContext<SaveActiveValue>({
  active: false,
  register: () => {},
})
export const SaveActiveProvider = SaveActiveContext.Provider
export function useSaveActive(): SaveActiveValue {
  return useContext(SaveActiveContext)
}
