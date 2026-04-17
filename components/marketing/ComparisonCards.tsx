'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { Check, X } from '@phosphor-icons/react'

const pulseFeatures = [
  { label: 'No cookies required', has: true },
  { label: 'GDPR compliant by default', has: true },
  { label: 'No consent banner needed', has: true },
  { label: 'Open source client', has: true },
  { label: 'Script under 2KB', has: true },
  { label: 'Swiss infrastructure', has: true },
  { label: 'No cross-site tracking', has: true },
  { label: 'Free tier available', has: true },
  { label: 'Real-time dashboard', has: true },
]

const gaFeatures = [
  { label: 'Requires cookies', has: false },
  { label: 'GDPR requires configuration', has: false },
  { label: 'Consent banner required', has: false },
  { label: 'Closed source', has: false },
  { label: 'Script over 45KB', has: false },
  { label: 'US infrastructure', has: false },
  { label: 'Cross-site tracking', has: false },
  { label: 'Free tier available', has: true },
  { label: 'Real-time dashboard', has: true },
]

export default function ComparisonCards() {
  return (
    <section className="py-20 lg:py-32 border-t border-white/[0.04]">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
            How Pulse compares.
          </h2>
          <p className="text-lg text-neutral-400 max-w-2xl mx-auto">
            Privacy-first analytics doesn&apos;t mean less insight. See how Pulse stacks up.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Pulse — highlighted */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="glass-surface rounded-2xl border-brand-orange/20 p-8 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-brand-orange" />
            <div className="flex items-center gap-3 mb-6">
              <Image src="/pulse_icon_no_margins.png" alt="Pulse" width={40} height={40} className="rounded-lg" unoptimized />
              <div>
                <h3 className="text-xl font-bold text-white">Pulse</h3>
                <p className="text-xs text-brand-orange">Privacy-first analytics</p>
              </div>
            </div>
            <ul className="space-y-4">
              {pulseFeatures.map((f) => (
                <li key={f.label} className="flex items-center gap-3">
                  <Check weight="bold" className="w-5 h-5 text-brand-orange shrink-0" />
                  <span className="text-neutral-300 text-sm">{f.label}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Google Analytics — muted */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="glass-surface rounded-2xl p-8"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center text-lg">
                📊
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Google Analytics</h3>
                <p className="text-xs text-neutral-500">Traditional tracking</p>
              </div>
            </div>
            <ul className="space-y-4">
              {gaFeatures.map((f) => (
                <li key={f.label} className="flex items-center gap-3">
                  {f.has ? (
                    <Check weight="bold" className="w-5 h-5 text-green-500 shrink-0" />
                  ) : (
                    <X weight="bold" className="w-5 h-5 text-red-500 shrink-0" />
                  )}
                  <span className="text-neutral-400 text-sm">{f.label}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
