'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, ShieldCheck } from '@phosphor-icons/react'
import { initMollie, getMollie, MOLLIE_FIELD_STYLES, type MollieComponent } from '@/lib/mollie'
import { createEmbeddedCheckout, createCheckoutSession } from '@/lib/api/billing'

interface PaymentFormProps {
  plan: string
  interval: string
  limit: number
  country: string
  vatId: string
}

const PAYMENT_METHODS = [
  { id: 'card', label: 'Card' },
  { id: 'bancontact', label: 'Bancontact' },
  { id: 'ideal', label: 'iDEAL' },
  { id: 'applepay', label: 'Apple Pay' },
  { id: 'googlepay', label: 'Google Pay' },
  { id: 'directdebit', label: 'SEPA' },
]

function MethodLogo({ type }: { type: string }) {
  switch (type) {
    case 'card':
      return (
        <div className="flex items-center gap-1.5">
          <svg viewBox="0 0 38 24" className="h-5 w-auto">
            <circle cx="14" cy="12" r="7" fill="#EB001B" />
            <circle cx="24" cy="12" r="7" fill="#F79E1B" />
            <path d="M19 6.26a7 7 0 0 1 0 11.48 7 7 0 0 1 0-11.48z" fill="#FF5F00" />
          </svg>
        </div>
      )
    case 'bancontact':
      return (
        <svg viewBox="0 0 40 24" className="h-5 w-auto">
          <rect width="40" height="24" rx="3" fill="#005498" />
          <ellipse cx="15" cy="12" rx="7" ry="5.5" fill="#fff" opacity="0.9" />
          <circle cx="29" cy="12" r="5" fill="#FFD800" />
        </svg>
      )
    case 'ideal':
      return (
        <svg viewBox="0 0 40 24" className="h-5 w-auto">
          <rect width="40" height="24" rx="3" fill="#CC0066" />
          <rect x="8" y="5" width="24" height="14" rx="2" fill="#fff" />
          <rect x="12" y="8" width="16" height="8" rx="1" fill="#CC0066" />
        </svg>
      )
    case 'applepay':
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-white">
          <path d="M17.05 12.54c-.02-2.1 1.73-3.12 1.81-3.17-1-1.44-2.54-1.64-3.08-1.66-1.3-.14-2.57.78-3.23.78-.68 0-1.7-.76-2.8-.74-1.43.02-2.77.85-3.5 2.14-1.52 2.6-.39 6.43 1.07 8.54.73 1.03 1.58 2.19 2.7 2.15 1.1-.04 1.5-.7 2.82-.7 1.3 0 1.67.7 2.8.67 1.17-.02 1.9-1.04 2.6-2.08.84-1.2 1.18-2.37 1.19-2.43-.03-.01-2.27-.86-2.29-3.43zM14.95 5.89c.58-.73.98-1.72.87-2.73-.84.04-1.9.58-2.5 1.28-.54.63-1.02 1.66-.9 2.63.95.07 1.93-.48 2.53-1.18z" fill="currentColor" />
        </svg>
      )
    case 'googlepay':
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
      )
    case 'directdebit':
      return (
        <svg viewBox="0 0 40 24" className="h-5 w-auto">
          <rect width="40" height="24" rx="3" fill="#003399" />
          <circle cx="20" cy="12" r="7.5" fill="none" stroke="#FFCC00" strokeWidth="1" />
          <path d="M17.5 9.5h5c.5 0 1 .3 1 .8v1.2h-6v-1.2c0-.5.5-.8 1-.8zm-1 3h7v1.2c0 .5-.5.8-1 .8h-5c-.5 0-1-.3-1-.8v-1.2zm0 0h7" stroke="#FFCC00" strokeWidth="0.8" fill="none" />
        </svg>
      )
    default:
      return null
  }
}

const mollieFieldBase =
  'w-full rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-3 h-[48px] transition-all focus-within:ring-1 focus-within:ring-brand-orange focus-within:border-brand-orange'

