'use client'

import { createContext, useContext, type ReactNode } from 'react'

// ---------------------------------------------------------------------------
// The new dashboard frame (14-11-2026; every reader's since 15-11-2026): tight cards 12 px apart, Sources beside
// Pages, every block one size, no section titles, the toolbar staying at the top, glass on the blocks.
//
// The dashboard surface PROVIDES it. A block reads `useDashboardFrame()`, so a block mounted anywhere else (a
// funnel's page, Settings) keeps its own look. It was a beta (the Unleash flag `new-dashboard`) until it went to
// every team on 15-11-2026; public pages (the demo, a share link) draw it since the same evening.
// ---------------------------------------------------------------------------

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
 * True when pop-ups and menus are glass: on every page, for every reader, since the new dashboard went to everyone
 * (15-11-2026). It was the beta flag's answer until then, never the frame's context, because the date menu, the
 * filter and What's new are the same pop-ups on every page, and one that is glass over the dashboard and solid
 * over Pages would read as a fault. Kept as a hook so its callers need no change, and so a page that ever needs a
 * solid panel has one place to say so.
 */
export function useGlassPanels(): boolean {
  return true
}

/**
 * The surface of a pop-up or a menu: glass (styles/globals.css, `.glass-panel`) or today's solid popover. Glass only
 * on an element drawn in a portal: inside a glass block there is nothing behind it to blur.
 */
export function panelSurface(glass: boolean): string {
  return glass ? 'glass-panel border border-white/[0.08]' : 'bg-popover border border-border'
}
