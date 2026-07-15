import { Suspense } from 'react'
import type { Metadata } from 'next'
import PricingSection from '@/components/PricingSection'
import { PricingCardsSkeleton } from '@/components/skeletons'

export const metadata: Metadata = {
  title: 'Pricing | Pulse',
  description: 'Simple, transparent pricing for privacy-first web analytics. Free tier included.',
  openGraph: {
    title: 'Pricing | Pulse',
    description: 'Simple, transparent pricing for privacy-first web analytics. Free tier included.',
    siteName: 'Pulse by Ciphera',
  },
}

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-16 sm:py-20">
          <div className="mb-12 text-center">
            <div className="mx-auto mb-4 h-10 w-64 animate-pulse bg-muted" />
            <div className="mx-auto h-5 w-96 animate-pulse bg-muted" />
          </div>
          <PricingCardsSkeleton />
        </div>
      }
    >
      <PricingSection />
    </Suspense>
  )
}
