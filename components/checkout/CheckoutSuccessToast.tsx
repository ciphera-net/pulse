'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

/**
 * Shows a success toast when redirected from Stripe Checkout with success=true,
 * then clears the query params from the URL.
 */
export default function CheckoutSuccessToast() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const success = searchParams.get('success')
    if (success === 'true') {
      toast.success('Thank you for subscribing! Your subscription is now active.')
      const url = new URL(window.location.href)
      url.searchParams.delete('success')
      url.searchParams.delete('session_id')
      window.history.replaceState({}, '', url.pathname + url.search)
    }
  }, [searchParams])

  return null
}
