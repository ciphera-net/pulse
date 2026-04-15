'use client'

import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth/context'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import { LoadingOverlay, Button } from '@ciphera-net/ui'
import { Cookie, ShieldCheck, Code, Lightning, ArrowRight, GithubLogo } from '@phosphor-icons/react'
import DashboardDemo from '@/components/marketing/DashboardDemo'
import FeatureSections from '@/components/marketing/FeatureSections'
import ComparisonCards from '@/components/marketing/ComparisonCards'
import CTASection from '@/components/marketing/CTASection'
import PulseFAQ from '@/components/marketing/PulseFAQ'
import HomeDashboard from '@/components/dashboard/HomeDashboard'

export default function HomePage() {
  const { user, loading: authLoading } = useAuth()

  if (authLoading) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" portal={false} />
  }

  if (!user) {
    return (
      <>
        {/* HERO — compact headline + live demo */}
        <div className="pt-20 pb-10 lg:pt-28 lg:pb-16">
          <div className="w-full max-w-6xl mx-auto px-6 text-center mb-16">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-[1.1] mb-6"
            >
              Analytics without the{' '}
              <span className="relative inline-block">
                <span className="gradient-text">surveillance.</span>
                <svg className="absolute -bottom-2 left-0 w-full h-3 text-brand-orange/30" viewBox="0 0 200 12" preserveAspectRatio="none">
                  <path d="M0 9C50 3 150 3 200 9" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-xl text-neutral-300 mb-8 leading-relaxed max-w-2xl mx-auto"
            >
              Respect your users&apos; privacy while getting the insights you need.
              No cookies, no IP tracking, fully GDPR compliant.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="flex flex-row gap-3 flex-wrap justify-center mb-8"
            >
              <Button onClick={() => initiateOAuthFlow()} variant="primary" className="px-6 py-3 shadow-lg shadow-brand-orange/20 gap-2">
                Try Pulse Free <ArrowRight weight="bold" className="w-4 h-4" />
              </Button>
              <Button onClick={() => window.open('https://github.com/ciphera-net/pulse', '_blank')} variant="secondary" className="px-6 py-3 border border-white/10 gap-2">
                <GithubLogo weight="bold" className="w-4 h-4" /> View on GitHub
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-neutral-400 justify-center"
            >
              <span className="flex items-center gap-2"><Cookie weight="bold" className="w-4 h-4" /> Cookie-free</span>
              <span className="text-neutral-700">|</span>
              <span className="flex items-center gap-2"><Code weight="bold" className="w-4 h-4" /> Open source client</span>
              <span className="text-neutral-700">|</span>
              <span className="flex items-center gap-2"><ShieldCheck weight="bold" className="w-4 h-4" /> GDPR compliant</span>
              <span className="text-neutral-700">|</span>
              <span className="flex items-center gap-2"><Lightning weight="bold" className="w-4 h-4" /> Under 2KB</span>
            </motion.div>
          </div>

          {/* Live Dashboard Demo */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="w-full max-w-7xl mx-auto px-6"
          >
            <DashboardDemo />
          </motion.div>
        </div>

        <FeatureSections />
        <ComparisonCards />
        <PulseFAQ />
        <CTASection />
      </>
    )
  }

  // * Wait for organization context before mounting HomeDashboard so its data
  // * hooks (useSites, etc.) only fire once auth is fully ready — prevents the
  // * post-login race where SWR caches an empty/401 response for 30s.
  if (!user.org_id) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" portal={false} />
  }

  return <HomeDashboard />
}
