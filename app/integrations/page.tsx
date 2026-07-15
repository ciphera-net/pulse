'use client'

/**
 * @file Integrations directory — searchable, tier-aware, interactive.
 *
 * Redesign (§7.3): every tile is now a real Link to its per-integration guide
 * (`/integrations/[slug]`) with a Facet hover + focus ring; each carries an
 * honest support-tier micro-badge sourced from the registry; a featured band of
 * Tier-1 verified platforms leads, then a dense directory for the long tail. The
 * grid uses auto-fill so incomplete rows never leave half-empty `bg-card` cells.
 *
 * This route is client-auth-gated (pre-existing): an unauthenticated visitor
 * gets the marketing rail; an authenticated user gets DashboardShell. The gate
 * lives in `app/layout-content.tsx` and is untouched here.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowRightIcon, Button, SearchIcon, XIcon } from '@ciphera-net/facet'
import { cn } from '@/lib/utils'
import { MarketingSection } from '@/components/marketing/system/MarketingSection'
import { TierBadge } from '@/components/integrations/TierBadge'
import {
  integrations,
  categoryLabels,
  categoryOrder,
  supportTierLabels,
  type Integration,
  type IntegrationCategory,
  type SupportTier,
} from '@/lib/integrations'

const CATEGORY_TABS: { key: IntegrationCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  ...categoryOrder.map((cat) => ({ key: cat, label: categoryLabels[cat] })),
]

const TIER_FILTERS: { key: SupportTier | 'all'; label: string }[] = [
  { key: 'all', label: 'All tiers' },
  { key: 'verified', label: supportTierLabels.verified },
  { key: 'standard-snippet', label: supportTierLabels['standard-snippet'] },
  { key: 'plan-gated', label: supportTierLabels['plan-gated'] },
  { key: 'special-handling', label: supportTierLabels['special-handling'] },
]

// * The featured band: Tier-1 verified platforms, ordered by pickerRank then name.
const FEATURED = integrations
  .filter((i) => i.supportTier === 'verified')
  .sort((a, b) => {
    if (a.pickerRank != null && b.pickerRank != null) return a.pickerRank - b.pickerRank
    if (a.pickerRank != null) return -1
    if (b.pickerRank != null) return 1
    return a.name.localeCompare(b.name)
  })

function IntegrationCard({ integration }: { integration: Integration }) {
  return (
    <Link
      href={`/integrations/${integration.id}`}
      className="group flex items-center gap-3 bg-card p-4 transition-colors duration-150 ease-apple hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
    >
      <div className="shrink-0 [&_svg]:h-6 [&_svg]:w-6">{integration.icon}</div>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
        {integration.name}
      </span>
      <TierBadge tier={integration.supportTier} />
    </Link>
  )
}

export default function IntegrationsPage() {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory | 'all'>('all')
  const [activeTier, setActiveTier] = useState<SupportTier | 'all'>('all')
  const searchRef = useRef<HTMLInputElement>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

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

  const { filteredGroups, totalResults } = useMemo(() => {
    const q = query.toLowerCase().trim()
    let filtered = integrations
    if (q) {
      filtered = filtered.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          categoryLabels[i.category].toLowerCase().includes(q),
      )
    }
    if (activeCategory !== 'all') filtered = filtered.filter((i) => i.category === activeCategory)
    if (activeTier !== 'all') filtered = filtered.filter((i) => i.supportTier === activeTier)

    const groups = categoryOrder
      .map((cat) => ({
        category: cat as IntegrationCategory,
        label: categoryLabels[cat],
        items: filtered.filter((i) => i.category === cat),
      }))
      .filter((g) => g.items.length > 0)

    return { filteredGroups: groups, totalResults: filtered.length }
  }, [query, activeCategory, activeTier])

  const hasResults = filteredGroups.length > 0
  const isFiltering = query.length > 0 || activeCategory !== 'all' || activeTier !== 'all'
  const showFeatured = !isFiltering

  const selectCategory = useCallback((cat: IntegrationCategory | 'all') => {
    setActiveCategory(cat)
  }, [])

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
            providers. One script tag — any stack. Every platform below carries an honest support
            tier so you know exactly what to expect.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" variant="outline">
              <a href="https://help.ciphera.net/docs/pulse/script-installation" target="_blank" rel="noopener noreferrer">
                Installation docs
                <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          </div>
        </div>

        {/* Search + filters */}
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

          {/* Category tabs (roving tabindex) */}
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
                  tabIndex={isActive ? 0 : -1}
                  aria-selected={isActive}
                  onClick={() => selectCategory(tab.key)}
                  onKeyDown={(e) => handleTabKeyDown(e, i)}
                  className={cn(
                    'border-b py-1.5 text-left font-mono text-xs transition-colors duration-150 motion-reduce:transition-none',
                    isActive
                      ? 'border-brand-orange text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Tier filter */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {TIER_FILTERS.map((t) => {
              const isActive = t.key === activeTier
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTier(t.key)}
                  className={cn(
                    'rounded-none border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors duration-150 ease-apple motion-reduce:transition-none',
                    isActive
                      ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      </MarketingSection>

      {/* ── FEATURED (Tier-1 verified) ── */}
      {showFeatured && (
        <MarketingSection>
          <p className="mb-6 font-mono text-xs text-muted-foreground">Verified · first-class support</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-px border border-border bg-border">
            {FEATURED.map((integration) => (
              <Link
                key={integration.id}
                href={`/integrations/${integration.id}`}
                className="group flex flex-col gap-3 bg-card p-5 transition-colors duration-150 ease-apple hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
              >
                <div className="flex items-center justify-between">
                  <div className="[&_svg]:h-8 [&_svg]:w-8">{integration.icon}</div>
                  <TierBadge tier={integration.supportTier} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">{integration.name}</h3>
                  {integration.snippet?.label && (
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {integration.snippet.label}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </MarketingSection>
      )}

      {/* ── DIRECTORY ── */}
      <MarketingSection>
        {hasResults ? (
          <div className="space-y-14">
            {filteredGroups.map((group) => (
              <div key={group.category}>
                <p className="mb-6 font-mono text-xs text-muted-foreground">
                  {group.label}
                  <span className="ml-2 tabular-nums text-muted-foreground/60">
                    {String(group.items.length).padStart(2, '0')}
                  </span>
                </p>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-px border border-border bg-border">
                  {group.items.map((integration) => (
                    <IntegrationCard key={integration.id} integration={integration} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-border bg-card p-10 text-center">
            <p className="font-mono text-xs text-muted-foreground">No matches</p>
            <h3 className="mt-3 text-lg font-semibold text-foreground">
              Nothing found{query && <> for &ldquo;{query}&rdquo;</>}
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Pulse is a single script tag, so it already works anywhere. Tell us which platform
              you&apos;d like a dedicated guide for and we&apos;ll add it.
            </p>
            <div className="mt-6 flex justify-center">
              <Button asChild size="lg">
                <a href="mailto:support@ciphera.net">Request integration</a>
              </Button>
            </div>
          </div>
        )}
      </MarketingSection>

      {/* ── REQUEST CTA ── */}
      {hasResults && (
        <MarketingSection>
          <div className="flex flex-col items-start justify-between gap-6 border border-border bg-card p-8 sm:flex-row sm:items-center">
            <div>
              <p className="font-mono text-xs text-muted-foreground">Missing something?</p>
              <p className="mt-3 text-lg font-semibold text-foreground">Request an integration.</p>
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
