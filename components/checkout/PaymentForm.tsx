'use client'

import { useState } from 'react'
import { Lock, ShieldCheck } from '@phosphor-icons/react'
import { createCheckoutSession } from '@/lib/api/billing'

interface PaymentFormProps {
  plan: string
  interval: string
  limit: number
  country: string
  vatId: string
  onSuccess?: () => void
}

export default function PaymentForm({ plan, interval, limit, country, vatId }: PaymentFormProps) {
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!country) {
      setFormError('Please select your country')
      return
    }

    setSubmitting(true)

    try {
      const { url } = await createCheckoutSession({
        plan_id: plan,
        interval,
        limit,
        country,
        vat_id: vatId || undefined,
      })

      window.location.href = url
    } catch (err) {
      setFormError((err as Error)?.message || 'Payment failed. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl glass-surface p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Payment</h2>

      <p className="text-sm text-neutral-400 mb-5">
        You&apos;ll be taken to a secure checkout to enter your card details.
      </p>

      {formError && (
        <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {formError}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-brand-orange-button px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-button-hover disabled:opacity-50 disabled:cursor-not-allowed ease-apple"
      >
        {submitting ? 'Processing...' : 'Proceed to payment'}
      </button>

      <div className="mt-4 flex items-center justify-center gap-6 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <Lock weight="fill" className="h-3.5 w-3.5" />
          Secured with SSL
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck weight="fill" className="h-3.5 w-3.5" />
          Cancel anytime
        </span>
      </div>
    </form>
  )
}