export default function PaymentForm({ plan, interval, limit, country, vatId }: PaymentFormProps) {
  const router = useRouter()

  const [selectedMethod, setSelectedMethod] = useState('card')
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
  const mollieInitialized = useRef(false)

  const [scriptLoaded, setScriptLoaded] = useState(false)

  // Mount Mollie components AFTER script loaded
  useEffect(() => {
    if (!scriptLoaded || mollieInitialized.current) return

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

        mollieInitialized.current = true
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
    e.preventDefault()
    setSubmitted(true)
    setFormError(null)

    if (!country) {
      setFormError('Please select your country')
      return
    }

    setSubmitting(true)

    try {
      if (selectedMethod === 'card') {
        const mollie = getMollie()
        if (!mollie) {
          setFormError('Payment system not loaded. Please refresh.')
          setSubmitting(false)
          return
        }

        const { token, error } = await mollie.createToken()
        if (error || !token) {
          setFormError(error?.message || 'Invalid card details.')
          setSubmitting(false)
          return
        }

        const result = await createEmbeddedCheckout({
          plan_id: plan,
          interval,
          limit,
          country,
          vat_id: vatId || undefined,
          card_token: token,
        })

        if (result.status === 'success') router.push('/checkout?status=success')
        else if (result.status === 'pending' && result.redirect_url)
          window.location.href = result.redirect_url
      } else {
        const result = await createCheckoutSession({
          plan_id: plan,
          interval,
          limit,
          country,
          vat_id: vatId || undefined,
          method: selectedMethod,
        })
        window.location.href = result.url
      }
    } catch (err) {
      setFormError((err as Error)?.message || 'Payment failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const isCard = selectedMethod === 'card'

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
        <h2 className="text-lg font-semibold text-white mb-4">Payment method</h2>

        {/* Payment method grid */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {PAYMENT_METHODS.map((method) => {
            const isSelected = selectedMethod === method.id
            return (
              <button
                key={method.id}
                type="button"
                onClick={() => { setSelectedMethod(method.id); setFormError(null) }}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl border h-[52px] text-[10px] font-medium transition-all duration-200 ${
                  isSelected
                    ? 'border-brand-orange bg-brand-orange/5 text-white'
                    : 'border-neutral-700/50 bg-neutral-800/30 text-neutral-400 hover:border-neutral-600 hover:text-neutral-300'
                }`}
              >
                <MethodLogo type={method.id} />
                <span>{method.label}</span>
              </button>
            )
          })}
        </div>

        {/* Card form — always rendered for Mollie mount, animated visibility */}
        <div
          className="overflow-hidden transition-all duration-300 ease-out"
          style={{ maxHeight: isCard ? '400px' : '0px', opacity: isCard ? 1 : 0 }}
        >
          <div className="space-y-4 pb-1">
            {/* Cardholder name */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">Cardholder name</label>
              <div className="overflow-hidden transition-all duration-300" style={{ height: mollieReady ? '48px' : '0px' }}>
                <div id="mollie-card-holder" className={mollieFieldBase} />
              </div>
              {!mollieReady && isCard && <div className={`${mollieFieldBase} bg-neutral-800/30 animate-pulse`} />}
              {submitted && cardErrors.cardHolder && (
                <p className="mt-1 text-xs text-red-400">{cardErrors.cardHolder}</p>
              )}
            </div>

            {/* Card number */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">Card number</label>
              <div className="overflow-hidden transition-all duration-300" style={{ height: mollieReady ? '48px' : '0px' }}>
                <div id="mollie-card-number" className={mollieFieldBase} />
              </div>
              {!mollieReady && isCard && <div className={`${mollieFieldBase} bg-neutral-800/30 animate-pulse`} />}
              {submitted && cardErrors.cardNumber && (
                <p className="mt-1 text-xs text-red-400">{cardErrors.cardNumber}</p>
              )}
            </div>

            {/* Expiry & CVC */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1.5">Expiry date</label>
                <div className="overflow-hidden transition-all duration-300" style={{ height: mollieReady ? '48px' : '0px' }}>
                  <div id="mollie-card-expiry" className={mollieFieldBase} />
                </div>
                {!mollieReady && isCard && <div className={`${mollieFieldBase} bg-neutral-800/30 animate-pulse`} />}
                {submitted && cardErrors.expiryDate && (
                  <p className="mt-1 text-xs text-red-400">{cardErrors.expiryDate}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1.5">CVC</label>
                <div className="overflow-hidden transition-all duration-300" style={{ height: mollieReady ? '48px' : '0px' }}>
                  <div id="mollie-card-cvc" className={mollieFieldBase} />
                </div>
                {!mollieReady && isCard && <div className={`${mollieFieldBase} bg-neutral-800/30 animate-pulse`} />}
                {submitted && cardErrors.verificationCode && (
                  <p className="mt-1 text-xs text-red-400">{cardErrors.verificationCode}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Non-card info */}
        <AnimatePresence>
          {!isCard && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="text-sm text-neutral-400 mb-4 overflow-hidden"
            >
              You&apos;ll be redirected to complete payment securely via {PAYMENT_METHODS.find((m) => m.id === selectedMethod)?.label}.
            </motion.p>
          )}
        </AnimatePresence>

        {/* Form / API errors */}
        {formError && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {formError}
          </div>
        )}

        {/* Mollie fallback */}
        {mollieError && isCard && (
          <div className="mb-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-sm text-yellow-400">
            Card fields could not load. Please select another payment method.
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || (isCard && !mollieReady && !mollieError)}
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
