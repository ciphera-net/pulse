'use client'

import { useEffect, useState, Suspense, useRef, useCallback } from 'react'
import { reportClientEvent } from '@/lib/utils/clientEvents'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import apiRequest from '@/lib/api/client'
import { exchangeAuthCode, getSessionAction, setSessionAction } from '@/app/actions/auth'
import { setAccessToken, APP_URL } from '@/lib/api/client'
import { AuthErrorState, LoadingOverlay, type AuthErrorType } from '@ciphera-net/facet'
import { safeRedirectUrl } from '@/lib/utils/safe-redirect'
import { claimPendingAuth, forgetAllPendingAuth } from '@/lib/api/oauth-store'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import { cdnUrl } from '@/lib/cdn'
import { ensureDefaultOrganization, shouldProvisionWorkspace, switchContext } from '@/lib/api/organization'
import { resolveLandingTarget } from '@/lib/auth/landing-target'
import { logger } from '@/lib/utils/logger'
import { claimReturnTarget, peekReturnTarget } from '@/lib/auth/return-target'

function AuthCallbackContent() {
  const searchParams = useSearchParams()
  const { login } = useAuth()
  // * A typed error, not a message string. The surface picks its copy and its
  // * controls from the type; nothing downstream inspects message text.
  const [error, setError] = useState<AuthErrorType | null>(null)
  const [restarting, setRestarting] = useState(false)
  const processedRef = useRef(false)
  // * The verifier claimed for this callback. Held so a retry can re-run the
  // * exchange without re-claiming an entry that has already been consumed.
  const verifierRef = useRef<string | null>(null)
  // * The redirect_uri this attempt actually sent at authorize. Held for the same
  // * reason, and never recomputed — see runCodeExchange.
  const redirectUriRef = useRef<string | null>(null)

  // * Where a completed sign-in lands. Extracted so the rescue path below cannot
  // * drift from the success path — both honour a stored return, then ?returnTo.
  // *
  // * 🔴 `fallback` IS THE DESTINATION THIS PAGE RESOLVED, not a default it hopes
  // * is right. Until 08-09-2026 there was none: a fresh signup fell through to
  // * `'/'`, the edge redirected that to `/sites`, and the empty-fleet
  // * placeholder RENDERED before the onboarding wall — a client effect, one
  // * render later — pushed the person into the wizard. They were shown "you
  // * have no sites" by a page already on its way somewhere else.
  // *
  // * A stored return still wins, and still wins over the resolved target: it is
  // * an explicit request (an invite, a deep link) and this page does not know
  // * better. The resolved value only replaces the guess.
  const landInApp = useCallback((fallback?: string | null) => {
    const target = fallback || '/'
    // 🔴 A STORED TARGET EXPIRES (audit §4n). It still outranks the resolved
    // destination — an invite or a deep link is an explicit request — but the
    // slot used to have no lifetime, so a target written days ago by an
    // unrelated visit hijacked the next sign-in, once, and then vanished on
    // read. claimReturnTarget() drops anything older than ten minutes.
    const storedReturn = claimReturnTarget()
    if (storedReturn) {
      window.location.assign(safeRedirectUrl(storedReturn, target))
      return
    }
    window.location.assign(safeRedirectUrl(searchParams.get('returnTo'), target))
  }, [searchParams])

  // * Provision the default workspace, unless this sign-in is on its way to an
  // * invite. Reads the same stored return target landInApp() will consume, and
  // * deliberately does not consume it.
  // *
  // * Answers with the destination the caller should land on, or null when there
  // * is nothing better to say than the old default — a /join arrival, or a
  // * failure the org wall will pick up on the next route.
  const provisionWorkspaceUnlessJoining = useCallback(async (
    sessionRole: string | null | undefined,
  ): Promise<string | null> => {
    // * PEEK, never claim: landInApp() still needs this value, and a read that
    // * spent it here would send every invited person to the default landing
    // * instead of their invite. Storage unreadable is treated as "no invite
    // * pending" rather than skipping provisioning for everybody whose browser
    // * blocks storage — peekReturnTarget() answers null for both.
    const storedReturn = peekReturnTarget()
    const target = storedReturn ?? searchParams.get('returnTo')
    if (!shouldProvisionWorkspace(target)) return null
    try {
      const ensured = await ensureDefaultOrganization()
      // 🔴 AND SWITCH INTO IT BEFORE LANDING. The access token was minted at the
      // exchange, a moment BEFORE this workspace existed, so it carries no
      // org_id. Landing on it makes the destination page discover the mismatch
      // and repair it — switchContext, a new session, router.refresh() — which
      // is a second render the person sees as a flicker on their very first
      // screen (reported by the owner, 08-09-2026: "it flicker a lot").
      // Repairing it here costs the same two calls and happens behind the
      // redirect that is already running.
      const { access_token } = await switchContext(ensured.organization.id)
      const result = await setSessionAction(access_token)
      if (result.success) setAccessToken(access_token)
      // * 🔑 The role AFTER the switch, not before it. The exchange's token was
      // * minted against whatever context the account had a moment ago; the one
      // * that decides whether this person is walled is the one they are landing
      // * with. Falls back to the pre-switch role rather than to nothing —
      // * an absent role is treated as walled, which is the safe side.
      return await resolveLandingTarget({
        orgId: ensured.organization.id,
        role: result.user?.role ?? sessionRole,
        createdWorkspace: ensured.created,
      })
    } catch (e) {
      // * Not fatal, and not silent. The org wall calls this again on the
      // * destination route, and the manual form is still the last resort.
      logger.error('Could not provision a default workspace', e)
      return null
    }
  }, [searchParams])

  // * A callback that cannot complete its own handshake is NOT automatically a
  // * failed sign-in. ID sets its cookies on .ciphera.net before redirecting
  // * here, so the person can already be authenticated while this page has
  // * nothing to exchange — measured 04-09-2026, when a Safari profile lost the
  // * pending attempt from localStorage and a genuinely signed-in new user was
  // * shown "This sign-in link has expired" with no working way forward.
  // *
  // * 🔴 This asks the SERVER whether a session exists; it never infers one, and
  // * it never exchanges an unvalidated code. State validation is untouched: a
  // * missing pending attempt still refuses the exchange. The only thing that
  // * changes is what an ALREADY-authenticated person is shown afterwards.
  const continueIfAlreadySignedIn = useCallback(async (): Promise<boolean> => {
    let session: Awaited<ReturnType<typeof getSessionAction>> = null
    try {
      session = await getSessionAction()
    } catch {
      // * Stale build or unreachable action — no session proven, fall through
      // * to the error surface rather than guessing.
      return false
    }
    if (!session) return false
    forgetAllPendingAuth()
    // * The rescue path lands somebody who is ALREADY signed in, so it resolves
    // * from the session it just proved rather than provisioning anything. It
    // * gets the same destination for the same reason: the flash it would
    // * otherwise cause is identical, and a rescued fresh signup is exactly the
    // * case this path exists for.
    const target = await resolveLandingTarget({ orgId: session.org_id, role: session.role })
    landInApp(target)
    return true
  }, [landInApp])

  const runCodeExchange = useCallback(
    async (codeVerifier: string | null, redirectUri: string) => {
      const code = searchParams.get('code')
      if (!code) return
      let result: Awaited<ReturnType<typeof exchangeAuthCode>>
      try {
        result = await exchangeAuthCode(code, codeVerifier, redirectUri)
      } catch {
        // * Stale build or network error — retryable via a full navigation.
        setError('network')
        return
      }
      if (result.success && result.user) {
        // * The Bearer for everything that follows, /auth/user/me included (S3).
        setAccessToken(result.access_token)
        try {
          const fullProfile = await apiRequest<{ id: string; email: string; display_name?: string; totp_enabled: boolean; org_id?: string; role?: string }>('/auth/user/me')
          login({
            ...fullProfile,
            org_id: result.user.org_id ?? fullProfile.org_id,
            role: result.user.role ?? fullProfile.role,
          })
        } catch {
          login(result.user)
        }
        // * Signed in — every other attempt still on this device is abandoned.
        forgetAllPendingAuth()
        // * Give a brand-new account its workspace before it lands, so nobody
        // * meets a "name your organisation" form before seeing the product.
        // * Awaited on purpose: the org wall runs on the destination route and
        // * would bounce an org-less arrival into the wizard in the meantime.
        // *
        // * 🔴 NOT on the /join path. Someone accepting an invite is about to
        // * belong to somebody else's workspace and must not be handed a stray
        // * one of their own; the server cannot know an invite is pending.
        // * Failure is not fatal — the org wall retries on the next route, and
        // * the manual form is still there behind it.
        const landing = await provisionWorkspaceUnlessJoining(
          result.user.role ?? undefined,
        )
        // * Use full-page navigation (not router.push) so the access_token cookie set
        // * by exchangeAuthCode is guaranteed committed before AuthProvider re-initializes
        // * on the destination route. Eliminates the post-login SWR race where useSites()
        // * fires before cookies are observable and caches an empty/401 result for 30s.
        landInApp(landing)
      } else {
        // * Every failed exchange gets a screen and a trace. Until 05-09-2026 the
        // * 'server' branch instead sent the browser to `/` — the marketing homepage —
        // * on the theory that the exchange had succeeded and only the response was
        // * lost, so the dashboard would work anyway. That was true before S3, when
        // * the apex cookies carried the session regardless. Since S3 the exchange
        // * response IS the session: nothing was written, `/` is public, and the
        // * person saw a homepage, apparently signed out, with no word and no log.
        // *
        // * It was also the DEFAULT outcome, not an edge case: id-backend answers
        // * 400 for every OAuth-protocol failure and the action mapped everything
        // * but 401/403 to 'server'. The modal case — a spent code — now reads as
        // * `stale_attempt`, which is what it is (app/actions/auth.ts).
        // *
        // * 🔴 The raw upstream code goes to telemetry, not the mapped type: a
        // * misconfigured redirect_uri and a spent code render identically, and this
        // * detail is the only thing that tells them apart afterwards.
        reportClientEvent('oauth_exchange_failed', result.upstream ?? result.error)
        setError(result.error as AuthErrorType)
      }
    },
    [searchParams, login, landInApp, provisionWorkspaceUnlessJoining]
  )

  useEffect(() => {
    if (processedRef.current) return

    const code = searchParams.get('code')
    if (!code) {
      // * No code param (stale link, prefetch, or a direct visit) — without an
      // * error the loading overlay would spin forever.
      // * 🔑 Logged distinctly from the missing-attempt case below. Both used to
      // * render the same `stale_attempt` copy with nothing to tell them apart,
      // * which cost a whole investigation on 04-09-2026: "ID never sent a code"
      // * and "this device lost its pending attempt" have different causes, live
      // * in different codebases, and looked identical from the outside.
      // * reportClientEvent, not logger: the browser logger is silenced in production.
      reportClientEvent('oauth_callback_no_code')
      processedRef.current = true
      void continueIfAlreadySignedIn().then((rescued) => {
        if (!rescued) setError('stale_attempt')
      })
      return
    }

    const state = searchParams.get('state')
    let codeVerifier: string | null = null
    // * 🔴 THE redirect_uri IS RESOLVED, NOT RECOMPUTED. id-backend compares the
    // * exchange's value against the one recorded at authorize with Go's `!=` —
    // * no normalisation of any kind — and answers 400 `invalid_grant` on any
    // * difference, which renders here as "This sign-in link has expired". Until
    // * 05-09-2026 this page derived its own value from window.location.origin
    // * while lib/api/oauth.ts had sent a build-time APP_URL, so the two agreed
    // * only by coincidence of the two constants matching. Each branch below
    // * names where its value comes from; none of them guesses.
    let redirectUri: string

    if (state) {
      // * Full OAuth flow (app-initiated). The entry is looked up by the state the
      // * authorization server echoed back, so a concurrent attempt started in
      // * another tab resolves against its own entry instead of clobbering this one.
      const pending = claimPendingAuth(state)
      if (!pending) {
        // * Unknown, forged, expired or already-claimed state. The exchange is
        // * refused here and always — an unvalidated code is never exchanged.
        reportClientEvent('oauth_callback_no_pending_attempt')
        processedRef.current = true
        // * But refusing the exchange is not the same as telling somebody their
        // * sign-in failed. If ID already authenticated them (its cookies are on
        // * .ciphera.net and arrive before this page runs), send them into the
        // * app instead of to a dead end whose only working escape is a link
        // * labelled "Back to the homepage".
        void continueIfAlreadySignedIn().then((rescued) => {
          if (!rescued) setError('stale_attempt')
        })
        return
      }
      codeVerifier = pending.verifier
      // * Case 1 — this attempt stored what it sent. The single source.
      // * Case 2 — an attempt started before this shipped has no stored value.
      // * The code that created it sent APP_URL, so APP_URL is what id-backend
      // * recorded; this is the recovered original, not a guess. The window is
      // * bounded by PENDING_MAX_AGE_MS, so it stops mattering ten minutes
      // * after deploy and this branch can go with the next cleanup.
      redirectUri = pending.redirectUri ?? `${APP_URL.replace(/\/$/, '')}/auth/callback`
    } else {
      // * Case 3 — session flow (from the ID auth hub): the redirect carries a
      // * code but no state, no PKCE verifier, and there is no pending entry to
      // * read, because this app never started the attempt. id-backend recorded
      // * the redirect_uri the hub sent, which is this origin's callback — the
      // * value this page has always sent on this path, and the reason the path
      // * works today. Pending attempts are left alone: another tab may still be
      // * mid-flow and owns its own entry.
      redirectUri = `${window.location.origin}/auth/callback`
    }

    verifierRef.current = codeVerifier
    redirectUriRef.current = redirectUri
    processedRef.current = true
    runCodeExchange(codeVerifier, redirectUri)
  }, [searchParams, runCodeExchange, continueIfAlreadySignedIn])

  const handleRetry = useCallback(() => {
    setError(null)
    // * Re-run the exchange with the verifier AND the redirect_uri already
    // * resolved for this callback. Recomputing either here would reintroduce
    // * exactly the divergence this change removes.
    runCodeExchange(verifierRef.current, redirectUriRef.current ?? '')
  }, [runCodeExchange])

  // * The recovery action that actually repairs a broken sign-in: drop the
  // * abandoned attempts and start a fresh, fully-formed authorization request.
  // * Linking at a bare ID login URL would omit client_id, redirect_uri, state
  // * and the PKCE challenge, landing the person somewhere that cannot sign in.
  const handleRestart = useCallback(() => {
    setRestarting(true)
    forgetAllPendingAuth()
    initiateOAuthFlow()
  }, [])

  if (error) {
    return (
      <AuthErrorState
        type={error}
        primaryAction={{ label: 'Start sign-in again', onClick: handleRestart }}
        secondaryAction={{ label: 'Back to the homepage', onClick: () => window.location.assign('/') }}
        // * Retry re-sends the SAME code. That can only succeed when the request
        // * never reached id-backend — `network`. For everything else the code is
        // * spent or the app is misconfigured, and the honest control is the
        // * primary one: start again, which mints a fresh code through the
        // * pass-through in about a second.
        onRetry={error === 'network' ? handleRetry : undefined}
        busy={restarting}
      />
    )
  }

  // * Use standard Pulse loading screen to make transition to Home seamless
  return <LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Pulse" portal={false} />
}

export default function AuthCallback() {
  return (
    <Suspense fallback={<LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Pulse" portal={false} />}>
      <AuthCallbackContent />
    </Suspense>
  )
}
