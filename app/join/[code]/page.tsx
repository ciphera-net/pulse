'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useParams } from 'next/navigation'
import { Spinner } from '@ciphera-net/facet'
import { ID_API_URL } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/context'
import { acceptInviteLink, switchContext, InviteLinkInfo } from '@/lib/api/organization'
import { setSessionAction } from '@/app/actions/auth'
import { initiateOAuthFlow, initiateSignupFlow } from '@/lib/api/oauth'
import { ApiError } from '@/lib/api/client'

type PageState =
  | { type: 'loading' }
  | { type: 'valid'; info: InviteLinkInfo }
  | { type: 'already_member'; orgName: string }
  | { type: 'expired'; reason: string }
  | { type: 'not_found' }

/** Fetches public invite link details by code (unauthenticated). */
async function getPublicInviteLink(code: string): Promise<InviteLinkInfo> {
  const res = await fetch(`${ID_API_URL}/api/v1/invite-links/${code}`)
  if (res.status === 410) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.reason || 'expired')
  }
  if (!res.ok) throw new Error('NOT_FOUND')
  return res.json()
}

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
}

function JoinContent() {
  const params = useParams<{ code: string }>()
  const code = params.code
  const { user, loading: authLoading } = useAuth()

  const [pageState, setPageState] = useState<PageState>({ type: 'loading' })
  const [joining, setJoining] = useState(false)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (!code) {
      setPageState({ type: 'not_found' })
      return
    }

    getPublicInviteLink(code)
      .then((info) => setPageState({ type: 'valid', info }))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'NOT_FOUND'
        if (msg === 'NOT_FOUND') {
          setPageState({ type: 'not_found' })
        } else {
          setPageState({ type: 'expired', reason: msg })
        }
      })
  }, [code])

  const handleJoin = async () => {
    if (joining || submittingRef.current || pageState.type !== 'valid') return
    submittingRef.current = true

    if (!user) {
      localStorage.setItem('pulse_auth_return_to', `/join/${code}`)
      initiateOAuthFlow()
      return
    }

    setJoining(true)
    try {
      const result = await acceptInviteLink(code)
      try {
        const { access_token } = await switchContext(result.organization_id)
        await setSessionAction(access_token)
      } catch {
        // Context switch is best-effort; proceed to dashboard regardless
      }
      window.location.href = '/'
    } catch (err: unknown) {
      const apiErr = err as ApiError
      if (apiErr.status === 401) {
        localStorage.setItem('pulse_auth_return_to', `/join/${code}`)
        initiateOAuthFlow()
      } else if (apiErr.status === 409) {
        const orgName = pageState.info.organization_name
        setPageState({ type: 'already_member', orgName })
      } else if (apiErr.status === 410) {
        const reason = (apiErr.data as { reason?: string })?.reason || 'expired'
        setPageState({ type: 'expired', reason })
      } else {
        // Surface as expired with a generic reason rather than swallowing silently
        setPageState({ type: 'expired', reason: 'This invite link is no longer available.' })
      }
    } finally {
      submittingRef.current = false
      setJoining(false)
    }
  }

  const handleSignup = () => {
    if (!code) return
    localStorage.setItem('pulse_auth_return_to', `/join/${code}`)
    initiateSignupFlow()
  }

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (pageState.type === 'loading' || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="w-6 h-6 text-neutral-500" />
          <p className="text-sm text-neutral-500">Validating invite link&hellip;</p>
        </div>
      </div>
    )
  }

  // ── Not found ────────────────────────────────────────────────────────────────

  if (pageState.type === 'not_found') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-8 space-y-5">
          <div className="flex items-center justify-center w-12 h-12 rounded-full border bg-red-950 border-red-900 mx-auto">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-base font-semibold text-white">Link not found</h1>
            <p className="text-sm text-neutral-400">This invite link does not exist or has been removed.</p>
          </div>
          <a
            href="/"
            className="block w-full rounded-xl bg-neutral-800 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-neutral-700 transition-colors"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    )
  }

  // ── Expired / revoked / exhausted ────────────────────────────────────────────

  if (pageState.type === 'expired') {
    const { reason } = pageState
    const reasonMap: Record<string, string> = {
      expired: 'This invite link has expired.',
      revoked: 'This invite link has been revoked by an admin.',
      exhausted: 'This invite link has reached its maximum number of uses.',
    }
    const message = reasonMap[reason] ?? reason
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-8 space-y-5">
          <div className="flex items-center justify-center w-12 h-12 rounded-full border bg-amber-950 border-amber-900 mx-auto">
            <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-base font-semibold text-white">Invite link unavailable</h1>
            <p className="text-sm text-neutral-400">{message}</p>
          </div>
          <a
            href="/"
            className="block w-full rounded-xl bg-neutral-800 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-neutral-700 transition-colors"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    )
  }

  // ── Already a member ─────────────────────────────────────────────────────────

  if (pageState.type === 'already_member') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-8 space-y-5">
          <div className="flex items-center justify-center w-12 h-12 rounded-full border bg-green-950 border-green-900 mx-auto">
            <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-base font-semibold text-white">You&apos;re already a member</h1>
            <p className="text-sm text-neutral-400">
              You&apos;re already part of <span className="text-white font-medium">{pageState.orgName}</span>.
            </p>
          </div>
          <a
            href="/"
            className="block w-full rounded-xl bg-brand-orange px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-orange/90 transition-colors"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    )
  }

  // ── Valid ─────────────────────────────────────────────────────────────────────

  const { info } = pageState

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-base font-semibold text-white">You&apos;ve been invited</h1>
          <p className="text-sm text-neutral-400">
            Join <span className="text-white font-medium">{info.organization_name}</span> on Pulse.
          </p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-800/40 p-4 space-y-3">
          <div>
            <div className="text-xs text-neutral-500 mb-0.5">Organisation</div>
            <div className="text-sm font-medium text-white">{info.organization_name}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">Role</div>
            <span className="inline-flex items-center rounded-full bg-brand-orange/10 text-brand-orange px-2.5 py-0.5 text-xs font-medium">
              {roleLabel(info.role)}
            </span>
          </div>
          {user && (
            <div>
              <div className="text-xs text-neutral-500 mb-0.5">Signing in as</div>
              <div className="text-sm font-medium text-white">{user.email}</div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <button
            onClick={handleJoin}
            disabled={joining}
            className="w-full rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-orange/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {joining
              ? 'Joining\u2026'
              : user
              ? `Join ${info.organization_name}`
              : 'Sign in to join'}
          </button>

          {!user && (
            <div className="text-center space-y-1">
              <p className="text-xs text-neutral-500">
                You&apos;ll be redirected to sign in, then brought back here automatically.
              </p>
              <button
                onClick={handleSignup}
                className="text-xs text-neutral-400 hover:text-white transition-colors underline underline-offset-2"
              >
                Don&apos;t have an account? Sign up
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <Spinner className="w-6 h-6 text-neutral-500" />
      </div>
    }>
      <JoinContent />
    </Suspense>
  )
}
