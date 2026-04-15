'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { SPRING, TIMING } from '@/lib/motion'
import { Select } from '@ciphera-net/ui'
import { TRAFFIC_TIERS, PLAN_PRICES } from '@/lib/plans'
import { COUNTRY_OPTIONS } from '@/lib/countries'
import { calculateVAT, type VATResult } from '@/lib/api/billing'

interface PlanSummaryProps {
  plan: string
  interval: string
  limit: number
  country: string
  vatId: string
  onCountryChange: (country: string) => void
  onVatIdChange: (vatId: string) => void
}

const inputClass =
  'w-full rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-brand-orange focus:border-brand-orange transition-colors'

/** Convert VIES ALL-CAPS text to title case (e.g. "SA SODIMAS" → "Sa Sodimas") */
function toTitleCase(s: string) {
  return s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

export default function PlanSummary({ plan, interval, limit, country, vatId, onCountryChange, onVatIdChange }: PlanSummaryProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentInterval, setCurrentInterval] = useState(interval)
  const [vatResult, setVatResult] = useState<VATResult | null>(null)
  const [vatLoading, setVatLoading] = useState(false)
  const [verifiedVatId, setVerifiedVatId] = useState('')

  const monthlyCents = PLAN_PRICES[plan]?.[limit] || 0
  const isYearly = currentInterval === 'year'
  const baseDisplay = isYearly ? (monthlyCents * 11) / 100 : monthlyCents / 100

  const tierLabel =
    TRAFFIC_TIERS.find((t) => t.value === limit)?.label ||
    `${(limit / 1000).toFixed(0)}k`

  const handleIntervalToggle = (newInterval: string) => {
    setCurrentInterval(newInterval)
    const params = new URLSearchParams(searchParams.toString())
    params.set('interval', newInterval)
    router.replace(`/checkout?${params.toString()}`, { scroll: false })
  }

  const fetchVAT = useCallback(async (c: string, v: string, iv: string) => {
    if (!c) { setVatResult(null); return }
    setVatLoading(true)
    try {
      const result = await calculateVAT({ plan_id: plan, interval: iv, limit, country: c, vat_id: v || undefined })
      setVatResult(result)
    } catch {
      setVatResult(null)
    } finally {
      setVatLoading(false)
    }
  }, [plan, limit])

  // Auto-fetch when country or interval changes (using the already-verified VAT ID if any)
  useEffect(() => {
    if (!country) { setVatResult(null); return }
    fetchVAT(country, verifiedVatId, currentInterval)
  }, [country, currentInterval, fetchVAT, verifiedVatId])

  // Clear verified state when VAT ID input changes after a successful verification
  useEffect(() => {
    if (verifiedVatId !== '' && vatId !== verifiedVatId) {
      setVerifiedVatId('')
      // Re-fetch without VAT ID to show the 21% rate
      if (country) fetchVAT(country, '', currentInterval)
    }
  }, [vatId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleVerifyVatId = () => {
    if (!vatId || !country) return
    setVerifiedVatId(vatId)
    // useEffect on verifiedVatId will trigger the fetch
  }

  const isVatChecked = verifiedVatId !== '' && verifiedVatId === vatId
  const isVatValid = isVatChecked && !!vatResult?.company_name

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 backdrop-blur-xl p-5 space-y-4">
      {/* Plan name + interval toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white capitalize">{plan}</h2>
        </div>
        <div className="flex items-center gap-1 p-1 bg-neutral-800/50 rounded-xl sm:ml-auto">
          {(['month', 'year'] as const).map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => handleIntervalToggle(iv)}
              className={`relative px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                currentInterval === iv ? 'text-white' : 'text-neutral-400 hover:text-white'
              }`}
            >
              {currentInterval === iv && (
                <motion.div
                  layoutId="checkout-interval-bg"
                  className="absolute inset-0 bg-neutral-700 rounded-lg shadow-sm"
                  transition={SPRING}
                />
              )}
              <span className="relative z-10">{iv === 'month' ? 'Monthly' : 'Yearly'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Country */}
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-1.5">Country</label>
        <Select
          value={country}
          onChange={onCountryChange}
          variant="input"
          options={[{ value: '', label: 'Select country' }, ...COUNTRY_OPTIONS.map((c) => ({ value: c.value, label: c.label }))]}
        />
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
            className="shrink-0 rounded-lg bg-neutral-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed"
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
              <div className="mt-2 rounded-lg bg-green-500/5 border border-green-500/20 px-3 py-2 text-xs text-neutral-400">
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
              VAT ID could not be verified. 21% VAT will apply.
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Price breakdown */}
      <div className={`pt-2 border-t border-neutral-800 transition-opacity duration-200 ${vatLoading ? 'opacity-50' : 'opacity-100'}`}>
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
              <span>{vatLoading ? 'Calculating...' : 'Select country'}</span>
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
