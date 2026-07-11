'use client'

/**
 * @file Integrations overview — search, mono tab filters, and a hairline logo grid.
 *
 * Rebuilt onto the marketing section grammar (design §5.7). The void fix is the
 * point: every section renders at first paint — no scroll-gated motion, nothing
 * starts hidden, content is visible with JS off. The 75+ tiles, 7 categories,
 * search, and the "Request integration" closer all stay.
 *
 * Category headers use PLAIN mono labels, not `NN ·` numbering (D9, decided
 * in-task — see the comment above CATEGORY_TABS). Filter pills became mono text
 * tabs on the FAQ-rail recipe with a roving tabindex that moves DOM focus
 * (copied from HomeFAQ). Logo tiles are HairlineGrid cells (`bg-card`, logo +
 * name); brand logo colours stay — logos are logos.
 *
 * This route is client-auth-gated (pre-existing): a fresh unauthenticated
 * visitor lands on the marketing rail; an authenticated user gets DashboardShell.
 * The gate lives in `app/layout-content.tsx` and is untouched here.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowRightIcon, Button, SearchIcon, XIcon } from '@ciphera-net/facet'
import { cn } from '@/lib/utils'
import { MarketingSection } from '@/components/marketing/system/MarketingSection'
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

// * D9 decision (decided in-task): category headers render as PLAIN mono labels
// * (`Backend Frameworks`, `CMS & Blogging`, …) WITHOUT the `NN ·` numbering.
// * Reasoning: (1) the design doc's own §5.7 doubt — numbering an integration
// * directory is index-of-content chrome that competes with the logo grid for
// * attention rather than anchoring it; (2) the labels are already long, multi-
// * word names ("Static Sites & Documentation"), so a leading `03 ·` reads as
// * clutter, not structure; (3) the tab rail already carries zero-padded COUNTS
// * per category, so the numeric/index register is spoken there — repeating it
// * on the headers would double the accounting. The page does not read flat
// * because the tab rail, the search affordance, and the hairline cell borders
// * supply the structure that numbering would otherwise provide.
const CATEGORY_TABS: { key: IntegrationCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  ...categoryOrder.map((cat) => ({ key: cat, label: categoryLabels[cat] })),
]

export default function IntegrationsPage() {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory | 'all'>('all')
  const searchRef = useRef<HTMLInputElement>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

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

  const selectCategory = useCallback((cat: IntegrationCategory | 'all') => {
    setActiveCategory(cat)
  }, [])

  // Roving tabindex: arrow keys move both selection and DOM focus along the rail
  // (copied from HomeFAQ so the tab UI behaves identically across the surface).
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const last = CATEGORY_TABS.length - 1
      let next: number | null = null
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = index === last ? 0 : index + 1
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = index === 0 ? last : index - 1
      else if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = last
      if (next === null) return
      e.preventDefault()
      selectCategory(CATEGORY_TABS[next].key)
      tabRefs.current[next]?.focus()
    },
    [selectCategory],
  )

  const activeIndex = CATEGORY_TABS.findIndex((t) => t.key === activeCategory)

  return (
    <>
      {/* ── HERO + RAIL ── */}
      <MarketingSection>
        <div className="max-w-2xl">
          <p className="font-mono text-xs text-muted-foreground">Pulse · Integrations</p>
          <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
            Integrations
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg">
            Connect Pulse with {integrations.length}+ frameworks, CMS platforms, and hosting
            providers. One script tag — any stack, up and running in minutes.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" variant="outline">
              <a
                href="https://docs.ciphera.net/pulse/script-installation"
                target="_blank"
                rel="noopener noreferrer"
              >
                Installation docs
                <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          </div>
        </div>

        {/* ── SEARCH + FILTER RAIL ── */}
        <div className="mt-12">
          <div className="relative max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <SearchIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search integrations…"
              aria-label="Search integrations"
              className="h-10 w-full border border-border bg-card pl-10 pr-16 font-mono text-sm text-foreground placeholder:font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
                aria-label="Clear search"
              >
                <XIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <kbd className="hidden items-center border border-border bg-background px-1.5 py-0.5 font-mono text-xs text-muted-foreground sm:inline-flex">
                  /
                </kbd>
              </div>
            )}
          </div>

          {isFiltering && (
            <p className="mt-3 font-mono text-xs text-muted-foreground">
              {totalResults} {totalResults === 1 ? 'integration' : 'integrations'} found
              {query && <> for &ldquo;{query}&rdquo;</>}
            </p>
          )}

          {/* Filter tabs — mono text, roving tabindex WITH DOM focus following. */}
          <div
            role="tablist"
            aria-label="Filter integrations by category"
            className="mt-6 flex flex-wrap gap-x-6 gap-y-2"
          >
            {CATEGORY_TABS.map((tab, i) => {
              const isActive = tab.key === activeCategory
              return (
                <button
                  key={tab.key}
                  ref={(el) => {
                    tabRefs.current[i] = el
                  }}
                  type="button"
                  role="tab"
                  id={`integration-tab-${i}`}
                  tabIndex={isActive ? 0 : -1}
                  aria-selected={isActive}
                  onClick={() => selectCategory(tab.key)}
                  onKeyDown={(e) => handleTabKeyDown(e, i)}
                  className={cn(
                    'py-1.5 text-left font-mono text-xs transition-colors duration-150 motion-reduce:transition-none',
                    isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      </MarketingSection>

      {/* ── GRID ── */}
      <MarketingSection aria-labelledby={`integration-tab-${activeIndex >= 0 ? activeIndex : 0}`}>
        {hasResults ? (
          <div className="space-y-16">
            {/* Popular — pinned row, shown only in the unfiltered overview. */}
            {popularIntegrations.length > 0 && (
              <div>
                <p className="mb-6 font-mono text-xs text-muted-foreground">Popular</p>
                <div className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
                  {popularIntegrations.map((integration) => (
                    <div
                      key={integration!.id}
                      className="flex items-center gap-3 bg-card p-4"
                    >
                      <div className="shrink-0 [&_svg]:h-6 [&_svg]:w-6">{integration!.icon}</div>
                      <span className="text-sm font-semibold text-foreground">
                        {integration!.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Category groups — plain mono labels (D9). */}
            {filteredGroups.map((group) => {
              // Compact tiles in the default overview; full description cards when
              // the visitor has narrowed to a category or is searching.
              const compact = activeCategory === 'all' && query.trim() === ''
              return (
                <div key={group.category}>
                  <p className="mb-6 font-mono text-xs text-muted-foreground">
                    {group.label}
                    <span className="ml-2 tabular-nums text-muted-foreground/60">
                      {String(group.items.length).padStart(2, '0')}
                    </span>
                  </p>
                  {compact ? (
                    <div className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
                      {group.items.map((integration) => (
                        <div
                          key={integration.id}
                          className="flex items-center gap-3 bg-card p-4"
                        >
                          <div className="shrink-0 [&_svg]:h-6 [&_svg]:w-6">
                            {integration.icon}
                          </div>
                          <span className="text-sm font-semibold text-foreground">
                            {integration.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
                      {group.items.map((integration) => (
                        <div key={integration.id} className="bg-card p-6">
                          <div className="mb-6 [&_svg]:h-8 [&_svg]:w-8">
                            {integration.icon}
                          </div>
                          <h3 className="mb-2 text-base font-semibold text-foreground">
                            {integration.name}
                          </h3>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            {integration.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          // No results — a quiet bordered notice.
          <div className="border border-border bg-card p-10 text-center">
            <p className="font-mono text-xs text-muted-foreground">No matches</p>
            <h3 className="mt-3 text-lg font-semibold text-foreground">
              Nothing found for &ldquo;{query}&rdquo;
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Let us know which integration you&apos;d like to see next and we&apos;ll take a
              look.
            </p>
            <div className="mt-6 flex justify-center">
              <Button asChild size="lg">
                <a href="mailto:support@ciphera.net">Request integration</a>
              </Button>
            </div>
          </div>
        )}
      </MarketingSection>

      {/* ── REQUEST INTEGRATION — quiet bordered CTA row ── */}
      {hasResults && (
        <MarketingSection>
          <div className="flex flex-col items-start justify-between gap-6 border border-border bg-card p-8 sm:flex-row sm:items-center">
            <div>
              <p className="font-mono text-xs text-muted-foreground">Missing something?</p>
              <p className="mt-3 text-lg font-semibold text-foreground">
                Request an integration.
              </p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                Pulse is a single script tag, so it already works anywhere. Tell us the platform
                you&apos;d like a dedicated guide for and we&apos;ll add it.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <a href="mailto:support@ciphera.net">Request integration</a>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/installation">
                  Read the docs
                  <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </MarketingSection>
      )}
    </>
  )
}
