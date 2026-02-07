'use client'

/**
 * @file Features / Product Tour page.
 *
 * Comprehensive showcase of everything Pulse offers — designed to convert
 * visitors who land here from search or internal navigation. Each feature
 * section uses consistent glass-morphism cards with staggered animations.
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
  EyeIcon,
  ArrowRightIcon,
} from '@ciphera-net/ui'

// * Feature definitions grouped by section
const heroFeatures = [
  {
    icon: LockIcon,
    title: 'Privacy First',
    description:
      'No cookies, no IP tracking, no fingerprinting. Fully GDPR, CCPA, and PECR compliant out of the box — no cookie banner required.',
  },
  {
    icon: BarChartIcon,
    title: 'Simple Dashboard',
    description:
      'One clear dashboard with everything you need. Page views, unique visitors, referral sources, and top pages — no learning curve.',
  },
  {
    icon: ZapIcon,
    title: 'Lightweight Script',
    description:
      'Less than 1 KB. Our tracking script loads in milliseconds and has zero impact on your Lighthouse score or Core Web Vitals.',
  },
]

const coreCapabilities = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
      </svg>
    ),
    title: 'Real-Time Analytics',
    description: 'Watch visitors arrive on your site in real time. See active pages, live referrers, and current visitor counts — no delay.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
      </svg>
    ),
    title: 'Conversion Funnels',
    description: 'Define multi-step funnels to see where visitors drop off. Track sign-ups, purchases, or any custom flow with precise conversion rates.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
      </svg>
    ),
    title: 'Goals & Events',
    description: 'Set goals for key pages or custom events. Track completions, conversion rates, and revenue attribution — all without cookies.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
      </svg>
    ),
    title: 'UTM Campaign Tracking',
    description: 'Automatically parse UTM parameters to attribute traffic to campaigns, sources, and mediums. Built-in UTM link builder included.',
  },
  {
    icon: Share2Icon,
    title: 'Shared Dashboards',
    description: 'Generate a public link to share your analytics with clients, teammates, or the world. No login required for viewers.',
  },
  {
    icon: GlobeIcon,
    title: 'Geographic Insights',
    description: 'See where your visitors are from — country, region, and city level. All derived at request time; IP addresses are never stored.',
  },
]

const technicalFeatures = [
  {
    title: 'One-Line Installation',
    description: 'Add a single <script> tag to your site. Works with any framework — React, Vue, Angular, WordPress, Shopify, and 70+ more.',
    link: { href: '/integrations', label: 'View all integrations' },
  },
  {
    title: 'Open Source',
    description: 'Our frontend is fully open source on GitHub. Inspect the code, contribute, or self-host. Transparency is a feature.',
    link: { href: 'https://github.com/ciphera-net/pulse', label: 'View on GitHub', external: true },
  },
  {
    title: 'Swiss Infrastructure',
    description: 'All data is processed and stored in Switzerland, one of the strongest privacy jurisdictions in the world.',
  },
  {
    title: 'No Cookie Banners',
    description: 'Since we don\'t use cookies, you can skip the annoying consent popups entirely. Better UX for your visitors.',
  },
  {
    title: '100% Data Ownership',
    description: 'Your analytics data belongs to you, not us. We never sell, share, or mine your data for advertising.',
  },
  {
    title: 'Bot & Spam Filtering',
    description: 'Automatic exclusion of bots, crawlers, and data-center traffic. Your metrics reflect real human visitors.',
  },
]

const deviceInsights = [
  { label: 'Browsers', description: 'Chrome, Firefox, Safari, Edge, and more' },
  { label: 'Operating Systems', description: 'Windows, macOS, Linux, iOS, Android' },
  { label: 'Device Types', description: 'Desktop, mobile, and tablet breakdowns' },
  { label: 'Screen Resolutions', description: 'Responsive design intelligence' },
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

        {/* * ─── PILLAR CARDS (Privacy, Dashboard, Lightweight) ─── */}
        <div className="grid md:grid-cols-3 gap-6 text-left mb-24">
          {heroFeatures.map((feature, i) => (
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

        {/* * ─── CORE CAPABILITIES ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-white mb-4">
            Powerful analytics, <span className="gradient-text">simplified</span>
          </h2>
          <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
            Everything from real-time dashboards to conversion funnels — without the bloat.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-24">
          {coreCapabilities.map((cap, i) => (
            <motion.div
              key={cap.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="group relative p-8 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 rounded-2xl hover:border-brand-orange/50 dark:hover:border-brand-orange/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="w-12 h-12 rounded-xl bg-brand-orange/10 flex items-center justify-center mb-6 text-brand-orange group-hover:scale-110 transition-transform duration-300">
                {typeof cap.icon === 'object' ? cap.icon : <cap.icon className="w-6 h-6" />}
              </div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-2">
                {cap.title}
              </h3>
              <p className="text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed">
                {cap.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* * ─── DEVICE & TECH INSIGHTS ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-24"
        >
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-white mb-4">
              Know your audience
            </h2>
            <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
              Understand which devices, browsers, and screen sizes your visitors use — so you can build for what matters.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {deviceInsights.map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="p-6 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 rounded-xl text-center"
              >
                <div className="w-10 h-10 rounded-lg bg-brand-orange/10 flex items-center justify-center mx-auto mb-4 text-brand-orange">
                  <EyeIcon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-neutral-900 dark:text-white mb-1">{item.label}</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* * ─── CONTENT ANALYTICS HIGHLIGHT ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-24 p-10 md:p-14 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 rounded-2xl"
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
                {['Top pages by views & unique visitors', 'Entry pages — first impressions that work', 'Exit pages — where you lose attention', 'Referral sources — where traffic comes from'].map((item) => (
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
                  className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-700"
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

        {/* * ─── TECHNICAL & TRUST FEATURES ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-white mb-4">
            Built for trust
          </h2>
          <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
            Open source, Swiss hosted, and designed to keep your visitors&apos; data where it belongs — with them.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-24">
          {technicalFeatures.map((feat, i) => (
            <motion.div
              key={feat.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="p-8 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 rounded-2xl"
            >
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-2">
                {feat.title}
              </h3>
              <p className="text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed mb-4">
                {feat.description}
              </p>
              {feat.link && (
                feat.link.external ? (
                  <a
                    href={feat.link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-brand-orange hover:underline"
                  >
                    {feat.link.label}
                    <ArrowRightIcon className="w-4 h-4" />
                  </a>
                ) : (
                  <Link
                    href={feat.link.href}
                    className="inline-flex items-center gap-1 text-sm font-medium text-brand-orange hover:underline"
                  >
                    {feat.link.label}
                    <ArrowRightIcon className="w-4 h-4" />
                  </Link>
                )
              )}
            </motion.div>
          ))}
        </div>

        {/* * ─── HOW IT WORKS ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-24"
        >
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-white mb-4">
              Up and running in <span className="gradient-text">3 minutes</span>
            </h2>
            <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
              No SDKs to install, no build steps, no configuration files.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                step: '1',
                title: 'Create your site',
                description: 'Sign up and add your domain. We verify ownership automatically.',
              },
              {
                step: '2',
                title: 'Add the script',
                description: 'Paste one <script> tag before your closing </head>. That\'s it.',
              },
              {
                step: '3',
                title: 'Watch the data flow',
                description: 'Visit your dashboard to see real-time analytics. No waiting period.',
              },
            ].map((s, i) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.15 }}
                className="relative p-8 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 rounded-2xl text-center"
              >
                <div className="w-10 h-10 rounded-full bg-brand-orange text-white font-bold text-lg flex items-center justify-center mx-auto mb-6">
                  {s.step}
                </div>
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-2">
                  {s.title}
                </h3>
                <p className="text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed">
                  {s.description}
                </p>
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
