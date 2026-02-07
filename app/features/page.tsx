'use client'

/**
 * @file Features / Product Tour page.
 *
 * Comprehensive showcase of everything Pulse offers — designed to convert
 * visitors who land here from search or internal navigation. Uses mixed
 * layout styles (cards, inline lists, numbered steps, split sections) to
 * avoid visual monotony.
 */

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Button } from '@ciphera-net/ui'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import {
  BarChartIcon,
  LockIcon,
  ZapIcon,
  GlobeIcon,
  Share2Icon,
  ArrowRightIcon,
} from '@ciphera-net/ui'

// * Pillar features (top 3 cards — matches landing page)
const pillars = [
  {
    icon: LockIcon,
    title: 'Privacy First',
    description:
      'No cookies, no IP tracking, no fingerprinting. Fully GDPR, CCPA, and PECR compliant — no cookie banner required.',
  },
  {
    icon: BarChartIcon,
    title: 'Simple Dashboard',
    description:
      'One clear dashboard with everything you need. Page views, visitors, referral sources, and top pages — no learning curve.',
  },
  {
    icon: ZapIcon,
    title: 'Lightweight Script',
    description:
      'Less than 1 KB. Loads in milliseconds with zero impact on your Lighthouse score or Core Web Vitals.',
  },
]

// * Core capabilities — rendered as an icon + text list, NOT cards
const capabilities = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
      </svg>
    ),
    title: 'Real-Time Analytics',
    description: 'Watch visitors arrive live. See active pages, referrers, and current visitor counts with zero delay.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
      </svg>
    ),
    title: 'Conversion Funnels',
    description: 'Define multi-step funnels and see exactly where visitors drop off in your sign-up or checkout flow.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
      </svg>
    ),
    title: 'Goals & Events',
    description: 'Track custom goals, completions, and conversion rates — all without cookies or complex setup.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
      </svg>
    ),
    title: 'UTM Campaign Tracking',
    description: 'Automatically parse UTM parameters. Built-in link builder for campaigns, sources, and mediums.',
  },
  {
    icon: Share2Icon,
    title: 'Shared Dashboards',
    description: 'Generate a public link to share analytics with clients or teammates — no login required.',
  },
  {
    icon: GlobeIcon,
    title: 'Geographic Insights',
    description: 'Country, region, and city-level breakdowns. IPs are never stored — derived at request time only.',
  },
]

// * Trust signals — rendered as compact inline items, NOT cards
const trustSignals = [
  { label: 'Open Source', detail: 'Frontend fully on GitHub' },
  { label: 'Swiss Infrastructure', detail: 'Data processed in Switzerland' },
  { label: 'No Cookie Banners', detail: 'Skip consent popups entirely' },
  { label: '100% Data Ownership', detail: 'We never sell or share your data' },
  { label: 'Bot & Spam Filtering', detail: 'Automatic exclusion of non-human traffic' },
  { label: '75+ Integrations', detail: 'React, Vue, WordPress, Shopify & more' },
]

