'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SPRING, TIMING } from '@/lib/motion'
import Select from '@/components/ui/select'
import useSWR from 'swr'
import { TRAFFIC_TIERS, formatPlanName } from '@/lib/plans'
import { COUNTRY_OPTIONS } from '@/lib/countries'
import { calculateVAT, getPrices, type VATResult } from '@/lib/api/billing'

interface PlanSummaryProps {
  plan: string
  interval: string
  /** Interval toggle is parent-owned state — the same value PaymentForm submits. */
  onIntervalChange: (interval: 'month' | 'year') => void
  limit: number
  country: string
  vatId: string
  onCountryChange: (country: string) => void
  onVatIdChange: (vatId: string) => void
  /** Lifted so PaymentForm can refuse to submit an unverified, edited VAT ID. */
  verifiedVatId: string
  onVerifiedVatIdChange: (v: string) => void
  businessName: string
  onBusinessNameChange: (v: string) => void
  billingEmail: string
  onBillingEmailChange: (v: string) => void
  address: string
  onAddressChange: (v: string) => void
  city: string
  onCityChange: (v: string) => void
  postalCode: string
  onPostalCodeChange: (v: string) => void
  /** Field keys PaymentForm flagged as missing on the last submit attempt. */
  missingFields?: string[]
}

const inputClass =
  'w-full rounded-none border border-neutral-700 bg-neutral-800/50 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-brand-orange focus:border-brand-orange transition-colors ease-apple'

const inputErrorClass =
  'w-full rounded-none border border-red-500/60 bg-neutral-800/50 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-brand-orange focus:border-brand-orange transition-colors ease-apple'

