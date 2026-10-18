'use client'

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
 */
export default function InteractionScript() {
  const pathname = usePathname()
  if (!isInteractionCaptureRoute(pathname)) return null
  return <Script defer src="https://js.ciphera.net/script.interactions.js" />
}
