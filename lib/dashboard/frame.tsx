'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useFeature } from '@/lib/features'

// ---------------------------------------------------------------------------
// The new dashboard frame (beta, 14-11-2026): tight cards 12 px apart, Sources beside Pages, every block one
// size, no section titles, the toolbar staying at the top, glass on the blocks.
//
// The dashboard surface decides it from the beta flag and PROVIDES it. A block reads `useDashboardFrame()` and
// never the flag itself, so a block mounted anywhere else keeps today's look, and the day the frame goes to
// everyone the provider's value is the only line that changes.
// ---------------------------------------------------------------------------

/** The Unleash flag, exactly as pulse-backend lists it in /me. */
export const NEW_DASHBOARD_FLAG = 'new-dashboard'

const DashboardFrameContext = createContext(false)

export function DashboardFrameProvider({ children }: { children: ReactNode }) {
  return <DashboardFrameContext.Provider value={true}>{children}</DashboardFrameContext.Provider>
}

/** True inside the new frame. */
export function useDashboardFrame(): boolean {
  return useContext(DashboardFrameContext)
}

/** Glass on a surface of the frame (styles/globals.css, `.glass-block`). The hairline is the ink at 8%, so it follows the theme. */
export const FRAME_SURFACE = 'glass-block rounded-none border border-white/[0.08]'

/** A block in the frame: glass, and ONE size (442 px, today's height of a block with seven rows and its pager). */
export const FRAME_CARD = `${FRAME_SURFACE} p-6 h-[442px] flex flex-col min-w-0`

/**
 * A block's body in the frame. `min-h-0` on purpose: the block's height is fixed, so the body takes what the
 * header and the footer leave (300 px with a pager, which is exactly seven rows; 338 px without one) and must
 * never push back.
 */
export const FRAME_CARD_BODY = 'flex-1 min-h-0'

/**
 * A block's name where its tabs do not say it (Outbound), or stand in for it (Events). 34 px and 4 px under it:
 * the box of a tab row as measured (the small Switcher is 34 px, its wrapper adds `pb-1`), so every block's header
 * is the same 38 px and the rows of two blocks side by side start on one line. At 32 px the Events block's rows sat
 * 2 px above Outbound's.
 */
export const FRAME_CARD_NAME = 'mb-1 inline-flex h-[34px] shrink-0 items-center whitespace-nowrap text-sm font-medium text-white'

/**
 * The foot of a block in the frame: its note and its pager on ONE row. Stacked, as outside the frame, a block
 * with both would be 28 px taller than its neighbours. Empty (no note, one page) it takes no room at all.
 */
export function CardFooter({ children }: { children: ReactNode }) {
  const frame = useDashboardFrame()
  if (!frame) return <>{children}</>
  return (
    <div className="mt-3.5 flex h-6 shrink-0 items-center gap-3 empty:hidden" data-testid="card-footer">
      {children}
    </div>
  )
}

/** A note in the frame's footer row: one line, cut with an ellipsis when the pager needs the room. */
export const FRAME_CARD_NOTE = 'min-w-0 flex-1 truncate text-[11px] text-neutral-500'

/**
 * True when pop-ups and menus are glass: for a team that has the new dashboard. It reads the FLAG, not the frame's
 * context, on purpose: the date menu, the filter and What's new are the same pop-ups on every page, and one that is
 * glass over the dashboard and solid over Pages would read as a fault. On a public page (the demo, a share link)
 * it is false, as every beta is there.
 */
export function useGlassPanels(): boolean {
  return useFeature(NEW_DASHBOARD_FLAG) === true
}

/**
 * The surface of a pop-up or a menu: glass (styles/globals.css, `.glass-panel`) or today's solid popover. Glass only
 * on an element drawn in a portal: inside a glass block there is nothing behind it to blur.
 */
export function panelSurface(glass: boolean): string {
  return glass ? 'glass-panel border border-white/[0.08]' : 'bg-popover border border-border'
}
