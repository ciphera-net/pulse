'use client'

import Link from 'next/link'
import { Site } from '@/lib/api/sites'
import type { Stats } from '@/lib/api/stats'
import { formatNumber } from '@/lib/utils/format'
import { BarChartIcon, SettingsIcon, BookOpenIcon, ExternalLinkIcon, Button } from '@ciphera-net/facet'
import { SiteFavicon } from '@/components/sites/SiteFavicon'
import { PlusCircle } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useCan } from '@/lib/auth/permissions'

export type SiteStatsMap = Record<string, { stats: Stats }>

interface SiteListProps {
  sites: Site[]
  siteStats: SiteStatsMap
  loading: boolean
}

interface SiteCardProps {
  site: Site
  stats: Stats | null
  statsLoading: boolean
}

function SiteCard({ site, stats, statsLoading }: SiteCardProps) {
  const visitors24h = stats?.visitors ?? 0
  const pageviews = stats?.pageviews ?? 0
  // The settings gear was unguarded, unlike its sidebar counterpart — a
  // viewer/member clicking it just lands on the "Access restricted" screen.
  const canEditSite = useCan('sites.edit')

  return (
    <div className="group relative flex flex-col rounded-none border border-neutral-800 bg-neutral-900 p-6 transition-all duration-base hover:border-neutral-700 active:scale-[0.99] ease-apple">
      {/* Header: Icon + Name + Live Status */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 overflow-hidden rounded-none border border-neutral-800 bg-neutral-800 p-1">
            <SiteFavicon
              domain={site.domain}
              name={site.name}
              size={40}
              className="object-contain"
            />
          </div>
          <div>
            <h3 className="font-semibold text-white">{site.name}</h3>
            <div className="flex items-center gap-1 text-sm text-neutral-400">
              {site.domain}
              <a
                href={`https://${site.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-400 hover:text-neutral-300"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLinkIcon className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>

        {site.is_verified ? (
          <div className="flex items-center gap-2 rounded-none bg-green-900/20 px-2 py-1 text-xs font-medium text-green-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Active
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-none bg-amber-900/20 px-2 py-1 text-xs font-medium text-amber-400">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            Unverified
          </div>
        )}
      </div>

      {/* Mini Stats Grid */}
      <div className="mb-6 grid grid-cols-2 gap-4 rounded-none bg-neutral-800/50 p-3">
        {/* * Zero renders as "—": a card full of hard 0s reads as "tracking is
         * broken" when it usually just means no traffic in the window. */}
        <div>
          <p className="text-xs text-neutral-500">Visitors (24h)</p>
          <p className="text-lg font-medium text-white">
            {statsLoading ? '--' : visitors24h === 0 ? '—' : formatNumber(visitors24h)}
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Pageviews</p>
          <p className="text-lg font-medium text-white">
            {statsLoading ? '--' : pageviews === 0 ? '—' : formatNumber(pageviews)}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-auto flex gap-2">
        <Link href={`/sites/${site.id}`} className="flex-1">
          <Button variant="default" className="w-full justify-center text-sm">
            <BarChartIcon className="w-4 h-4" />
            View Dashboard
          </Button>
        </Link>
        {canEditSite && (
          <Link
            href="/settings/site/general"
            className="flex items-center justify-center rounded-none border border-neutral-700 px-3 hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 ease-apple"
            title="Site Settings"
            onClick={(e) => {
              e.stopPropagation()
              sessionStorage.setItem('pulse_active_site', site.id)
            }}
          >
            <SettingsIcon className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  )
}

export default function SiteList({ sites, siteStats, loading }: SiteListProps) {

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-48 animate-skeleton-fade rounded-none bg-neutral-800" />
        ))}
      </div>
    )
  }

  if (sites.length === 0) {
    return (
      <div className="rounded-none border border-dashed border-neutral-700">
        <EmptyState
          icon={<PlusCircle />}
          title="No sites yet"
          description="Create your first site to start collecting analytics."
          action={{ label: 'Add your first site', href: '/sites/new' }}
        />
      </div>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {sites.map((site) => {
        const data = siteStats[site.id]
        return (
          <SiteCard
            key={site.id}
            site={site}
            stats={data?.stats ?? null}
            statsLoading={!data}
          />
        )
      })}

      {/* Resources Card */}
      <div className="flex flex-col items-center justify-center rounded-none border border-dashed border-neutral-700 bg-neutral-900 p-6 text-center">
        <div className="mb-3 rounded-none bg-neutral-800 p-3">
          <BookOpenIcon className="h-6 w-6 text-neutral-500" />
        </div>
        <h3 className="font-semibold text-white">Need help setup?</h3>
        <p className="mb-4 text-sm text-neutral-400">Check our documentation for installation guides.</p>
        <Link href="https://help.ciphera.net/docs/pulse" target="_blank" className="text-sm font-medium text-brand-orange hover:underline">
          Read Documentation &rarr;
        </Link>
      </div>
    </div>
  )
}
