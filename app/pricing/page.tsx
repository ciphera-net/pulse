import { Suspense } from 'react'
import PricingSection from '@/components/PricingSection'
import { PricingCardsSkeleton } from '@/components/skeletons'

export default function PricingPage() {
  return (
    <div className="min-h-screen pt-20">
      <Suspense fallback={
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <div className="text-center mb-12">
            <div className="h-10 w-64 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800 mx-auto mb-4" />
            <div className="h-5 w-96 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800 mx-auto" />
          </div>
          <PricingCardsSkeleton />
        </div>
      }>
        <PricingSection />
      </Suspense>
    </div>
  )
}
