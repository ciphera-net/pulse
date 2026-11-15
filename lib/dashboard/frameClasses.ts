// ---------------------------------------------------------------------------
// The new dashboard frame's class names (beta, 14-11-2026), as plain strings.
//
// NO 'use client' here, on purpose. The server draws the dashboard's skeleton (components/skeletons.tsx is part of
// the server's HTML on the demo and on a settings page's loading state), and a server file that imports a VALUE
// from a client-only module gets a reference it may only pass on: reading it, as a class name is read, throws.
// So the strings live here, lib/dashboard/frame.tsx (client-only: the context, the footer, the flag) passes them
// on to the blocks, and the skeleton's server files import them from this module directly.
// ---------------------------------------------------------------------------

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

/** A note in the frame's footer row: one line, cut with an ellipsis when the pager needs the room. */
export const FRAME_CARD_NOTE = 'min-w-0 flex-1 truncate text-[11px] text-neutral-500'