/** Convert VIES ALL-CAPS text to title case (e.g. "SA SODIMAS" → "Sa Sodimas") */
function toTitleCase(s: string) {
  return s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

export default function PlanSummary({ plan, interval, onIntervalChange, limit, country, vatId, onCountryChange, onVatIdChange, verifiedVatId, onVerifiedVatIdChange, businessName, onBusinessNameChange, billingEmail, onBillingEmailChange, address, onAddressChange, city, onCityChange, postalCode, onPostalCodeChange, missingFields = [] }: PlanSummaryProps) {
  const [vatResult, setVatResult] = useState<VATResult | null>(null)
  const [vatLoading, setVatLoading] = useState(false)
  // Set when the VAT-calculation request itself failed (network/backend) — the
  // silent fallback used to be indistinguishable from "no country selected".
  const [vatFailed, setVatFailed] = useState(false)
  const [vatRetryNonce, setVatRetryNonce] = useState(0)

  const { data: prices } = useSWR('plan-prices', getPrices)
  const monthlyCents = prices?.[plan]?.[limit] || 0
  const isYearly = interval === 'year'
  const baseDisplay = isYearly ? (monthlyCents * 11) / 100 : monthlyCents / 100

  const tierLabel =
    TRAFFIC_TIERS.find((t) => t.value === limit)?.label ||
    `${(limit / 1000).toFixed(0)}k`

  const fieldClass = (key: string) => (missingFields.includes(key) ? inputErrorClass : inputClass)

  // Editing the VAT ID after a successful verification invalidates the verified
  // state. This is pure state normalization — it does NOT fetch. Clearing
  // `verifiedVatId` re-runs the single fetch effect below with the un-verified
  // (21%) VAT ID, so there is exactly one fetch path.
  useEffect(() => {
    if (verifiedVatId !== '' && vatId !== verifiedVatId) {
      onVerifiedVatIdChange('')
    }
  }, [vatId, verifiedVatId, onVerifiedVatIdChange])

  // Single, well-ordered VAT fetch path. Two guards prevent an out-of-order
  // response from clobbering a newer one:
  //   1. AbortController — a superseded in-flight request is aborted.
  //   2. Monotonic sequence id — even if an aborted request still resolves
  //      (e.g. it raced past the abort, or the client maps AbortError to a
  //      network error), only the latest request's result is applied.
  const vatSeq = useRef(0)
  useEffect(() => {
    if (!country) { setVatResult(null); setVatLoading(false); setVatFailed(false); return }

    const seq = ++vatSeq.current
    const controller = new AbortController()
    setVatLoading(true)
    setVatFailed(false)

    calculateVAT(
      { plan_id: plan, interval, limit, country, vat_id: verifiedVatId || undefined },
      controller.signal,
    )
      .then((result) => {
        if (seq !== vatSeq.current) return // a newer request superseded this one
        setVatResult(result)
        setVatLoading(false)
      })
      .catch(() => {
        if (seq !== vatSeq.current) return // stale failure — ignore
        setVatResult(null)
        setVatLoading(false)
        setVatFailed(true)
      })

    return () => controller.abort()
  }, [country, interval, verifiedVatId, plan, limit, vatRetryNonce])

  const handleVerifyVatId = () => {
    if (!vatId || !country) return
    onVerifiedVatIdChange(vatId)
    // useEffect on verifiedVatId will trigger the fetch
  }

  const isVatChecked = verifiedVatId !== '' && verifiedVatId === vatId
  const isVatValid = isVatChecked && !!vatResult?.company_name

  return (
    <div className="rounded-none bg-card border border-border p-5 space-y-4 overflow-visible">
      {/* Plan name + interval toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">{formatPlanName(plan)}</h2>
        </div>
        <div className="flex items-center gap-1 p-1 bg-neutral-800/50 rounded-none sm:ml-auto">
          {(['month', 'year'] as const).map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => onIntervalChange(iv)}
              className={`relative px-3.5 py-1.5 text-sm font-medium rounded-none transition-colors duration-base ${
                interval === iv ? 'text-white' : 'text-neutral-400 hover:text-white'
              } ease-apple`}
            >
              {interval === iv && (
                <motion.div
                  layoutId="checkout-interval-bg"
                  className="absolute inset-0 bg-neutral-700 rounded-none"
                  transition={SPRING}
                />
              )}
              <span className="relative z-10">{iv === 'month' ? 'Monthly' : 'Yearly'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Billing details */}
      <div className="space-y-3">
        <div>
          <label htmlFor="billing-business-name" className="block text-sm font-medium text-neutral-300 mb-1.5">Business name</label>
          <input
            id="billing-business-name"
            type="text"
            value={businessName}
            onChange={(e) => onBusinessNameChange(e.target.value)}
            placeholder="Ciphera BV"
            autoComplete="organization"
            aria-invalid={missingFields.includes('business_name') || undefined}
            className={fieldClass('business_name')}
          />
        </div>
        <div>
          <label htmlFor="billing-email" className="block text-sm font-medium text-neutral-300 mb-1.5">Billing email</label>
          <input
            id="billing-email"
            type="email"
            value={billingEmail}
            onChange={(e) => onBillingEmailChange(e.target.value)}
            placeholder="billing@example.com"
            autoComplete="off"
            aria-invalid={missingFields.includes('billing_email') || undefined}
            className={fieldClass('billing_email')}
          />
        </div>
        <div>
          <label htmlFor="billing-address" className="block text-sm font-medium text-neutral-300 mb-1.5">Address</label>
          <input
            id="billing-address"
            type="text"
            value={address}
            onChange={(e) => onAddressChange(e.target.value)}
            placeholder="Kerkstraat 1"
            autoComplete="street-address"
            aria-invalid={missingFields.includes('address') || undefined}
            className={fieldClass('address')}
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="billing-city" className="block text-sm font-medium text-neutral-300 mb-1.5">City</label>
            <input
              id="billing-city"
              type="text"
              value={city}
              onChange={(e) => onCityChange(e.target.value)}
              placeholder="Brussels"
              autoComplete="address-level2"
              aria-invalid={missingFields.includes('city') || undefined}
              className={fieldClass('city')}
            />
          </div>
          <div className="w-32">
            <label htmlFor="billing-postal-code" className="block text-sm font-medium text-neutral-300 mb-1.5">Postal code</label>
            <input
              id="billing-postal-code"
              type="text"
              value={postalCode}
              onChange={(e) => onPostalCodeChange(e.target.value)}
              placeholder="1000"
              autoComplete="postal-code"
              aria-invalid={missingFields.includes('postal_code') || undefined}
              className={fieldClass('postal_code')}
            />
          </div>
        </div>
      </div>

      {/* Country */}
      <div className="relative z-10">
        <label className="block text-sm font-medium text-neutral-300 mb-1.5">Country</label>
        <div id="billing-country" className={missingFields.includes('country') ? 'ring-1 ring-red-500/60' : ''}>
          <Select
            value={country}
            onChange={onCountryChange}
            variant="input"
            options={[{ value: '', label: 'Select country' }, ...COUNTRY_OPTIONS.map((c) => ({ value: c.value, label: c.label }))]}
          />
        </div>
      </div>

      {/* VAT ID */}
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-1.5">
          VAT ID <span className="text-neutral-500">(optional)</span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={vatId}
            onChange={(e) => onVatIdChange(e.target.value)}
            placeholder="e.g. DE123456789"
            className={inputClass}
          />
          <button
            type="button"
            onClick={handleVerifyVatId}
            disabled={!vatId || !country || vatLoading || isVatValid}
            className="shrink-0 rounded-none bg-neutral-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed ease-apple"
          >
            {vatLoading && vatId ? 'Verifying...' : isVatValid ? 'Verified' : 'Verify'}
          </button>
        </div>
        {/* Verified company info */}
        <AnimatePresence>
          {isVatValid && vatResult?.company_name && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={TIMING}
              className="overflow-hidden"
            >
              <div className="mt-2 rounded-none bg-green-500/5 border border-green-500/20 px-3 py-2 text-xs text-neutral-400">
                <p className="font-medium text-green-400">{toTitleCase(vatResult.company_name)}</p>
                {vatResult.company_address && (
                  <p className="mt-0.5 whitespace-pre-line">{toTitleCase(vatResult.company_address)}</p>
                )}
              </div>
            </motion.div>
          )}
          {isVatChecked && !vatLoading && !isVatValid && vatResult && !vatResult.vat_exempt && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={TIMING}
              className="mt-1.5 text-xs text-yellow-400"
            >
              {country === 'BE'
                ? 'Belgian businesses are subject to 21% VAT.'
                : vatResult.vat_error === 'service_unavailable'
                ? 'VAT verification service is temporarily unavailable. 21% VAT will apply for now.'
                : 'VAT ID is invalid. 21% VAT will apply.'}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* VAT calculation failure — never fall back silently to the excl.-VAT
          display, which is indistinguishable from "no country selected". */}
      {vatFailed && (
        <div className="flex items-start gap-2 rounded-none bg-amber-900/20 border border-amber-900/40 px-3 py-2 text-xs text-amber-300">
          <span className="flex-1">VAT calculation failed — the totals below exclude VAT.</span>
          <button
            type="button"
            onClick={() => setVatRetryNonce((n) => n + 1)}
            className="underline font-medium text-amber-200 hover:text-white shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Price breakdown */}
      <div className={`pt-2 border-t border-neutral-800 transition-opacity duration-base ${vatLoading ? 'opacity-50' : 'opacity-100'} ease-apple`}>
        {vatResult ? (
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-neutral-400">
              <span>Subtotal ({tierLabel} pageviews)</span>
              <span>&euro;{vatResult.base_amount}</span>
            </div>
            {vatResult.vat_exempt ? (
              <div className="flex justify-between text-neutral-500 text-xs">
                <span>{vatResult.vat_reason}</span>
                <span>&euro;0.00</span>
              </div>
            ) : (
              <div className="flex justify-between text-neutral-400">
                <span>VAT {vatResult.vat_rate}%</span>
                <span>&euro;{vatResult.vat_amount}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-white pt-1 border-t border-neutral-800">
              <span>Total {isYearly ? '/year' : '/mo'}</span>
              <span>&euro;{vatResult.total_amount}</span>
            </div>
            {isYearly && (
              <p className="text-xs text-neutral-500">&euro;{(parseFloat(vatResult.total_amount) / 12).toFixed(2)}/mo</p>
            )}
          </div>
        ) : (
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-neutral-400">
              <span>Subtotal ({tierLabel} pageviews)</span>
              <span>&euro;{baseDisplay.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-neutral-500 text-xs">
              <span>VAT</span>
              <span>{vatLoading ? 'Calculating...' : vatFailed ? 'Unavailable' : 'Select country'}</span>
            </div>
            <div className="flex justify-between font-semibold text-white pt-1 border-t border-neutral-800">
              <span>Total {isYearly ? '/year' : '/mo'} <span className="font-normal text-neutral-500 text-xs">excl. VAT</span></span>
              <span>&euro;{baseDisplay.toFixed(2)}</span>
            </div>
            {isYearly && (
              <p className="text-xs text-neutral-500">&euro;{(baseDisplay / 12).toFixed(2)}/mo &middot; Save 1 month</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
