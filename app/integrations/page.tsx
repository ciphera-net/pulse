'use client'

/**
 * @file Integrations overview page with search, category filters, and grouped grid.
 *
 * Displays all 75+ integrations in a filterable, searchable grid.
 * Features: search with result count, category chips, popular section,
 * keyboard shortcut (/ to focus search), and "Missing something?" card.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRightIcon } from '@ciphera-net/ui'
import {
  integrations,
  categoryLabels,
  categoryOrder,
  type IntegrationCategory,
} from '@/lib/integrations'

// * IDs of popular integrations shown in the pinned "Popular" row
const POPULAR_IDS = [
  'nextjs', 'react', 'wordpress', 'shopify', 'webflow', 'vue', 'astro', 'vercel',
]

export default function IntegrationsPage() {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory | 'all'>('all')
  const searchRef = useRef<HTMLInputElement>(null)

  // * Keyboard shortcut: "/" to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // * Filter integrations by search query + active category
  const { filteredGroups, totalResults, popularIntegrations } = useMemo(() => {
    const q = query.toLowerCase().trim()
    const isSearching = q.length > 0
    const isCategoryFiltered = activeCategory !== 'all'

    let filtered = integrations

    if (isSearching) {
      filtered = filtered.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          categoryLabels[i.category].toLowerCase().includes(q),
      )
    }

    if (isCategoryFiltered) {
      filtered = filtered.filter((i) => i.category === activeCategory)
    }

    const groups = categoryOrder
      .map((cat) => ({
        category: cat as IntegrationCategory,
        label: categoryLabels[cat],
        items: filtered.filter((i) => i.category === cat),
      }))
      .filter((g) => g.items.length > 0)

    // * Only show popular row when not searching/filtering
    const popular =
      !isSearching && !isCategoryFiltered
        ? POPULAR_IDS.map((id) => integrations.find((i) => i.id === id)).filter(Boolean)
        : []

    return { filteredGroups: groups, totalResults: filtered.length, popularIntegrations: popular }
  }, [query, activeCategory])

  const hasResults = filteredGroups.length > 0
  const isFiltering = query.length > 0 || activeCategory !== 'all'

  const handleCategoryClick = useCallback((cat: IntegrationCategory | 'all') => {
    setActiveCategory(cat)
  }, [])

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden">
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
          className="text-center mb-10"
        >
          {/* * --- Title with count badge --- */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Integrations
            </h1>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-brand-orange/10 text-brand-orange border border-brand-orange/20">
              {integrations.length}+
            </span>
          </div>
          <p className="text-xl text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto leading-relaxed mb-8">
            Connect Pulse with {integrations.length}+ frameworks and platforms in minutes.
          </p>

          {/* * --- Search Input with "/" hint --- */}
          <div className="relative max-w-md mx-auto">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <svg
                className="w-5 h-5 text-neutral-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
            </div>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search integrations..."
              className="w-full pl-12 pr-16 py-3 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange/50 transition-all"
            />
            {query ? (
              <button
                onClick={() => setQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-4 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                aria-label="Clear search"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            ) : (
              <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-medium bg-neutral-200/80 dark:bg-neutral-700/80 text-neutral-500 dark:text-neutral-400 border border-neutral-300 dark:border-neutral-600">
                  /
                </kbd>
              </div>
            )}
          </div>

          {/* * --- Result count (shown when filtering) --- */}
          {isFiltering && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-neutral-500 dark:text-neutral-400 mt-3"
            >
              {totalResults} {totalResults === 1 ? 'integration' : 'integrations'} found
              {query && <> for &ldquo;{query}&rdquo;</>}
            </motion.p>
          )}
        </motion.div>

        {/* * --- Category Filter Chips --- */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="flex flex-wrap justify-center gap-2 mb-10"
        >
          <button
            onClick={() => handleCategoryClick('all')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              activeCategory === 'all'
                ? 'bg-brand-orange text-white shadow-sm'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            All
          </button>
          {categoryOrder.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryClick(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                activeCategory === cat
                  ? 'bg-brand-orange text-white shadow-sm'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              {categoryLabels[cat]}
            </button>
          ))}
        </motion.div>

        <AnimatePresence mode="wait">
          {hasResults ? (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* * --- Popular Integrations (pinned row) --- */}
              {popularIntegrations.length > 0 && (
                <div className="mb-12">
                  <motion.h2
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4 }}
                    className="text-lg font-semibold text-neutral-500 dark:text-neutral-400 mb-6 tracking-wide uppercase flex items-center gap-2"
                  >
                    <svg className="w-5 h-5 text-brand-orange" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 1l2.39 4.84 5.34.78-3.87 3.77.91 5.33L10 13.27l-4.77 2.5.91-5.33L2.27 6.67l5.34-.78L10 1z" />
                    </svg>
                    Popular
                  </motion.h2>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {popularIntegrations.map((integration, i) => (
                      <motion.div
                        key={integration!.id}
                        initial={{ opacity: 0, y: 15 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.4, delay: i * 0.05 }}
                      >
                        <Link
                          href={`/integrations/${integration!.id}`}
                          className="group flex items-center gap-3 p-4 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 rounded-xl hover:border-brand-orange/50 dark:hover:border-brand-orange/50 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg h-full"
                        >
                          <div className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg shrink-0 group-hover:scale-110 transition-transform duration-300 [&_svg]:w-6 [&_svg]:h-6">
                            {integration!.icon}
                          </div>
                          <span className="font-semibold text-neutral-900 dark:text-white text-sm">
                            {integration!.name}
                          </span>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* * --- Category Groups --- */}
              {filteredGroups.map((group) => (
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
                        transition={{ duration: 0.5, delay: i * 0.05 }}
                      >
                        <Link
                          href={`/integrations/${integration.id}`}
                          className="group relative p-6 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 rounded-2xl hover:border-brand-orange/50 dark:hover:border-brand-orange/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl block h-full focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-offset-2"
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
            </motion.div>
          ) : (
            // * --- No Results: "Missing something?" card ---
            <motion.div
              key="no-results"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="max-w-md mx-auto mt-8 p-10 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-2xl flex flex-col items-center justify-center text-center"
            >
              <div className="p-4 bg-neutral-100 dark:bg-neutral-800 rounded-full mb-4">
                <svg className="w-8 h-8 text-neutral-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">
                Missing something?
              </h3>
              <p className="text-neutral-600 dark:text-neutral-400 text-sm mb-1">
                No integrations found for &ldquo;{query}&rdquo;.
              </p>
              <p className="text-neutral-600 dark:text-neutral-400 text-sm mb-5">
                Let us know which integration you&apos;d like to see next.
              </p>
              <a
                href="mailto:support@ciphera.net"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-orange text-white font-medium rounded-lg hover:bg-brand-orange/90 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-offset-2"
              >
                Request Integration
              </a>
            </motion.div>
          )}
        </AnimatePresence>

        {/* * Request Integration Card — always shown when there ARE results */}
        {hasResults && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="max-w-md mx-auto mt-12 p-6 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-2xl flex flex-col items-center justify-center text-center"
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
        )}
      </div>
    </div>
  )
}
