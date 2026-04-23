'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { motion, AnimatePresence } from 'framer-motion'
import { TIMING } from '@/lib/motion'
import { Lock, ShieldCheck } from '@phosphor-icons/react'
import { initChargebee } from '@/lib/chargebee'
import { createPaymentIntent, createEmbeddedCheckout, createCheckoutSession } from '@/lib/api/billing'
import { cdnUrl } from '@/lib/cdn'

interface PaymentFormProps {
  plan: string
  interval: string
  limit: number
  country: string
  vatId: string
  onSuccess?: () => void
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
  card: { src: [cdnUrl('/images/payment/visa.svg'), cdnUrl('/images/payment/mastercard.svg')], alt: 'Card' },
  bancontact: { src: cdnUrl('/images/payment/bancontact.svg'), alt: 'Bancontact' },
  ideal: { src: cdnUrl('/images/payment/ideal.svg'), alt: 'iDEAL' },
  applepay: { src: cdnUrl('/images/payment/applepay.svg'), alt: 'Apple Pay' },
  googlepay: { src: cdnUrl('/images/payment/googlepay.svg'), alt: 'Google Pay' },
  directdebit: { src: cdnUrl('/images/payment/sepa.svg'), alt: 'SEPA' },
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

const cardFieldBase =
  'w-full rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-3 h-[48px] transition-all ease-apple focus-within:ring-1 focus-within:ring-brand-orange focus-within:border-brand-orange'

interface ChargebeeCardComponent {
  mount: (selector: string) => void
  tokenize: (additionalData?: Record<string, string>) => Promise<{ token: string }>
  on: (event: string, callback: (state: { complete?: boolean; error?: { message: string }; cardType?: string }) => void) => void
  focus: () => void
  clear: () => void
}

export default function PaymentForm({ plan, interval, limit, country, vatId, onSuccess }: PaymentFormProps) {
  const router = useRouter()

  const [selectedMethod, setSelectedMethod] = useState('')
  const [cardReady, setCardReady] = useState(false)
  const [cardError, setCardError] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const submitRef = useRef<HTMLButtonElement>(null)
  const cardComponentRef = useRef<ChargebeeCardComponent | null>(null)
  const cardInitialized = useRef(false)

  const [scriptLoaded, setScriptLoaded] = useState(false)

  useEffect(() => {
    if (!scriptLoaded || cardInitialized.current) return

    const timer = setTimeout(async () => {
      try {
        const cbInstance = initChargebee()
        if (!cbInstance) {
          setCardError(true)
          return
        }

        await cbInstance.load('components')

        const cardComponent = cbInstance.createComponent('card', {
          placeholder: { number: 'Card number', expiry: 'MM / YY', cvv: 'CVV' },
          style: {
            base: {
              color: '#ffffff',
              fontSize: '15px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontWeight: '400',
              letterSpacing: '0.025em',
              '::placeholder': { color: '#737373' },
            },
            invalid: { color: '#ef4444' },
          },
          icon: true,
        }) as ChargebeeCardComponent

        cardComponent.mount('#chargebee-card')

        cardComponent.on('ready', () => {
          setCardReady(true)
        })

        cardComponent.on('change', (state) => {
          if (state.error?.message) {
            setFieldError(state.error.message)
          } else {
            setFieldError(null)
          }
        })

        cardComponentRef.current = cardComponent
        cardInitialized.current = true
        setCardReady(true)
      } catch (err) {
        console.error('Chargebee card mount error:', err)
        setCardError(true)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [scriptLoaded])

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
        const cardComponent = cardComponentRef.current
        if (!cardComponent) {
          setFormError('Payment system not loaded. Please refresh.')
          setSubmitting(false)
          return
        }

        // Step 1: Create payment intent on the backend
        const { payment_intent } = await createPaymentIntent({ plan_id: plan, interval, limit })

        // Step 2: Authorize with 3DS via Chargebee.js (pass full payment intent object)
        const authorizedIntentId = await new Promise<string>((resolve, reject) => {
          (cardComponent as any).authorizeWith3ds(
            payment_intent,
            {},
            {
              success: (intent: { id: string }) => resolve(intent.id),
              error: (err: any) => {
                const msg = err?.active_payment_attempt?.error_detail?.error_message
                  || err?.message
                  || (typeof err === 'string' ? err.replace(/^[A-Z_]+:\s*/, '').replace(/;?\s*code:.*$/, '').trim() : '')
                  || 'Your card could not be processed. Please try a different card.'
                reject(new Error(msg))
              },
            }
          )
        })

        // Step 3: Create subscription with authorized payment intent
        await createEmbeddedCheckout({
          plan_id: plan,
          interval,
          limit,
          payment_intent_id: authorizedIntentId,
        })

        if (onSuccess) {
          onSuccess()
        } else {
          router.push('/checkout?status=success')
        }
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
        src="https://js.chargebee.com/v2/chargebee.js"
        onLoad={() => setScriptLoaded(true)}
        onError={() => setCardError(true)}
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

        {/* Card form — always rendered for Chargebee mount, animated visibility */}
        <div
          className="overflow-hidden transition-all duration-slow ease-apple"
          style={{ maxHeight: isCard ? '200px' : '0px', opacity: isCard ? 1 : 0 }}
        >
          <div className="space-y-4 pb-1">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">Card details</label>
              <div className="overflow-hidden transition-all duration-slow ease-apple" style={{ height: cardReady ? '48px' : '0px' }}>
                <div id="chargebee-card" className={cardFieldBase} />
              </div>
              {!cardReady && isCard && <div className={`${cardFieldBase} bg-neutral-800/30 animate-skeleton-fade`} />}
              {submitted && fieldError && (
                <p className="mt-1 text-xs text-red-400">{fieldError}</p>
              )}
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

        {/* Card load failure fallback */}
        {cardError && isCard && (
          <div className="mb-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-sm text-yellow-400">
            Card fields could not load. Please select another payment method.
          </div>
        )}

        {/* Submit */}
        <button
          ref={submitRef}
          type="submit"
          disabled={submitting || !selectedMethod || (isCard && !cardReady && !cardError)}
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
