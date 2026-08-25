'use client'

/**
 * The session takeover — "the vestibule" (direction D, owner-approved
 * 26-08-2026). When a session is dead or being restored on an app route, this
 * is the ONE thing that renders: the ID login's own split anatomy, one door
 * earlier, so leaving and signing back in read as a single room.
 *
 *   left  — brand panel: grid texture, Pulse mark, display statement with ONE
 *           orange line, © footer (hidden below lg; a compact brand row shows
 *           instead)
 *   right — action column: heading, one honest sentence (naming the site the
 *           person was viewing when we know it), full-width orange primary,
 *           hairline "or", dark secondary, one quiet explainer
 *
 * Copy rules: colour lives in the one orange line and the primary button —
 * never a tinted panel. The reassurance is a stated fact ("nothing was lost"),
 * not an apology. Sign in stores the current path in the EXISTING
 * pulse_auth_return_to slot, so the callback returns the person exactly here.
 * Audit: 25-08-2026-lost-rotation-reuse-revocation-and-half-state-chrome.md §5.2, §8.2
 */

import { useEffect, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { cdnUrl } from '@/lib/cdn'
import { reportClientEvent } from '@/lib/utils/clientEvents'
import { useAuth } from '@/lib/auth/context'

export type TakeoverState = 'signed-out' | 'restoring'

/** Durable "this browser has signed in before" signal — set by the auth
 * context on every authenticated session, never cleared by logout. */
export function hasSessionHistory(): boolean {
  if (typeof document === 'undefined') return false
  return /(?:^|;\s*)pulse_had_session=1/.test(document.cookie)
}

function lastSiteLabel(): string | null {
  try {
    return localStorage.getItem('pulse_last_site_label')
  } catch {
    return null
  }
}

const GRID_TEXTURE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px)',
  backgroundSize: '72px 72px',
}

export default function SessionTakeover({ state }: { state: TakeoverState }) {
  const { logout } = useAuth()
  const pathname = usePathname()
  const hadSession = hasSessionHistory()
  const site = useMemo(() => lastSiteLabel(), [])

  useEffect(() => {
    reportClientEvent('session_takeover_rendered', state)
  }, [state])

  const signIn = () => {
    try {
      // * The callback already consumes this slot and returns the person to the
      // * stored path — the room's promise is delivered by existing machinery.
      // * (logout()'s forgetAllPendingAuth clears only oauth_* attempt slots;
      // * this key survives it.)
      localStorage.setItem('pulse_auth_return_to', pathname || '/sites')
    } catch {
      // * Storage unavailable — sign-in still works, landing on /.
    }
    // 🔴 Through logout(), NOT router.push('/login'). The session here is dead
    // * but its COOKIES still exist, and middleware bounces /login back to
    // * /sites whenever an access_token cookie is present — a client-side push
    // * loops right back to this room (measured on staging). logout() clears
    // * the dead cookies server-side first, then full-navigates to /login.
    logout()
  }

  const statement =
    state === 'restoring'
      ? { line1: 'Signed out?', line2: 'One moment.', sub: 'The network dropped mid-session. Pulse is reconnecting on its own.' }
      : hadSession
        ? { line1: 'Signed out.', line2: 'Nothing lost.', sub: 'Your dashboard is exactly where you left it — sign back in and it resumes.' }
        : { line1: 'This is private.', line2: 'Sign in first.', sub: 'Pulse dashboards are visible only to their workspace members.' }

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col lg:flex-row">
      {/* brand panel — the login's left room */}
      <div
        className="hidden lg:flex flex-col w-[39%] min-w-[480px] m-3 border border-[#1c1c1f] bg-[#0d0d0e]"
        style={GRID_TEXTURE}
      >
        <div className="flex items-center gap-3 pt-9 px-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cdnUrl('/pulse_icon_no_margins.png')} alt="" className="w-[30px] h-[30px] object-contain" />
          <span className="text-[17px] font-bold text-neutral-100">Pulse</span>
        </div>
        <div className="flex-1 flex flex-col justify-center px-10 pb-10">
          <p className="text-[40px] leading-[1.12] font-bold tracking-[-0.025em] text-neutral-100 m-0">
            {statement.line1}
            <br />
            <span className="text-brand-orange">{statement.line2}</span>
          </p>
          <p className="text-[15px] leading-relaxed text-neutral-400 mt-5 max-w-[40ch]">{statement.sub}</p>
        </div>
        <p className="text-xs text-neutral-500 px-10 pb-8">© 2026 Ciphera</p>
      </div>

      {/* compact brand row below lg */}
      <div className="lg:hidden flex items-center gap-3 pt-8 px-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cdnUrl('/pulse_icon_no_margins.png')} alt="" className="w-[26px] h-[26px] object-contain" />
        <span className="text-base font-bold text-neutral-100">Pulse</span>
      </div>

      {/* action column */}
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          {state === 'restoring' ? (
            <>
              <h1 className="text-[26px] font-bold tracking-[-0.02em] text-neutral-100 mb-2">
                Restoring your session&hellip;
              </h1>
              <p className="text-sm text-neutral-400 mb-8">
                Retrying automatically. Nothing is lost — your dashboard resumes the moment it reconnects.
              </p>
              <div
                className="h-0.5 bg-[#222226] relative overflow-hidden mb-8"
                role="progressbar"
                aria-label="Reconnecting"
              >
                <div className="absolute inset-y-0 w-1/3 bg-brand-orange motion-safe:animate-[shimmer_1.8s_ease-in-out_infinite] motion-reduce:left-1/3" />
              </div>
              <button
                type="button"
                onClick={signIn}
                className="w-full py-3 bg-[#161618] hover:bg-[#1d1d20] text-neutral-200 text-sm font-semibold transition-colors cursor-pointer"
              >
                Sign in instead
              </button>
            </>
          ) : (
            <>
              <h1 className="text-[26px] font-bold tracking-[-0.02em] text-neutral-100 mb-2">
                {hadSession ? 'Sign back in' : 'Sign in to continue'}
              </h1>
              <p className="text-sm text-neutral-400 mb-8">
                {hadSession ? (
                  site ? (
                    <>
                      Your session ended while this tab was open. You were viewing{' '}
                      <b className="text-neutral-100 font-semibold">{site}</b>.
                    </>
                  ) : (
                    <>Your session ended while this tab was open. Signing in returns you to this page.</>
                  )
                ) : (
                  <>This page belongs to a Pulse workspace. If it&apos;s yours, sign in and it opens right here.</>
                )}
              </p>
              <button
                type="button"
                onClick={signIn}
                className="w-full py-3 bg-brand-orange hover:bg-brand-orange-hover text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                {hadSession ? 'Sign in — back to your dashboard' : 'Sign in'}
              </button>
              <div className="flex items-center gap-3.5 my-5">
                <span className="flex-1 h-px bg-[#222226]" />
                <span className="text-xs text-neutral-500">or</span>
                <span className="flex-1 h-px bg-[#222226]" />
              </div>
              <a
                href="https://ciphera.net"
                className="block w-full py-3 bg-[#161618] hover:bg-[#1d1d20] text-neutral-200 text-sm font-semibold text-center transition-colors"
              >
                Go to ciphera.net
              </a>
              {hadSession && (
                <p className="text-[13px] text-neutral-500 text-center mt-6">
                  Signed out on another device? That ends this tab too — by design.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
