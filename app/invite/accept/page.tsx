'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Spinner } from '@ciphera-net/ui'
import { ID_API_URL } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/context'
import { acceptInvitation } from '@/lib/api/organization'
import { initiateOAuthFlow } from '@/lib/api/oauth'

/** Fetches public invitation details by token (unauthenticated). */
async function getPublicInvitation(token: string) {
  const res = await fetch(`${ID_API_URL}/api/v1/invites?token=${token}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message || data.error || 'Invalid or expired invitation')
  }
  return res.json() as Promise<{ organization_name: string; email: string; role: string }>
}

function InviteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const { user, loading: authLoading } = useAuth()

  const [loading, setLoading] = useState(true)
  const [invite, setInvite] = useState<{ organization_name: string; email: string; role: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('Missing invitation token')
      setLoading(false)
      return
    }

    getPublicInvitation(token)
      .then((data) => setInvite(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Invalid or expired invitation'))
      .finally(() => setLoading(false))
  }, [token])

  const submittingRef = useRef(false)

  const handleAccept = async () => {
    if (!token || accepting || submittingRef.current) return
    submittingRef.current = true

    if (!user) {
      // Store the return path so the OAuth callback redirects back here after login
      localStorage.setItem('pulse_auth_return_to', `/invite/accept?token=${encodeURIComponent(token)}`)
      initiateOAuthFlow()
      return
    }

    setAccepting(true)
    try {
      await acceptInvitation(token)
      // Hard reload to force JWT refresh with new org context
      window.location.href = '/'
    } catch (err: unknown) {
      const apiErr = err as { status?: number }
      if (apiErr.status === 401) {
        localStorage.setItem('pulse_auth_return_to', `/invite/accept?token=${encodeURIComponent(token)}`)
        initiateOAuthFlow()
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to accept invitation'
        setError(msg)
      }
    } finally {
      submittingRef.current = false
      setAccepting(false)
    }
  }

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="w-6 h-6 text-neutral-500" />
          <p className="text-sm text-neutral-500">Loading invitation&hellip;</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-8 space-y-4">
          <h1 className="text-base font-semibold text-white">Invitation unavailable</h1>
          <p className="text-sm text-neutral-400">This invitation has expired or is no longer valid.</p>
          <p className="text-sm text-red-400">{error}</p>
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

  if (!invite) return null

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-base font-semibold text-white">Accept invitation</h1>
          <p className="text-sm text-neutral-400">
            You&apos;ve been invited to join {invite.organization_name} on Pulse.
          </p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-800/40 p-4 space-y-3">
          <div>
            <div className="text-xs text-neutral-500 mb-0.5">Email</div>
            <div className="text-sm font-medium text-white">{invite.email}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-0.5">Role</div>
            <div className="text-sm font-medium capitalize text-white">{invite.role}</div>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-orange/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {accepting ? 'Accepting\u2026' : user ? 'Accept Invitation' : 'Sign in to Accept'}
          </button>

          {!user && (
            <p className="text-xs text-neutral-500 text-center">
              You&apos;ll be redirected to sign in, then brought back here automatically.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function InviteAcceptPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <Spinner className="w-6 h-6 text-neutral-500" />
      </div>
    }>
      <InviteContent />
    </Suspense>
  )
}
