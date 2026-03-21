'use client'

import { motion } from 'framer-motion'
import { Check } from '@phosphor-icons/react'
import { PulseMockup } from './mockups/pulse-mockup'
import { PulseFeaturesCarousel } from './mockups/pulse-features-carousel'
import { FunnelMockup } from './mockups/funnel-mockup'
import { EmailReportMockup } from './mockups/email-report-mockup'

// Section wrapper component for reuse
function FeatureSection({
  id,
  heading,
  description,
  features,
  mockup,
  reverse = false,
}: {
  id: string
  heading: string
  description: string
  features: string[]
  mockup: React.ReactNode
  reverse?: boolean
}) {
  return (
    <section id={id} className="container mx-auto px-6 scroll-mt-28">
      <div className={`grid lg:grid-cols-2 gap-12 lg:gap-20 items-center`}>
        {/* Text */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className={reverse ? 'lg:order-last' : ''}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-tight mb-6">
            {heading}
          </h2>
          <p className="text-lg text-neutral-400 leading-relaxed mb-6">
            {description}
          </p>
          <ul className="space-y-3 mb-8">
            {features.map((item) => (
              <li key={item} className="flex gap-3 text-neutral-300">
                <Check weight="bold" className="w-5 h-5 text-brand-orange mt-0.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Mockup container */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className={`relative ${reverse ? 'lg:order-first' : ''}`}
        >
          <div className="absolute -inset-8 bg-brand-orange/8 rounded-[2.5rem] blur-3xl" />
          <div className="relative rounded-3xl overflow-hidden border border-white/[0.08]">
            <img src="/pulse-showcase-bg.png" alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/30" />
            <div className="relative">
              {mockup}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export default function FeatureSections() {
  return (
    <div className="py-20 lg:py-32 space-y-28">
      {/* Section 1: Dashboard — text left, mockup right */}
      <FeatureSection
        id="dashboard"
        heading="Your traffic, at a glance."
        description="Get a clear, real-time overview of your website's performance without the clutter of traditional analytics tools."
        features={[
          'Live visitor count with real-time updates',
          'Hourly, daily, weekly, and monthly trends',
          'Referrer sources and UTM campaign tracking',
          'Country-level geographic breakdown',
        ]}
        mockup={
          <div className="p-6 sm:p-10">
            <PulseMockup />
          </div>
        }
      />

      {/* Section 2: Visitors — mockup left, text right */}
      <FeatureSection
        id="visitors"
        heading="Everything you need to know about your visitors."
        description="Understand where your traffic comes from, what content resonates, and how visitors interact with your site — all without compromising their privacy."
        features={[
          'Top pages ranked by views and unique visitors',
          'Referrer breakdown with source attribution',
          'Browser, OS, and device analytics',
          'Peak hours heatmap for optimal publishing',
        ]}
        reverse
        mockup={
          <div className="p-6 sm:p-10">
            <PulseFeaturesCarousel />
          </div>
        }
      />

      {/* Section 3: Funnels — text left, mockup right */}
      <FeatureSection
        id="funnels"
        heading="See where visitors drop off."
        description="Build custom conversion funnels to understand your user journey. Identify bottlenecks and optimize your conversion flow."
        features={[
          'Multi-step funnels with conversion rates',
          'Drop-off analysis between each step',
          'Conversion trends over time',
          'Breakdown by device, country, or referrer',
          'Configurable conversion window (up to 90 days)',
        ]}
        mockup={
          <div className="p-6 sm:p-10">
            <FunnelMockup />
          </div>
        }
      />

      {/* Section 4: Reports — mockup left, text right */}
      <FeatureSection
        id="reports"
        heading="Reports delivered to your inbox."
        description="Get automated summaries of your site's performance without logging into a dashboard. Stay informed effortlessly."
        features={[
          'Daily, weekly, or monthly email summaries',
          'Key metrics with period-over-period comparison',
          'Top pages, referrers, and country breakdown',
          'Webhook delivery for custom integrations',
          'Multiple recipients per report',
        ]}
        reverse
        mockup={
          <div className="p-6 sm:p-10">
            <EmailReportMockup />
          </div>
        }
      />

      {/* Section 5: Script — text left, code block right */}
      <FeatureSection
        id="script"
        heading="One script tag. That's it."
        description="No npm packages, no build steps, no configuration files. Add a single line to your HTML and start collecting privacy-respecting analytics instantly."
        features={[
          'Under 2KB gzipped — 20x smaller than Google Analytics',
          'Async loading with defer — never blocks rendering',
          'Works with any framework or static site',
        ]}
        mockup={
          <div className="p-0">
            {/* Code block with browser chrome */}
            <div className="flex items-center px-4 py-3 bg-neutral-800 border-b border-neutral-800">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/20" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/20" />
                <div className="w-3 h-3 rounded-full bg-green-500/20" />
              </div>
              <span className="ml-4 text-xs text-neutral-400 font-mono">index.html</span>
            </div>
            <pre className="p-6 overflow-x-auto">
              <code className="font-mono text-sm text-neutral-300">
                <span className="text-neutral-500">{'<!-- Add before </head> -->'}</span>{'\n'}
                <span className="text-blue-400">{'<'}</span>
                <span className="text-blue-400">script</span>{'\n'}
                {'  '}<span className="text-sky-300">defer</span>{'\n'}
                {'  '}<span className="text-sky-300">data-domain</span>=<span className="text-orange-300">&quot;yoursite.com&quot;</span>{'\n'}
                {'  '}<span className="text-sky-300">src</span>=<span className="text-orange-300">&quot;https://pulse.ciphera.net/js/script.js&quot;</span>{'\n'}
                <span className="text-blue-400">{'>'}</span>
                <span className="text-blue-400">{'</'}</span>
                <span className="text-blue-400">script</span>
                <span className="text-blue-400">{'>'}</span>
              </code>
            </pre>
            <div className="flex items-center gap-4 px-6 py-3 border-t border-neutral-800 text-xs text-neutral-500">
              <span>1.6 KB gzipped</span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Non-blocking, async
              </span>
            </div>
          </div>
        }
      />
    </div>
  )
}
