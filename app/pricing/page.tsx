import { Suspense } from 'react'
import PricingSection from '@/components/PricingSection'

export default function PricingPage() {
  return (
    <div className="min-h-screen pt-20">
      <Suspense fallback={<div className="min-h-screen pt-20 flex items-center justify-center">Loading...</div>}>
        <PricingSection />
      </Suspense>
    </div>
  )
}
