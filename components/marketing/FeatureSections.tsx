'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { Check } from '@phosphor-icons/react'

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
          <div className="relative rounded-3xl overflow-hidden border border-white/[0.08] bg-neutral-900/80">
            {mockup}
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
          <div className="p-6 sm:p-10 flex items-center justify-center min-h-[400px]">
            <Image
              src="/dashboard-preview-v2.png"
              alt="Pulse analytics dashboard"
              width={560}
              height={400}
              className="w-full h-auto rounded-xl"
              unoptimized
            />
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
          <div className="p-6 sm:p-10 flex items-center justify-center min-h-[400px]">
            <div className="w-full space-y-4">
              {/* Mini mockup: top pages bars */}
              {[
                { page: '/blog/privacy-guide', pct: 85 },
                { page: '/docs/getting-started', pct: 65 },
                { page: '/pricing', pct: 45 },
                { page: '/about', pct: 30 },
              ].map((item) => (
                <div key={item.page} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-300 font-medium">{item.page}</span>
                    <span className="text-neutral-500">{item.pct}%</span>
                  </div>
                  <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-orange rounded-full" style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
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
          <div className="p-6 sm:p-10 flex items-center justify-center min-h-[400px]">
            {/* Simple funnel visualization */}
            <div className="w-full max-w-[300px] mx-auto space-y-2">
              {[
                { label: 'Landing Page', value: '2,847', pct: 100, color: 'bg-brand-orange' },
                { label: 'Sign Up Page', value: '1,423', pct: 50, color: 'bg-brand-orange/80' },
                { label: 'Onboarding', value: '856', pct: 30, color: 'bg-brand-orange/60' },
                { label: 'Activated', value: '412', pct: 14.5, color: 'bg-brand-orange/40' },
              ].map((step, i) => (
                <div key={step.label} className="text-center">
                  <div
                    className={`${step.color} rounded-lg py-3 mx-auto transition-all`}
                    style={{ width: `${step.pct}%` }}
                  >
                    <span className="text-white text-sm font-semibold">{step.value}</span>
                  </div>
                  <p className="text-xs text-neutral-400 mt-1">{step.label}</p>
                  {i < 3 && (
                    <p className="text-xs text-neutral-600 my-1">↓ {Math.round((1 - [1, 0.5, 0.3, 0.145][i + 1] / [1, 0.5, 0.3, 0.145][i]) * 100)}% drop-off</p>
                  )}
                </div>
              ))}
              <p className="text-center text-sm text-neutral-300 mt-4 font-medium">Overall conversion: <span className="text-brand-orange">14.5%</span></p>
            </div>
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
          <div className="p-6 sm:p-10 flex items-center justify-center min-h-[400px]">
            {/* Email mockup */}
            <div className="w-full max-w-[360px] mx-auto bg-neutral-800/50 rounded-xl border border-neutral-700/40 p-5 space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-neutral-700/40">
                <div className="w-8 h-8 rounded-lg bg-brand-orange/20 flex items-center justify-center">
                  <span className="text-brand-orange text-xs font-bold">P</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Pulse Daily Report</p>
                  <p className="text-xs text-neutral-500">yoursite.com</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Visitors', value: '1,247', change: '+12%' },
                  { label: 'Pageviews', value: '3,891', change: '+8%' },
                  { label: 'Bounce Rate', value: '42%', change: '-3%' },
                  { label: 'Avg Duration', value: '2m 34s', change: '+15%' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-neutral-900/50 rounded-lg p-3">
                    <p className="text-xs text-neutral-500">{stat.label}</p>
                    <p className="text-lg font-bold text-white">{stat.value}</p>
                    <p className={`text-xs ${stat.change.startsWith('+') ? 'text-green-400' : 'text-brand-orange'}`}>{stat.change}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-neutral-600 text-center">Delivered every day at 09:00</p>
            </div>
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
