'use client'

import { useState, useEffect, useRef } from 'react'
import { Lock, ShieldCheck } from '@phosphor-icons/react'
import { createCheckoutSession } from '@/lib/api/billing'
import { cdnUrl } from '@/lib/cdn'

const PAYMENT_METHODS = [
  { id: 'creditcard', label: 'Cards', icons: ['/icons/payment/visa.svg', '/icons/payment/mastercard.svg'] },
  { id: 'bancontact', label: 'Bancontact', icons: ['/icons/payment/bancontact.svg'] },
  { id: 'directdebit', label: 'SEPA', icons: ['/icons/payment/sepa.svg'] },
  { id: 'ideal', label: 'iDEAL', icons: ['/icons/payment/ideal.svg'] },
  { id: 'applepay', label: 'Apple Pay', icons: ['/icons/payment/applepay.svg'] },
]


interface PaymentFormProps {
  plan: string
  interval: string
  limit: number
  country: string
  vatId: string
  onSuccess?: () => void
  businessName: string
  billingEmail: string
  address: string
  city: string
  postalCode: string
}

export default function PaymentForm({ plan, interval, limit, country, vatId, businessName, billingEmail, address, city, postalCode }: PaymentFormProps) {
  const [selectedMethod, setSelectedMethod] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Synchronous in-flight guard. `submitting` (React state) re-renders too late
  // to block a second click fired before the re-render commits — a ref flips
  // immediately, closing that race.
  const inFlight = useRef(false)
  const methodRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    // DELIBERATE: re-enable the submit button when the page is restored from
    // bfcache (Back after being redirected to the payment provider). A returning
    // user must be able to retry — do not remove this to "fix" double-submit;
    // the inFlight ref + `submitting` state already guard concurrent submits.
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) { inFlight.current = false; setSubmitting(false) }
    }
    window.addEventListener('pageshow', reset)
    return () => window.removeEventListener('pageshow', reset)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    setFormError(null)

    if (!selectedMethod) {
      setFormError('Please select a payment method')
      return
    }
    if (!country) {
      setFormError('Please select your country')
      return
    }

    if (!businessName.trim() || !billingEmail.trim() || !address.trim() || !city.trim() || !postalCode.trim()) {
      setFormError('Please fill in all billing details')
      return
    }

    inFlight.current = true
    setSubmitting(true)

    try {
      const { url } = await createCheckoutSession({
        plan_id: plan,
        interval,
        limit,
        country,
        vat_id: vatId || undefined,
        method: selectedMethod,
        billing_email: billingEmail,
        business_name: businessName,
        address,
        city,
        postal_code: postalCode,
      })

      window.location.href = url
    } catch (err) {
      inFlight.current = false
      setFormError((err as Error)?.message || 'Payment failed. Please try again.')
      setSubmitting(false)
    }
  }

  const selectMethod = (id: string) => { setSelectedMethod(id); setFormError(null) }

  const onMethodKeyDown = (e: React.KeyboardEvent, index: number) => {
    let target: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = (index + 1) % PAYMENT_METHODS.length
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = (index - 1 + PAYMENT_METHODS.length) % PAYMENT_METHODS.length
    if (target === null) return
    e.preventDefault()
    selectMethod(PAYMENT_METHODS[target].id)
    methodRefs.current[target]?.focus()
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-none bg-card border border-border p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Payment method</h2>

      <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-3 gap-2 mb-5">
        {PAYMENT_METHODS.map((method, i) => {
          const selected = selectedMethod === method.id
          // Roving tabindex: the selected option is the tab stop, or the first
          // option when nothing is selected yet.
          const isTabStop = selected || (!selectedMethod && i === 0)
          return (
            <button
              key={method.id}
              ref={(el) => { methodRefs.current[i] = el }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={method.label}
              tabIndex={isTabStop ? 0 : -1}
              onClick={() => selectMethod(method.id)}
              onKeyDown={(e) => onMethodKeyDown(e, i)}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-none border h-[60px] text-xs transition-all duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange ${
                selected
                  ? 'border-brand-orange bg-brand-orange/5 text-white'
                  : 'border-neutral-700/50 bg-neutral-800/30 text-neutral-400 hover:border-neutral-600'
              } ease-apple`}
            >
              <div className="flex items-center gap-1 bg-white rounded-none px-1.5 py-1">
                {method.icons.map((icon) => (
                  <img key={icon} src={cdnUrl(icon)} alt="" className="h-5 w-auto" />
                ))}
              </div>
              <span>{method.label}</span>
            </button>
          )
        })}
      </div>

      {selectedMethod && (
        <p className="text-sm text-neutral-400 mb-4">
          You&apos;ll be redirected to complete payment securely via {PAYMENT_METHODS.find(m => m.id === selectedMethod)?.label}.
        </p>
      )}

      {formError && (
        <div className="mb-4 rounded-none bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {formError}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !selectedMethod}
        className="w-full rounded-none bg-brand-orange-button px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-button-hover disabled:opacity-50 disabled:cursor-not-allowed ease-apple"
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
