'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useSetup } from '@/lib/setup/context'
import { useSubscription } from '@/lib/swr/dashboard'
import PlanSummary from '@/components/checkout/PlanSummary'
import PaymentForm from '@/components/checkout/PaymentForm'
import { TIMING } from '@/lib/motion'

export default function SetupPlanPage() {
  const router = useRouter()
  const { pendingPlan, completeStep } = useSetup()
  const { data: subscription } = useSubscription()

  const [selectedPlan, setSelectedPlan] = useState<string | null>(pendingPlan?.planId ?? null)
  const [selectedInterval, setSelectedInterval] = useState<'month' | 'year'>(
    (pendingPlan?.interval as 'month' | 'year') ?? 'month'
  )
  const [selectedLimit, setSelectedLimit] = useState<number>(pendingPlan?.limit ?? 100_000)
  const [country, setCountry] = useState('')
  const [vatId, setVatId] = useState('')

  // If already subscribed, skip to done
  useEffect(() => {
    if (
      subscription?.subscription_status === 'active' ||
      subscription?.subscription_status === 'trialing'
    ) {
      completeStep('plan')
      router.replace('/setup/done')
    }
  }, [subscription, completeStep, router])

  const handleSkip = () => {
    completeStep('plan')
    router.push('/setup/done')
  }

  const handlePaymentSuccess = () => {
    completeStep('plan')
    router.push('/setup/done')
  }

  return (
    <>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Choose your plan
        </h1>
        <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
          Start free or pick a plan that fits. You can change anytime.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {selectedPlan ? (
          <motion.div
            key="checkout"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={TIMING}
            className="space-y-6"
          >
            <PlanSummary
              plan={selectedPlan}
              interval={selectedInterval}
              limit={selectedLimit}
              country={country}
              vatId={vatId}
              onCountryChange={setCountry}
              onVatIdChange={setVatId}
            />
            <PaymentForm
              plan={selectedPlan}
              interval={selectedInterval}
              limit={selectedLimit}
              country={country}
              vatId={vatId}
              onSuccess={handlePaymentSuccess}
            />
            <button
              type="button"
              onClick={() => setSelectedPlan(null)}
              className="w-full text-center text-sm text-neutral-500 hover:text-neutral-400 transition-colors"
            >
              Back to plan selection
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="selection"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={TIMING}
            className="space-y-3"
          >
            {['solo', 'team', 'business'].map((planId) => (
              <button
                key={planId}
                type="button"
                onClick={() => setSelectedPlan(planId)}
                className="w-full text-left px-4 py-3 rounded-xl border border-neutral-800 hover:border-brand-orange/50 hover:bg-neutral-800/50 transition-all"
              >
                <span className="text-sm font-medium text-white capitalize">{planId}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={handleSkip}
        className="mt-6 w-full text-center text-sm text-neutral-500 hover:text-neutral-400 transition-colors"
      >
        Skip — start free
      </button>
    </>
  )
}
