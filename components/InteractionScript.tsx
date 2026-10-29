'use client'

import { useEffect } from 'react'
import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { isInteractionCaptureRoute } from '@/lib/auth/appRoutes'

/**
 * Interaction capture — the optional companion (11-09-2026). Records the label
 * of a clicked control, how MUCH was copied (never the text) and a form's field
 * count (never a value, never a field name).
 *
 * Loaded on the signed-out pages only (isInteractionCaptureRoute): inside the
 * app a control's label can be a site or team name.
 *
 * 🔑 data-no-outbound on the CORE tag (app/layout.tsx) has no companion
 * equivalent: the companion deliberately leaves outbound links alone, so one
 * click never becomes two events, and the 08-09 ruling that Pulse must not
 * record customers' destinations is unaffected by this tag.
 * It carries no data-domain: it calls the core through window.pulse.
 *
 * 🔴 LOADING IS NOT THE WHOLE FENCE (security note 20-10-2026, item 2). The tag
 * decides where the companion LOADS, but a loaded script stays for the life of
 * the tab: open /login, sign in, and a client-side navigation into the app
 * keeps its document-level listeners. They skip any target with a
 * data-pulse-ignore ancestor, so on every route that is not a capture route the
 * BODY carries it. The body and not the app shell, because the menus, dialogs
 * and palette the app portals into <body> sit outside any shell element.
 * Keyed on the boundary, so it changes only when a navigation crosses it.
 */
export default function InteractionScript() {
  const pathname = usePathname()
  const capture = isInteractionCaptureRoute(pathname)
  useEffect(() => {
    if (capture) return
    document.body.setAttribute('data-pulse-ignore', '')
    return () => document.body.removeAttribute('data-pulse-ignore')
  }, [capture])
  if (!capture) return null
  return <Script defer src="https://js.ciphera.net/script.interactions.js" />
}
