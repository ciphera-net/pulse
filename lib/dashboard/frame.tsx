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

// The frame's class names are plain strings in a module of their own (./frameClasses), because a file the SERVER
// draws needs them too (the dashboard's skeleton), and the server cannot read a value out of a client-only module
// such as this one. They are passed on here, so a block imports everything about the frame from one place.
export { FRAME_SURFACE, FRAME_CARD, FRAME_CARD_BODY, FRAME_CARD_NAME, FRAME_CARD_NOTE } from './frameClasses'

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
