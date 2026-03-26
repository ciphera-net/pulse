'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { PulseMockup } from '@/components/marketing/mockups/pulse-mockup'
import { PulseFeaturesCarousel } from '@/components/marketing/mockups/pulse-features-carousel'
import { FunnelMockup } from '@/components/marketing/mockups/funnel-mockup'
import { EmailReportMockup } from '@/components/marketing/mockups/email-report-mockup'

interface Slide {
  headline: string
  mockup: React.ReactNode
}

const slides: Slide[] = [
  { headline: 'Your traffic, at a glance.', mockup: <PulseMockup /> },
  { headline: 'Everything you need to know about your visitors.', mockup: <PulseFeaturesCarousel /> },
  { headline: 'See where visitors drop off.', mockup: <FunnelMockup /> },
  { headline: 'Reports delivered to your inbox.', mockup: <EmailReportMockup /> },
]

export default function FeatureSlideshow() {
  const [activeIndex, setActiveIndex] = useState(0)

  const advance = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % slides.length)
  }, [])

  useEffect(() => {
    const timer = setInterval(advance, 5000)
    return () => clearInterval(timer)
  }, [advance])

  const slide = slides[activeIndex]

  return (
    <div className="relative h-full w-full">
      {/* Background image */}
      <Image
        src="/pulse-showcase-bg.png"
        alt=""
        fill
        unoptimized
        className="object-cover"
        priority
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col justify-center px-10 xl:px-14 py-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
            className="flex flex-col gap-8"
          >
            {/* Headline only */}
            <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight">
              {slide.headline}
            </h2>

            {/* Mockup */}
            <div className="relative">
              {/* Orange glow */}
              <div className="absolute -inset-8 rounded-3xl bg-brand-orange/8 blur-3xl pointer-events-none" />

              <div className="relative rounded-2xl border border-white/[0.08] overflow-hidden">
                {slide.mockup}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Dot indicators */}
        <div className="mt-8 flex items-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIndex(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === activeIndex
                  ? 'w-6 bg-brand-orange'
                  : 'w-2 bg-white/25 hover:bg-white/40'
              }`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
