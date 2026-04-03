'use client'

import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import pulseIcon from '@/public/pulse_icon_no_margins.png'
import { PulseMockup } from '@/components/marketing/mockups/pulse-mockup'

interface WelcomePanelProps {
  step: number
  siteDomain?: string
}

function MockupCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-neutral-900/80 px-6 py-5 shadow-2xl">
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Step 2 — Site Card Mockup                                         */
/* ------------------------------------------------------------------ */

function SiteCardMockup({ siteDomain }: { siteDomain?: string }) {
  const domain = siteDomain || 'yoursite.com'
  const siteName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1)

  return (
    <MockupCard>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Favicon */}
          <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0">
            {siteDomain ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`https://www.google.com/s2/favicons?domain=${siteDomain}&sz=64`}
                alt=""
                className="w-10 h-10 object-contain"
              />
            ) : (
              <div className="w-full h-full bg-neutral-800 rounded-xl" />
            )}
          </div>

          <div>
            <p className="text-sm font-bold text-white">{siteName}</p>
            <div className="flex items-center gap-1">
              <span className="text-xs text-neutral-400">{domain}</span>
              <svg className="w-3 h-3 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </div>
          </div>
        </div>

        {/* Active badge */}
        <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-full px-2.5 py-0.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-[10px] text-green-400 font-medium">Active</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2.5">
          <div className="text-[7px] text-neutral-500 font-semibold uppercase tracking-wider">
            Visitors (24h)
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-sm font-bold text-white">1,247</span>
          </div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2.5">
          <div className="text-[7px] text-neutral-500 font-semibold uppercase tracking-wider">
            Pageviews
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-sm font-bold text-white">3,891</span>
          </div>
        </div>
      </div>

      {/* Bottom row: View Dashboard + Settings */}
      <div className="flex items-center gap-2">
        <button className="flex-1 bg-brand-orange text-white rounded-xl py-2.5 text-sm font-medium cursor-default">
          View Dashboard
        </button>
        <button className="rounded-xl border border-neutral-700 bg-neutral-800/50 p-2.5 cursor-default">
          <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </MockupCard>
  )
}

/* ------------------------------------------------------------------ */
/*  Step 3 — Live Data Stream                                         */
/* ------------------------------------------------------------------ */

const liveEvents = [
  { path: '/pricing', browser: 'Chrome', flag: '\u{1F1E8}\u{1F1ED}', time: '2s ago' },
  { path: '/blog/getting-started', browser: 'Safari', flag: '\u{1F1E9}\u{1F1EA}', time: '5s ago' },
  { path: '/', browser: 'Firefox', flag: '\u{1F1FA}\u{1F1F8}', time: '8s ago' },
  { path: '/products', browser: 'Edge', flag: '\u{1F1EC}\u{1F1E7}', time: '12s ago' },
]

function LiveDataStreamMockup() {
  return (
    <MockupCard>
      {/* Script tag code block */}
      <div className="rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2.5 font-mono text-[10px]">
        <span className="text-neutral-500">&lt;script</span>{' '}
        <span className="text-brand-orange">src</span>
        <span className="text-neutral-500">=</span>
        <span className="text-emerald-400">&quot;...&quot;</span>
        <span className="text-neutral-500">&gt;&lt;/script&gt;</span>
      </div>

      {/* Connector arrow */}
      <div className="w-px h-4 bg-neutral-700 mx-auto my-2" />

      {/* Live feed header */}
      <div className="flex items-center gap-1.5 mb-2">
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        <span className="text-[10px] text-green-400 font-medium">Live</span>
      </div>

      {/* Event rows */}
      <div className="flex flex-col gap-1.5">
        {liveEvents.map((event, i) => (
          <motion.div
            key={`${event.path}-${i}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1, duration: 0.3 }}
            className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 flex items-center gap-2"
          >
            <span className="text-brand-orange text-[10px]">&rarr;</span>
            <span className="text-xs text-white flex-1 truncate">{event.path}</span>
            <span className="text-[10px] text-neutral-500">{event.browser}</span>
            <span className="text-[10px] text-neutral-500">{event.flag}</span>
            <span className="text-[10px] text-neutral-600">{event.time}</span>
          </motion.div>
        ))}
      </div>
    </MockupCard>
  )
}

/* ------------------------------------------------------------------ */
/*  Step data                                                         */
/* ------------------------------------------------------------------ */

interface StepContent {
  headline: string
  mockup: React.ReactNode
}

function getStepContent(step: number, siteDomain?: string): StepContent {
  switch (step) {
    case 1:
      return { headline: 'Privacy-first web analytics.', mockup: <PulseMockup /> }
    case 2:
      return { headline: "See what's happening on your site.", mockup: <SiteCardMockup siteDomain={siteDomain} /> }
    case 3:
      return { headline: 'One script tag. Real-time data.', mockup: <LiveDataStreamMockup /> }
    default:
      return { headline: 'Privacy-first web analytics.', mockup: <PulseMockup /> }
  }
}

/* ------------------------------------------------------------------ */
/*  WelcomePanel                                                      */
/* ------------------------------------------------------------------ */

export default function WelcomePanel({ step, siteDomain }: WelcomePanelProps) {
  const current = getStepContent(step, siteDomain)

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

      {/* Logo */}
      <div className="absolute top-0 left-0 z-20 px-6 py-5">
        <Link href="/" className="flex items-center gap-2 w-fit hover:opacity-80 transition-opacity">
          <Image
            src={pulseIcon}
            alt="Pulse"
            width={36}
            height={36}
            unoptimized
            className="object-contain w-8 h-8"
          />
          <span className="text-xl font-bold text-white tracking-tight">Pulse</span>
        </Link>
      </div>

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-10 xl:px-14 py-12 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
            className="flex flex-col items-center gap-6 w-full max-w-lg"
          >
            {/* Headline */}
            <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight text-center">
              {current.headline}
            </h2>

            {/* Mockup with orange glow */}
            <div className="relative w-full">
              <div className="absolute -inset-8 rounded-3xl bg-brand-orange/8 blur-3xl pointer-events-none" />
              <div className="relative rounded-2xl overflow-hidden" style={{ maxHeight: '55vh' }}>
                {current.mockup}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
