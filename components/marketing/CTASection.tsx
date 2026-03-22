'use client'

import { motion } from 'framer-motion'
import { ArrowRight } from '@phosphor-icons/react'
import { Button } from '@ciphera-net/ui'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import Link from 'next/link'

export default function CTASection() {
  return (
    <section className="py-20 lg:py-32">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-neutral-900/80 px-6 py-20 sm:px-10 sm:py-24 max-w-6xl mx-auto"
        >
          {/* Atmosphere inside card */}
          <div className="absolute inset-0 -z-10 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-orange/5 rounded-full blur-[150px]" />
          </div>

          <div className="relative z-10 text-center max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Start tracking with privacy.
            </h2>
            <p className="text-lg text-neutral-300 mb-10">
              Join thousands of developers who respect their users&apos; privacy while getting the insights they need.
            </p>
            <div className="flex flex-row gap-3 justify-center flex-wrap">
              <Button onClick={() => initiateOAuthFlow()} variant="primary" className="px-6 py-3 shadow-lg shadow-brand-orange/20 gap-2">
                Try Pulse Free <ArrowRight weight="bold" className="w-4 h-4" />
              </Button>
              <Link href="/pricing">
                <Button variant="secondary" className="px-6 py-3">
                  View Pricing
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
