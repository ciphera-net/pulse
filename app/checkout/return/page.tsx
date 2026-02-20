'use client'

/**
 * Return page after Embedded Checkout.
 * Stripe redirects here with ?session_id={CHECKOUT_SESSION_ID}.
 * Fetches session status and redirects to dashboard on success.
 */

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getCheckoutSessionStatus } from '@/lib/api/billing'
import { LoadingOverlay } from '@ciphera-net/ui'
import Link from 'next/link'

export default function CheckoutReturnPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const [status, setStatus] = useState<'loading' | 'complete' | 'open' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')

  useEffect(() => {
    if (!sessionId) {
      setStatus('error')
      setErrorMessage('Missing session ID')
      return
    }

    let cancelled = false

    async function check() {
      try {
        const data = await getCheckoutSessionStatus(sessionId!)
        if (cancelled) return

        if (data.status === 'complete') {
          setStatus('complete')
          router.replace('/')
          return
        }

        if (data.status === 'open') {
          setStatus('open')
          setErrorMessage('Payment was not completed. You can try again.')
          return
        }

        setStatus('error')
        setErrorMessage('Unexpected session status. Please contact support if you were charged.')
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setErrorMessage((err as Error)?.message || 'Failed to verify payment')
      }
    }

    check()
    return () => { cancelled = true }
  }, [sessionId, router])

  if (status === 'loading') {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Verifying your payment…" />
  }

  if (status === 'complete') {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Redirecting to dashboard…" />
  }

  return (
    <div className="min-h-screen pt-24 px-4 flex flex-col items-center justify-center gap-6">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
        {status === 'open' ? 'Payment not completed' : 'Something went wrong'}
      </h1>
      <p className="text-neutral-600 dark:text-neutral-400 text-center max-w-md">
        {errorMessage}
      </p>
      <div className="flex gap-4">
        <Link
          href="/pricing"
          className="px-4 py-2 rounded-lg bg-brand-orange text-white hover:opacity-90 font-medium"
        >
          Back to pricing
        </Link>
        <Link
          href="/"
          className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 font-medium"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  )
}
