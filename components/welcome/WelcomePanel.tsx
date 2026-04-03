'use client'

import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import pulseIcon from '@/public/pulse_icon_no_margins.png'

interface WelcomePanelProps {
  step: number
}

function MockupCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-neutral-900/80 px-6 py-5 shadow-2xl">
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Step 1 — Team Workspace                                           */
/* ------------------------------------------------------------------ */

function TeamWorkspaceMockup() {
  const avatars = [
    { initial: 'U', color: 'bg-brand-orange' },
    { initial: 'A', color: 'bg-blue-500' },
    { initial: 'M', color: 'bg-emerald-500' },
    { initial: 'S', color: 'bg-purple-500' },
  ]

  const sites = [
    { name: 'acme.com', active: true, visitors: '1,247 visitors' },
    { name: 'blog.acme.com', active: true, visitors: '438 visitors' },
    { name: 'docs.acme.com', active: false, visitors: '86 visitors' },
  ]

  return (
    <MockupCard>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-white">Acme Corp</span>
        <div className="flex items-center">
          {avatars.map((a, i) => (
            <div
              key={a.initial}
              className={`${a.color} w-7 h-7 rounded-full border-2 border-neutral-900 flex items-center justify-center text-[10px] font-bold text-white`}
              style={{ marginLeft: i === 0 ? 0 : -8 }}
            >
              {a.initial}
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-white/[0.06] my-3" />

      {/* Site rows */}
      <div className="flex flex-col gap-2">
        {sites.map((site) => (
          <div key={site.name} className="flex items-center gap-2">
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                site.active ? 'bg-green-500' : 'bg-neutral-600'
              }`}
            />
            <span className="text-xs text-white flex-1">{site.name}</span>
            <span className="text-xs text-neutral-400">{site.visitors}</span>
          </div>
        ))}
      </div>

      {/* Bottom summary */}
      <div className="mt-3 text-[10px] text-neutral-500">
        3 sites &middot; 1,771 total visitors &middot; 4 members
      </div>
    </MockupCard>
  )
}

/* ------------------------------------------------------------------ */
/*  Step 2 — Site Dashboard Preview                                   */
/* ------------------------------------------------------------------ */

function SiteDashboardMockup() {
  const stats = [
    { label: 'Visitors', value: '1,247', delta: '18%', up: true },
    { label: 'Pageviews', value: '3,891', delta: '24%', up: true },
    { label: 'Bounce Rate', value: '42%', delta: '5%', up: false },
    { label: 'Avg Duration', value: '2m 34s', delta: '12%', up: true },
  ]

  return (
    <MockupCard>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-white">acme.com</span>
        <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-full px-2.5 py-0.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-[9px] text-green-400 font-medium">3 visitors</span>
        </div>
      </div>

      {/* Mini area chart */}
      <svg viewBox="0 0 400 80" className="w-full h-20 mb-3" preserveAspectRatio="none">
        <defs>
          <linearGradient id="welcome-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FD5E0F" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#FD5E0F" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <path
          d="M0,60 L50,55 L100,45 L150,50 L200,30 L250,25 L300,35 L350,20 L400,15 L400,80 L0,80 Z"
          fill="url(#welcome-area-fill)"
        />
        <path
          d="M0,60 L50,55 L100,45 L150,50 L200,30 L250,25 L300,35 L350,20 L400,15"
          fill="none"
          stroke="#FD5E0F"
          strokeWidth={2}
        />
      </svg>

      {/* 2x2 stat grid */}
      <div className="grid grid-cols-2 gap-2">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-neutral-800 bg-neutral-900 p-2.5"
          >
            <div className="text-[7px] text-neutral-500 font-semibold uppercase tracking-wider">
              {stat.label}
            </div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-sm font-bold text-white">{stat.value}</span>
              <span className="text-[10px] font-medium text-green-400">
                {stat.up ? '↑' : '↓'} {stat.delta}
              </span>
            </div>
          </div>
        ))}
      </div>
    </MockupCard>
  )
}

/* ------------------------------------------------------------------ */
/*  Step 3 — Live Data Stream                                         */
/* ------------------------------------------------------------------ */

const liveEvents = [
  { path: '/pricing', browser: 'Chrome', flag: '🇨🇭', time: '2s ago' },
  { path: '/blog/getting-started', browser: 'Safari', flag: '🇩🇪', time: '5s ago' },
  { path: '/', browser: 'Firefox', flag: '🇺🇸', time: '8s ago' },
  { path: '/products', browser: 'Edge', flag: '🇬🇧', time: '12s ago' },
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

const steps: Record<number, StepContent> = {
  1: { headline: 'Analytics for your whole team.', mockup: <TeamWorkspaceMockup /> },
  2: { headline: "See what's happening on your site.", mockup: <SiteDashboardMockup /> },
  3: { headline: 'One script tag. Real-time data.', mockup: <LiveDataStreamMockup /> },
}

/* ------------------------------------------------------------------ */
/*  WelcomePanel                                                      */
/* ------------------------------------------------------------------ */

export default function WelcomePanel({ step }: WelcomePanelProps) {
  const current = steps[step] ?? steps[1]

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
