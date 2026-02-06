'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRightIcon } from '@ciphera-net/ui'
import { getGroupedIntegrations } from '@/lib/integrations'

export default function IntegrationsPage() {
  const groups = getGroupedIntegrations()

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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 dark:text-white mb-6">
            Integrations
          </h1>
          <p className="text-xl text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto leading-relaxed">
            Connect Pulse with your favorite frameworks and platforms in minutes.
          </p>
        </motion.div>

        {groups.map((group) => (
          <div key={group.category} className="mb-12">
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="text-lg font-semibold text-neutral-500 dark:text-neutral-400 mb-6 tracking-wide uppercase"
            >
              {group.label}
            </motion.h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {group.items.map((integration, i) => (
                <motion.div
                  key={integration.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                >
                  <Link
                    href={`/integrations/${integration.id}`}
                    className="group relative p-8 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 rounded-2xl hover:border-brand-orange/50 dark:hover:border-brand-orange/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl block focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-offset-2"
                  >
                    <div className="flex items-start justify-between mb-6">
                      <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-xl group-hover:scale-110 transition-transform duration-300">
                        {integration.icon}
                      </div>
                      <ArrowRightIcon className="w-5 h-5 text-neutral-400 group-hover:text-brand-orange transition-colors" />
                    </div>

                    <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-3">
                      {integration.name}
                    </h3>
                    <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed mb-4">
                      {integration.description}
                    </p>
                    <span className="text-sm font-medium text-brand-orange opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      View Guide <span aria-hidden="true">&rarr;</span>
                    </span>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        ))}

        {/* * Request Integration Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-md mx-auto p-8 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-2xl flex flex-col items-center justify-center text-center"
        >
          <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">
            Missing something?
          </h3>
          <p className="text-neutral-600 dark:text-neutral-400 text-sm mb-4">
            Let us know which integration you&apos;d like to see next.
          </p>
          <a
            href="mailto:support@ciphera.net"
            className="text-sm font-medium text-brand-orange hover:underline focus:outline-none focus:ring-2 focus:ring-brand-orange focus:rounded"
          >
            Request Integration
          </a>
        </motion.div>
      </div>
    </div>
  )
}
