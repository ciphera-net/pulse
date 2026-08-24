'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useInstallStatus } from '@/lib/swr/dashboard'

// ---------------------------------------------------------------------------
// The first-event state, for the setup wizard (design round 24-08-2026,
// direction "c").
//
// WHAT IT REPLACES: /setup/done and /setup/install each ran their own
// hand-rolled poll against the REALTIME endpoint ("is a visitor on the site
// right now"), a different signal from install health and one that does not
// survive a refresh. /setup/done's loop also had no give-up branch: it stopped
// after 90 s and left the spinner and "Waiting for first pageview…" on screen
// forever, saying it was still checking when nothing was.
//
// WHAT IT IS: one presentation over the server's own install status
// (first_event_at / last_event_at, derived server-side), polled by
// useInstallStatus. The hook polls indefinitely with no terminal state, so the
// WATCH WINDOW below is this component's job: once it lapses the copy stops
// implying we are still looking and offers a way to act.
//
// STYLING: colour lives in the dot and nowhere else — the house rule read off
// SyncStatusLine, UptimeStatusLine and FleetCard. No tinted panels. Geometry
// is measured, not eyeballed: 24 px vertical padding, ink optically centred,
// body at max-w-md so it sets in two lines on this column.
// ---------------------------------------------------------------------------

/** How long we claim to be watching before the copy admits we stopped. */
const WATCH_WINDOW_MS = 90_000

const TROUBLESHOOTING_HREF = 'https://help.ciphera.net/docs/pulse/troubleshooting'

interface InstallStateBlockProps {
  siteId: string
  domain: string
  /** Rendered under the copy once the first event has landed. */
  activeAction?: React.ReactNode
  /**
   * Called once, the first time the server reports events arriving. The setup
   * flow uses it to mark the site verified — an observed event IS the
   * confirmation a human used to give by pressing a button.
   */
  onFirstEvent?: () => void
}

function Dot({ tone }: { tone: 'watching' | 'attention' | 'active' }) {
  const color =
    tone === 'active' ? 'bg-emerald-400' : tone === 'attention' ? 'bg-amber-400' : 'bg-neutral-600'
  return <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />
}

export default function InstallStateBlock({
  siteId,
  domain,
  activeAction,
  onFirstEvent,
}: InstallStateBlockProps) {
  const { data, mutate } = useInstallStatus(siteId, { poll: true })
  const status = data?.install_status
  const active = status === 'active'

  // The watch window restarts on "Check again", so the reader gets a fresh
  // 90 s of honest waiting rather than an instantly-stale message.
  const [watchStartedAt, setWatchStartedAt] = useState(() => Date.now())
  const [watchLapsed, setWatchLapsed] = useState(false)

  // Only the timer flips this on; `checkAgain` is the one place that flips it
  // back, so the effect body never sets state synchronously.
  useEffect(() => {
    if (active) return
    const remaining = Math.max(0, WATCH_WINDOW_MS - (Date.now() - watchStartedAt))
    const timer = setTimeout(() => setWatchLapsed(true), remaining)
    return () => clearTimeout(timer)
  }, [watchStartedAt, active])

  // Fire once, on the transition into active — not on every poll that finds it
  // still active.
  const firedRef = useRef(false)
  useEffect(() => {
    if (!active || firedRef.current) return
    firedRef.current = true
    onFirstEvent?.()
  }, [active, onFirstEvent])

  // Nothing is known yet — say nothing rather than guess a state.
  if (!status) return null

  const checkAgain = () => {
    setWatchStartedAt(Date.now())
    setWatchLapsed(false)
    void mutate()
  }

  let tone: 'watching' | 'attention' | 'active' = 'watching'
  let title = 'Waiting for the first event'
  let body = `Load ${domain} in a browser and it confirms here within seconds.`

  if (active) {
    tone = 'active'
    title = 'First event received'
    body = `${domain} is reporting. Your dashboard fills in as visitors arrive.`
  } else if (status === 'stalled') {
    // Events arrived once and then stopped — a different situation from never
    // having reported, and it must not wear the same sentence.
    tone = 'attention'
    title = 'No recent events'
    body = `${domain} has not reported in a while. Usually a removed snippet, an ad blocker, or a Content Security Policy.`
  } else if (watchLapsed) {
    tone = 'attention'
    body = `Nothing from ${domain} in the 90 seconds we watched. Usually an ad blocker, a Content Security Policy, or a domain mismatch.`
  }

  return (
    <div className="mb-10 rounded-none border border-neutral-800 px-6 py-6 text-center">
      <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-neutral-100">
        <Dot tone={tone} />
        {title}
      </p>
      <p className="mx-auto mt-1 max-w-md text-xs text-neutral-400">{body}</p>
      <div className="mt-3 flex items-center justify-center gap-4 text-xs font-medium">
        {active ? (
          activeAction
        ) : (
          <>
            <button
              type="button"
              onClick={checkAgain}
              className="text-brand-orange transition-colors duration-fast ease-apple hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
            >
              Check again
            </button>
            <Link
              href={TROUBLESHOOTING_HREF}
              target="_blank"
              rel="noreferrer"
              className="text-neutral-300 transition-colors duration-fast ease-apple hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
            >
              Troubleshooting guide
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
