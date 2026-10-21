'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { isFramed } from '@/lib/scope/embed'

/**
 * Pulse's own tracking tag (pulse.ciphera.net, tracked by Pulse), loaded in a top-level
 * window only.
 *
 * pulse.ciphera.net's home page frames /demo in its hero, at idle, for every desktop visitor.
 * A tracker in that frame would record a second pageview, /demo, for every home view: a visit
 * that never touched the demo would stop being a bounce, gain a page and exit on /demo, and the
 * home page's time on page would be capped at the few seconds before the frame booted. So the
 * tag is decided after mount, when the window is known. Nothing changes for a top-level page:
 * next/script injects the tag on the client either way, so it was never in the server HTML.
 *
 * The interaction-capture companion (InteractionScript) needs no guard of its own: it fires
 * only through the core's window.pulse, which a framed page never gets.
 *
 * Outbound-link tracking is OFF on Pulse's own install. A customer clicking a link from inside
 * their dashboard would otherwise record THEIR destination — their own pages, and the sites
 * they link out to — into Pulse's own analytics (owner ruling, 08-09-2026). File downloads
 * stay on: they resolve to Ciphera's own domains and carry no customer destination.
 */
export default function PulseOwnTracker() {
  const [load, setLoad] = useState(false)
  useEffect(() => {
    setLoad(!isFramed())
  }, [])
  if (!load) return null
  return (
    <Script
      defer
      data-domain="pulse.ciphera.net"
      data-no-outbound=""
      src="https://js.ciphera.net/script.js"
    />
  )
}
