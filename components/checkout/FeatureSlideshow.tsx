'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { PulseMockup } from '@/components/marketing/mockups/pulse-mockup'
import { PagesCard, ReferrersCard, LocationsCard, TechnologyCard, PeakHoursCard } from '@/components/marketing/mockups/pulse-features-carousel'

interface Slide {
  headline: string
  mockup: React.ReactNode
}

function FeatureCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-neutral-900/80 px-6 py-5 shadow-2xl">
      {children}
    </div>
  )
}

const slides: Slide[] = [
  { headline: 'Your traffic, at a glance.', mockup: <PulseMockup /> },
  { headline: 'See which pages perform best.', mockup: <FeatureCard><PagesCard /></FeatureCard> },
  { headline: 'Know where your visitors come from.', mockup: <FeatureCard><ReferrersCard /></FeatureCard> },
  { headline: 'Visitors from around the world.', mockup: <FeatureCard><LocationsCard /></FeatureCard> },
  { headline: 'Understand your audience\u2019s tech stack.', mockup: <FeatureCard><TechnologyCard /></FeatureCard> },
  { headline: 'Find your peak traffic hours.', mockup: <FeatureCard><PeakHoursCard /></FeatureCard> },
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
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-10 xl:px-14 py-12 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
            className="flex flex-col items-center gap-6 w-full max-w-lg"
          >
            {/* Headline — centered */}
            <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight text-center">
              {slide.headline}
            </h2>

            {/* Mockup — constrained */}
            <div className="relative w-full">
              {/* Orange glow */}
              <div className="absolute -inset-8 rounded-3xl bg-brand-orange/8 blur-3xl pointer-events-none" />

              <div className="relative rounded-2xl overflow-hidden" style={{ maxHeight: '55vh' }}>
                {slide.mockup}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
