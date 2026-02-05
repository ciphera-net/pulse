'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRightIcon } from '@ciphera-net/ui'

const integrations = [
  {
    id: 'nextjs',
    name: 'Next.js',
    description: 'Add privacy-friendly analytics to your Next.js application using next/script.',
    icon: (
      <svg viewBox="0 0 128 128" className="w-8 h-8 dark:invert">
        <path d="M64 0C28.7 0 0 28.7 0 64s28.7 64 64 64 64-28.7 64-64S99.3 0 64 0zm27.6 93.9c-.8.9-2.2 1-3.1.2L42.8 52.8V88c0 1.3-1.1 2.3-2.3 2.3h-7.4c-1.3 0-2.3-1.1-2.3-2.3V40c0-1.3 1.1-2.3 2.3-2.3h7.4c1 0 1.9.6 2.2 1.5l48.6 44.8V40c0-1.3 1.1-2.3 2.3-2.3h7.4c1.3 0 2.3 1.1 2.3 2.3v48c0 1.3-1.1 2.3-2.3 2.3h-6.8c-.9 0-1.7-.5-2.1-1.3z" />
      </svg>
    ),
  },
  {
    id: 'react',
    name: 'React',
    description: 'Integrate Pulse with any React SPA (Create React App, Vite, etc).',
    icon: (
      <svg viewBox="0 0 128 128" className="w-8 h-8 text-[#61DAFB] fill-current">
        <path d="M64 10.6c18.4 0 34.6 5.8 44.6 14.8 6.4 5.8 10.2 12.8 10.2 20.6 0 21.6-28.6 41.2-64 41.2-1.6 0-3.2-.1-4.8-.2-1.2 10.8-6.2 20.2-13.8 27.6-8.8 8.6-20.6 13.4-33.2 13.4-2.2 0-4.4-.2-6.4-.4 10.2-12.8 15.6-29.2 15.6-46.2 0-2.6-.2-5.2-.4-7.8 13.6-1.6 26.2-5.4 37.4-11 11.2-5.6 20.2-13 26.2-21.4-6.4-5.8-15.4-10-25.6-12.2-10.2-2.2-21.4-3.4-33-3.4-1.6 0-3.2.1-4.8.2 1.2-10.8 6.2-20.2 13.8-27.6 8.8-8.6 20.6-13.4 33.2-13.4 2.2 0 4.4.2 6.4.4-10.2 12.8-15.6 29.2-15.6 46.2 0 2.6.2 5.2.4 7.8-13.6 1.6-26.2 5.4-37.4 11-11.2 5.6-20.2 13-26.2 21.4 6.4 5.8 15.4 10 25.6 12.2 10.2 2.2 21.4 3.4 33 3.4zm-33.4 62c-11.2 5.6-20.2 13-26.2 21.4 6.4 5.8 15.4 10 25.6 12.2 10.2 2.2 21.4 3.4 33 3.4 1.6 0 3.2-.1 4.8-.2-1.2 10.8-6.2 20.2-13.8 27.6-8.8 8.6-20.6 13.4-33.2 13.4-2.2 0-4.4-.2-6.4-.4 10.2-12.8 15.6-29.2 15.6-46.2 0-2.6-.2-5.2-.4-7.8 13.6-1.6 26.2-5.4 37.4-11zm-15.2-16.6c-6.4-5.8-10.2-12.8-10.2-20.6 0-21.6 28.6-41.2 64-41.2 1.6 0 3.2.1 4.8.2 1.2-10.8 6.2-20.2 13.8-27.6 8.8-8.6 20.6-13.4 33.2-13.4 2.2 0 4.4.2 6.4.4-10.2 12.8-15.6 29.2-15.6 46.2 0 2.6.2 5.2.4 7.8-13.6 1.6-26.2 5.4-37.4 11-11.2 5.6-20.2 13-26.2 21.4 6.4 5.8 15.4 10 25.6 12.2 10.2 2.2 21.4 3.4 33 3.4 1.6 0 3.2-.1 4.8-.2-1.2 10.8-6.2 20.2-13.8 27.6-8.8 8.6-20.6 13.4-33.2 13.4-2.2 0-4.4-.2-6.4-.4 10.2-12.8 15.6-29.2 15.6-46.2 0-2.6-.2-5.2-.4-7.8z" />
        <circle cx="64" cy="64" r="10.6" />
      </svg>
    ),
  },
  {
    id: 'vue',
    name: 'Vue.js',
    description: 'Simple setup for Vue 2 and Vue 3 applications.',
    icon: (
      <svg viewBox="0 0 128 128" className="w-8 h-8 text-[#4FC08D] fill-current">
        <path d="M82.8 24.6h27.8L64 103.4 17.4 24.6h27.8L64 59.4l18.8-34.8z" />
        <path d="M64 24.6H39L64 67.4l25-42.8H64z" fill="#35495E" />
      </svg>
    ),
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    description: 'Add the tracking script to your WordPress header or use a plugin.',
    icon: (
      <svg viewBox="0 0 128 128" className="w-8 h-8 text-[#21759B] fill-current">
        <path d="M116.6 64c0-19.2-10.4-36-26-45.2l28.6 78.4c-1 3.2-2.2 6.2-3.6 9.2-11.4 12.4-27.8 20.2-46 20.2-6.2 0-12.2-.8-17.8-2.4l26.2-76.4c1.2.2 2.4.4 3.6.4 5.4 0 13.8-.8 13.8-.8 2.8-.2 3.2 4 .4 4.2 0 0-2.8.2-6 .4l19 56.6 5.4-18c2.4-7.4 4.2-12.8 4.2-17.4 0-6-2.2-10.2-7.6-12.6-2.8-1.2-2.2-5.4 1.4-5.4h4.4zM64 121.2c-15.8 0-30.2-6.4-40.8-16.8L46.6 36.8c-2.8-.2-5.8-.4-5.8-.4-2.8-.2-2.4-4.4.4-4.2 0 0 8.4.8 13.6.8 5.4 0 13.6-.8 13.6-.8 2.8-.2 3.2 4 .4 4.2 0 0-2.8.2-5.8.4l18.2 54.4 10.6-31.8L64 121.2zM11.4 64c0 17 8.2 32.2 20.8 41.8L18.8 66.8c-.8-3.4-1.2-6.6-1.2-9.2 0-6.8 2.6-13 6.2-17.8C15.6 47.4 11.4 55.2 11.4 64zM64 6.8c16.2 0 30.8 6.8 41.4 17.6-1.4-.2-2.8-.2-4.2-.2-7.8 0-14.2 1.4-14.2 1.4-2.8.6-2.2 4.8.6 4.2 0 0 5-1 10.6-1 2.2 0 4.6.2 6.6.4L88.2 53 71.4 6.8h-7.4z" />
      </svg>
    ),
  },
]

export default function IntegrationsPage() {
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {integrations.map((integration, i) => (
            <motion.div
              key={integration.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <Link 
                href={`/integrations/${integration.id}`}
                className="group relative p-8 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 rounded-2xl hover:border-brand-orange/50 dark:hover:border-brand-orange/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl block"
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
          ))}
          
          {/* * Request Integration Card */}
          <div className="p-8 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-2xl flex flex-col items-center justify-center text-center">
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-2">
              Missing something?
            </h3>
            <p className="text-neutral-600 dark:text-neutral-400 text-sm mb-4">
              Let us know which integration you'd like to see next.
            </p>
            <a 
              href="mailto:support@ciphera.net" 
              className="text-sm font-medium text-brand-orange hover:underline"
            >
              Request Integration
            </a>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
