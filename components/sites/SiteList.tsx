'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Site } from '@/lib/api/sites'
import type { Stats } from '@/lib/api/stats'
import { formatNumber } from '@ciphera-net/ui'
import { BarChartIcon, SettingsIcon, BookOpenIcon, ExternalLinkIcon, Button } from '@ciphera-net/ui'
import { useAuth } from '@/lib/auth/context'

export type SiteStatsMap = Record<string, { stats: Stats }>

interface SiteListProps {
  sites: Site[]
  siteStats: SiteStatsMap
  loading: boolean
  onDelete: (id: string) => void
}

interface SiteCardProps {
  site: Site
  stats: Stats | null
  statsLoading: boolean
  onDelete: (id: string) => void
  canDelete: boolean
}

function SiteCard({ site, stats, statsLoading, onDelete, canDelete }: SiteCardProps) {
  const visitors24h = stats?.visitors ?? 0
  const pageviews = stats?.pageviews ?? 0

  return (
    <div className="group relative flex flex-col rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition-all hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900">
      {/* Header: Icon + Name + Live Status */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 overflow-hidden rounded-lg border border-neutral-100 bg-neutral-50 p-1 dark:border-neutral-800 dark:bg-neutral-800">
            <Image
              src={`https://www.google.com/s2/favicons?domain=${site.domain}&sz=64`}
              alt={site.name}
              width={40}
              height={40}
              className="h-full w-full object-contain"
              unoptimized
            />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900 dark:text-white">{site.name}</h3>
            <div className="flex items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400">
              {site.domain}
              <a
                href={`https://${site.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLinkIcon className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          Active
        </div>
      </div>

      {/* Mini Stats Grid */}
      <div className="mb-6 grid grid-cols-2 gap-4 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800/50">
        <div>
          <p className="text-xs text-neutral-500">Visitors (24h)</p>
          <p className="font-mono text-lg font-medium text-neutral-900 dark:text-white">
            {statsLoading ? '--' : formatNumber(visitors24h)}
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Pageviews</p>
          <p className="font-mono text-lg font-medium text-neutral-900 dark:text-white">
            {statsLoading ? '--' : formatNumber(pageviews)}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-auto flex gap-2">
        <Link href={`/sites/${site.id}`} className="flex-1">
          <Button variant="primary" className="w-full justify-center text-sm">
            <BarChartIcon className="w-4 h-4" />
            View Dashboard
          </Button>
        </Link>
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(site.id)}
            className="flex items-center justify-center rounded-lg border border-neutral-200 px-3 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800 text-neutral-500 hover:text-red-600 dark:hover:text-red-400 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            title="Delete Site"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

export default function SiteList({ sites, siteStats, loading, onDelete }: SiteListProps) {
  const { user } = useAuth()
  const canDelete = user?.role === 'owner' || user?.role === 'admin'

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-48 animate-pulse rounded-2xl bg-neutral-100 dark:bg-neutral-800" />
        ))}
      </div>
    )
  }

  if (sites.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-12 text-center">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">No sites yet</h3>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400 mb-4">Create your first site to get started.</p>
        <Link href="/sites/new">
          <Button variant="primary" className="text-sm">
            Add your first site
          </Button>
        </Link>
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
            onDelete={onDelete}
            canDelete={canDelete}
          />
        )
      })}

      {/* Resources Card */}
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center dark:border-neutral-700 dark:bg-neutral-900/50">
        <div className="mb-3 rounded-full bg-neutral-200 p-3 dark:bg-neutral-800">
          <BookOpenIcon className="h-6 w-6 text-neutral-500" />
        </div>
        <h3 className="font-semibold text-neutral-900 dark:text-white">Need help setup?</h3>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">Check our documentation for installation guides.</p>
        <Link href="https://docs.ciphera.net" target="_blank" className="text-sm font-medium text-brand-orange hover:underline">
          Read Documentation &rarr;
        </Link>
      </div>
    </div>
  )
}
