'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSubscription } from '@/lib/swr/dashboard'
import { LoadingOverlay } from '@ciphera-net/ui'
import { cdnUrl } from '@/lib/cdn'
import UpgradeSummary from '@/components/checkout/UpgradeSummary'

function SwitchPlanContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: subscription, isLoading } = useSubscription()

  const newPlan = searchParams.get('plan') || ''
  const newInterval = searchParams.get('interval') || ''
  const newLimit = Number(searchParams.get('limit')) || 0

  if (isLoading) {
    return <LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Pulse" />
  }

  if (!subscription || subscription.subscription_status !== 'active') {
    router.replace('/setup/plan')
    return null
  }

  if (!newPlan || !newInterval || !newLimit) {
    router.replace('/pricing')
    return null
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-10">
      <div className="w-full max-w-lg">
        <UpgradeSummary
          currentPlan={subscription.plan_id}
          currentInterval={subscription.billing_interval}
          currentLimit={subscription.pageview_limit}
          newPlan={newPlan}
          newInterval={newInterval}
          newLimit={newLimit}
        />
      </div>
    </div>
  )
}

export default function SwitchPlanPage() {
  return (
    <Suspense fallback={<LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Pulse" />}>
      <SwitchPlanContent />
    </Suspense>
  )
}
