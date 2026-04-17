'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { motion, AnimatePresence } from 'framer-motion'
import { TIMING } from '@/lib/motion'
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

const METHOD_LOGOS: Record<string, { src: string | string[]; alt: string }> = {
  card: { src: ['/images/payment/visa.svg', '/images/payment/mastercard.svg'], alt: 'Card' },
  bancontact: { src: '/images/payment/bancontact.svg', alt: 'Bancontact' },
  ideal: { src: '/images/payment/ideal.svg', alt: 'iDEAL' },
  applepay: { src: '/images/payment/applepay.svg', alt: 'Apple Pay' },
  googlepay: { src: '/images/payment/googlepay.svg', alt: 'Google Pay' },
  directdebit: { src: '/images/payment/sepa.svg', alt: 'SEPA' },
}

function MethodLogo({ type }: { type: string }) {
  const logo = METHOD_LOGOS[type]
  if (!logo) return null

  if (Array.isArray(logo.src)) {
    return (
      <div className="flex items-center gap-1">
        {logo.src.map((s) => (
          <img key={s} src={s} alt="" className="h-6 w-auto rounded-sm" />
        ))}
      </div>
    )
  }

  return <img src={logo.src} alt={logo.alt} className="h-6 w-auto rounded-sm" />
}

const mollieFieldBase =
  'w-full rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-3 h-[48px] transition-all ease-apple focus-within:ring-1 focus-within:ring-brand-orange focus-within:border-brand-orange'

export default function PaymentForm({ plan, interval, limit, country, vatId }: PaymentFormProps) {
  const router = useRouter()

  const [selectedMethod, setSelectedMethod] = useState('')
  const [mollieReady, setMollieReady] = useState(false)
  const [mollieError, setMollieError] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const submitRef = useRef<HTMLButtonElement>(null)
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

    if (!selectedMethod) {
      setFormError('Please select a payment method')
      return
    }

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
        className="rounded-2xl glass-surface p-6"
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
                onClick={() => {
                  setSelectedMethod(method.id)
                  setFormError(null)
                  if (method.id === 'card') {
                    setTimeout(() => submitRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 350)
                  }
                }}
                className={`flex items-center justify-center rounded-xl border h-[44px] transition-all duration-base ${
                  isSelected
                    ? 'border-brand-orange bg-brand-orange/5'
                    : 'border-neutral-700/50 bg-neutral-800/30 hover:border-neutral-600'
                } ease-apple`}
              >
                <MethodLogo type={method.id} />
              </button>
            )
          })}
        </div>

        {/* Card form — always rendered for Mollie mount, animated visibility */}
        <div
          className="overflow-hidden transition-all duration-slow ease-apple"
          style={{ maxHeight: isCard ? '400px' : '0px', opacity: isCard ? 1 : 0 }}
        >
          <div className="space-y-4 pb-1">
            {/* Cardholder name */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">Cardholder name</label>
              <div className="overflow-hidden transition-all duration-slow ease-apple" style={{ height: mollieReady ? '48px' : '0px' }}>
                <div id="mollie-card-holder" className={mollieFieldBase} />
              </div>
              {!mollieReady && isCard && <div className={`${mollieFieldBase} bg-neutral-800/30 animate-skeleton-fade`} />}
              {submitted && cardErrors.cardHolder && (
                <p className="mt-1 text-xs text-red-400">{cardErrors.cardHolder}</p>
              )}
            </div>

            {/* Card number */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">Card number</label>
              <div className="overflow-hidden transition-all duration-slow ease-apple" style={{ height: mollieReady ? '48px' : '0px' }}>
                <div id="mollie-card-number" className={mollieFieldBase} />
              </div>
              {!mollieReady && isCard && <div className={`${mollieFieldBase} bg-neutral-800/30 animate-skeleton-fade`} />}
              {submitted && cardErrors.cardNumber && (
                <p className="mt-1 text-xs text-red-400">{cardErrors.cardNumber}</p>
              )}
            </div>

            {/* Expiry & CVC */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1.5">Expiry date</label>
                <div className="overflow-hidden transition-all duration-slow ease-apple" style={{ height: mollieReady ? '48px' : '0px' }}>
                  <div id="mollie-card-expiry" className={mollieFieldBase} />
                </div>
                {!mollieReady && isCard && <div className={`${mollieFieldBase} bg-neutral-800/30 animate-skeleton-fade`} />}
                {submitted && cardErrors.expiryDate && (
                  <p className="mt-1 text-xs text-red-400">{cardErrors.expiryDate}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1.5">CVC</label>
                <div className="overflow-hidden transition-all duration-slow ease-apple" style={{ height: mollieReady ? '48px' : '0px' }}>
                  <div id="mollie-card-cvc" className={mollieFieldBase} />
                </div>
                {!mollieReady && isCard && <div className={`${mollieFieldBase} bg-neutral-800/30 animate-skeleton-fade`} />}
                {submitted && cardErrors.verificationCode && (
                  <p className="mt-1 text-xs text-red-400">{cardErrors.verificationCode}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Non-card info */}
        <AnimatePresence>
          {selectedMethod && !isCard && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={TIMING}
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
          ref={submitRef}
          type="submit"
          disabled={submitting || !selectedMethod || (isCard && !mollieReady && !mollieError)}
          className="mt-4 w-full rounded-lg bg-brand-orange-button px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-button-hover disabled:opacity-50 disabled:cursor-not-allowed ease-apple"
        >
          {submitting ? 'Processing...' : 'Subscribe'}
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
