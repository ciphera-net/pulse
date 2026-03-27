'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { Lock, ShieldCheck } from '@phosphor-icons/react'
import { initMollie, getMollie, MOLLIE_FIELD_STYLES, type MollieComponent } from '@/lib/mollie'
import { createEmbeddedCheckout } from '@/lib/api/billing'

interface PaymentFormProps {
  plan: string
  interval: string
  limit: number
  country: string
  vatId: string
}

const mollieFieldBase =
  'w-full rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-3 h-[48px] transition-all focus-within:ring-1 focus-within:ring-brand-orange focus-within:border-brand-orange'

export default function PaymentForm({ plan, interval, limit, country, vatId }: PaymentFormProps) {
  const router = useRouter()

  const [mollieReady, setMollieReady] = useState(false)
  const [mollieError, setMollieError] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const componentsRef = useRef<Record<string, MollieComponent | null>>({
    cardHolder: null,
    cardNumber: null,
    expiryDate: null,
    verificationCode: null,
  })

  const [scriptLoaded, setScriptLoaded] = useState(false)

  // Mount Mollie components AFTER both script loaded AND DOM elements exist
  useEffect(() => {
    if (!scriptLoaded) return

    // Small delay to ensure DOM elements are painted
    const timer = setTimeout(() => {
      const mollie = initMollie()
      if (!mollie) {
        setMollieError(true)
        return
      }

      try {
        const fields: Array<{ type: string; selector: string; placeholder?: string }> = [
          { type: 'cardHolder', selector: '#mollie-card-holder', placeholder: 'John Doe' },
          { type: 'cardNumber', selector: '#mollie-card-number', placeholder: '1234 5678 9012 3456' },
          { type: 'expiryDate', selector: '#mollie-card-expiry', placeholder: 'MM / YY' },
          { type: 'verificationCode', selector: '#mollie-card-cvc', placeholder: 'CVC' },
        ]

        for (const { type, selector, placeholder } of fields) {
          const el = document.querySelector(selector) as HTMLElement | null
          if (!el) {
            setMollieError(true)
            return
          }
          const opts: Record<string, unknown> = { styles: MOLLIE_FIELD_STYLES }
          if (placeholder) opts.placeholder = placeholder
          const component = mollie.createComponent(type, opts)
          component.mount(el)
          component.addEventListener('change', (event: unknown) => {
            const e = event as { error?: string }
            setCardErrors((prev) => {
              const next = { ...prev }
              if (e.error) next[type] = e.error
              else delete next[type]
              return next
            })
          })
          componentsRef.current[type] = component
        }

        setMollieReady(true)
      } catch (err) {
        console.error('Mollie mount error:', err)
        setMollieError(true)
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [scriptLoaded])

  // Cleanup Mollie components on unmount
  useEffect(() => {
    return () => {
      Object.values(componentsRef.current).forEach((c) => {
        try { c?.unmount() } catch { /* DOM already removed */ }
      })
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    setSubmitted(true)
    e.preventDefault()
    setFormError(null)
    if (!country) {
      setFormError('Please select your country')
      return
    }

    const mollie = getMollie()
    if (!mollie) {
      setFormError('Payment system not loaded. Please refresh.')
      return
    }

    setSubmitting(true)
    try {
      const { token, error } = await mollie.createToken()
      if (error || !token) {
        setFormError(error?.message || 'Invalid card details.')
        setSubmitting(false)
        return
      }

      const result = await createEmbeddedCheckout({
        plan_id: plan,
        interval: interval,
        limit,
        country,
        vat_id: vatId || undefined,
        card_token: token,
      })

      if (result.status === 'success') router.push('/checkout?status=success')
      else if (result.status === 'pending' && result.redirect_url)
        window.location.href = result.redirect_url
    } catch (err) {
      setFormError((err as Error)?.message || 'Payment failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Script
        src="https://js.mollie.com/v1/mollie.js"
        onLoad={() => setScriptLoaded(true)}
        onError={() => setMollieError(true)}
      />

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-neutral-800 bg-neutral-900/50 backdrop-blur-xl p-6"
      >
        <h2 className="text-lg font-semibold text-white mb-6">Payment details</h2>

        {/* Cardholder name */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-neutral-300 mb-1.5">Cardholder name</label>
          <div className="overflow-hidden transition-all duration-300" style={{ height: mollieReady ? '48px' : '0px' }}>
            <div id="mollie-card-holder" className={mollieFieldBase} />
          </div>
          {!mollieReady && <div className={`${mollieFieldBase} bg-neutral-800/30`} />}
          {submitted && cardErrors.cardHolder && (
            <p className="mt-1 text-xs text-red-400">{cardErrors.cardHolder}</p>
          )}
        </div>

        {/* Card number */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-neutral-300 mb-1.5">Card number</label>
          <div className="overflow-hidden transition-all duration-300" style={{ height: mollieReady ? '48px' : '0px' }}>
            <div id="mollie-card-number" className={mollieFieldBase} />
          </div>
          {!mollieReady && <div className={`${mollieFieldBase} bg-neutral-800/30`} />}
          {submitted && cardErrors.cardNumber && (
            <p className="mt-1 text-xs text-red-400">{cardErrors.cardNumber}</p>
          )}
        </div>

        {/* Expiry & CVC */}
        <div className="mb-4 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5">Expiry date</label>
            <div className="overflow-hidden transition-all duration-300" style={{ height: mollieReady ? '48px' : '0px' }}>
              <div id="mollie-card-expiry" className={mollieFieldBase} />
            </div>
            {!mollieReady && <div className={`${mollieFieldBase} bg-neutral-800/30`} />}
            {submitted && cardErrors.expiryDate && (
              <p className="mt-1 text-xs text-red-400">{cardErrors.expiryDate}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5">CVC</label>
            <div className="overflow-hidden transition-all duration-300" style={{ height: mollieReady ? '48px' : '0px' }}>
              <div id="mollie-card-cvc" className={mollieFieldBase} />
            </div>
            {!mollieReady && <div className={`${mollieFieldBase} bg-neutral-800/30`} />}
            {submitted && cardErrors.verificationCode && (
              <p className="mt-1 text-xs text-red-400">{cardErrors.verificationCode}</p>
            )}
          </div>
        </div>

        {/* Form / API errors */}
        {formError && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {formError}
          </div>
        )}

        {/* Mollie fallback */}
        {mollieError && (
          <div className="mb-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-sm text-yellow-400">
            Card fields could not load.{' '}
            <a
              href={`/checkout?plan=${plan}&interval=${interval}&limit=${limit}&fallback=1`}
              className="underline hover:text-yellow-300"
            >
              Use the hosted checkout instead
            </a>
            .
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || !mollieReady}
          className="w-full rounded-lg bg-brand-orange px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-orange/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Processing...' : 'Start free trial'}
        </button>

        {/* Trust signals */}
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
    </>
  )
}
