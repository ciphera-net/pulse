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
 * The CTA now renders unconditionally — the buffered-save control lives in the
 * content column's panel footer (option C), not the masthead, so it no longer
 * contends with the tab's primary action.
 */
export function MastheadAction({ children }: { children: ReactNode }) {
  const slot = useContext(MastheadSlotContext)
  if (!slot) return null
  return createPortal(children, slot)
}

// ─── Panel-footer save slot ────────────────────────────────────────────────
//
// Owner-chosen save model (option C): the buffered-save control is a full-
// column-width footer strip rendered at the END of the settings content column,
// styled as panel anatomy and pinned with `sticky bottom-0`. The shell renders a
// `display:contents` mount node as the last flow child of the content column;
// `SettingsSaveBar` portals its strip into it. Because the mount node has no box
// of its own, the strip's containing block is the tall content column — the
// prerequisite for `sticky bottom-0` to hold across a long scroll (a tight
// wrapper would give the strip no room to travel and the pin would be inert).

const SaveSlotContext = createContext<HTMLElement | null>(null)
export const SaveSlotProvider = SaveSlotContext.Provider
export function useSaveSlot(): HTMLElement | null {
  return useContext(SaveSlotContext)
}