export default function FeaturesPage() {
  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden selection:bg-brand-orange/20">
      {/* * --- ATMOSPHERE (Background) --- */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brand-orange/10 rounded-full blur-[128px] opacity-60" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-neutral-500/10 dark:bg-neutral-400/10 rounded-full blur-[128px] opacity-40" />
        <div
          className="absolute inset-0 bg-grid-pattern opacity-[0.02] dark:opacity-[0.05]"
          style={{ maskImage: 'radial-gradient(ellipse at center, black 0%, transparent 70%)' }}
        />
      </div>

      <div className="flex-grow w-full max-w-6xl mx-auto px-4 pt-20 pb-10 z-10">
        {/* * ─── HERO ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-20"
        >
          <span className="badge-primary mb-6 inline-flex">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-pulse" />
            Product Tour
          </span>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-neutral-900 dark:text-white mb-6">
            Everything you need. <br />
            <span className="gradient-text">Nothing you don&apos;t.</span>
          </h1>
          <p className="text-xl text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto leading-relaxed">
            Pulse gives you meaningful analytics without the complexity, the cookies, or the privacy trade-offs.
          </p>
        </motion.div>

        {/* * ─── PILLAR CARDS (3 glass cards — matches landing page) ─── */}
        <div className="grid md:grid-cols-3 gap-6 text-left mb-28">
          {pillars.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="card-glass p-8 hover:-translate-y-1 hover:shadow-xl transition-all duration-300 group"
            >
              <div className="w-12 h-12 rounded-xl bg-brand-orange/10 flex items-center justify-center mb-6 text-brand-orange group-hover:scale-110 transition-transform duration-300">
                <feature.icon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-3">
                {feature.title}
              </h3>
              <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* * ─── CORE CAPABILITIES (icon list — NO cards) ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-28"
        >
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-white mb-4">
              Powerful analytics, <span className="gradient-text">simplified</span>
            </h2>
            <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
              Everything from real-time dashboards to conversion funnels — without the bloat.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-x-16 gap-y-10 max-w-4xl mx-auto">
            {capabilities.map((cap, i) => (
              <motion.div
                key={cap.title}
                initial={{ opacity: 0, x: i % 2 === 0 ? -15 : 15 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="flex gap-4"
              >
                <div className="w-10 h-10 rounded-lg bg-brand-orange/10 flex items-center justify-center shrink-0 text-brand-orange mt-0.5">
                  {typeof cap.icon === 'object' ? cap.icon : <cap.icon className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-neutral-900 dark:text-white mb-1">
                    {cap.title}
                  </h3>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                    {cap.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* * ─── CONTENT ANALYTICS (split layout — visual variety) ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-28 p-10 md:p-14 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 rounded-2xl"
        >
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-3xl font-bold text-neutral-900 dark:text-white mb-4">
                Content that <span className="gradient-text">performs</span>
              </h2>
              <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed mb-6">
                See which pages drive the most traffic, where visitors enter your site, and where they leave. Use data to double down on what works.
              </p>
              <ul className="space-y-3">
                {[
                  'Top pages by views & unique visitors',
                  'Entry pages — first impressions that work',
                  'Exit pages — where you lose attention',
                  'Referral sources — where traffic comes from',
                  'Browser, OS & device breakdowns',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-neutral-600 dark:text-neutral-400">
                    <svg className="w-5 h-5 text-brand-orange shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              {[
                { label: '/blog/privacy-guide', views: '2,847', pct: 85 },
                { label: '/pricing', views: '1,923', pct: 68 },
                { label: '/features', views: '1,456', pct: 51 },
                { label: '/docs/getting-started', views: '989', pct: 35 },
              ].map((page, i) => (
                <motion.div
                  key={page.label}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-neutral-900 dark:text-white truncate mr-4">
                      {page.label}
                    </span>
                    <span className="text-sm text-neutral-500 dark:text-neutral-400 shrink-0">
                      {page.views} views
                    </span>
                  </div>
                  <div className="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${page.pct}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8, delay: 0.2 + i * 0.1 }}
                      className="h-full bg-brand-orange rounded-full"
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* * ─── TRUST SIGNALS (compact grid — NO card borders) ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-28"
        >
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-white mb-4">
              Built for trust
            </h2>
            <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
              Open source, Swiss hosted, and designed to keep your visitors&apos; data where it belongs.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-6 max-w-4xl mx-auto">
            {trustSignals.map((signal, i) => (
              <motion.div
                key={signal.label}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.06 }}
                className="flex items-start gap-3 py-2"
              >
                <svg className="w-5 h-5 text-brand-orange shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                <div>
                  <span className="font-semibold text-neutral-900 dark:text-white text-sm">{signal.label}</span>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{signal.detail}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="flex justify-center gap-6 mt-8">
            <Link
              href="/integrations"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-orange hover:underline"
            >
              View all integrations <ArrowRightIcon className="w-4 h-4" />
            </Link>
            <a
              href="https://github.com/ciphera-net/pulse"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-orange hover:underline"
            >
              View on GitHub <ArrowRightIcon className="w-4 h-4" />
            </a>
          </div>
        </motion.div>

        {/* * ─── HOW IT WORKS (numbered steps — inline, NO card borders) ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-28"
        >
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-white mb-4">
              Up and running in <span className="gradient-text">3 minutes</span>
            </h2>
            <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
              No SDKs to install, no build steps, no configuration files.
            </p>
          </div>

          <div className="flex flex-col md:flex-row items-start md:items-center justify-center gap-8 md:gap-6 max-w-3xl mx-auto">
            {[
              { step: '1', title: 'Create your site', desc: 'Sign up and add your domain.' },
              { step: '2', title: 'Add the script', desc: 'Paste one <script> tag.' },
              { step: '3', title: 'Watch the data flow', desc: 'Real-time analytics, instantly.' },
            ].map((s, i) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.15 }}
                className="flex items-center gap-4 flex-1"
              >
                <div className="w-10 h-10 rounded-full bg-brand-orange text-white font-bold text-lg flex items-center justify-center shrink-0">
                  {s.step}
                </div>
                <div>
                  <h3 className="font-bold text-neutral-900 dark:text-white text-sm">
                    {s.title}
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {s.desc}
                  </p>
                </div>
                {i < 2 && (
                  <ArrowRightIcon className="w-5 h-5 text-neutral-300 dark:text-neutral-600 shrink-0 hidden md:block" />
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* * ─── BOTTOM CTA ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-20"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-white mb-4">
            Ready to see it in action?
          </h2>
          <p className="text-neutral-600 dark:text-neutral-400 mb-8 max-w-lg mx-auto">
            Start for free. No credit card required. Cancel anytime.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              onClick={() => initiateOAuthFlow()}
              variant="primary"
              className="px-8 py-4 text-lg shadow-lg shadow-brand-orange/20"
            >
              Get Started Free
            </Button>
            <Link href="/pricing">
              <Button variant="secondary" className="px-8 py-4 text-lg">
                View Pricing
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-neutral-500">
            Free plan includes 1 site and 10,000 pageviews/month
          </p>
        </motion.div>
      </div>
    </div>
  )
}
