import { Suspense } from 'react'
import type { Metadata } from 'next'
import PricingSection from '@/components/PricingSection'
import { PricingCardsSkeleton } from '@/components/skeletons'
import { DEFAULT_OG_IMAGES } from '@/lib/og'

const description =
  'Every Pulse plan runs the full product — you pay for scale, not features. Start free with 5,000 pageviews/mo; no cookies, no consent banner.'

export const metadata: Metadata = {
  title: 'Pricing',
  description,
  alternates: {
    canonical: '/pricing',
  },
  openGraph: {
    title: 'Pricing',
    description,
    siteName: 'Pulse by Ciphera',
    images: DEFAULT_OG_IMAGES,
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
