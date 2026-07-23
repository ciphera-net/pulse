'use client'

import { GlobeHemisphereWest, Monitor, Target } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/utils/format'
import { countryName } from '@/lib/utils/countryCodes'
import { useGSCTopCountries, useGSCTopDevices, useGSCOpportunities } from '@/lib/swr/dashboard'
import { EmptyState } from '@/components/ui/EmptyState'
import { PositionBadge } from './PositionBadge'
import {
  RowBar,
  StandardMetrics,
  StandardHeader,
  CountryFlag,
  deviceIcon,
  Pagination,
  ViewBody,
  formatCompact,
} from './rowPrimitives'

// ---------------------------------------------------------------------------
// The three non-expandable views — Countries (paginated), Devices (no
// pagination) and Opportunities (limit 50, no offset). Same row grammar as the
// query/page views: a proportional bar behind the label, tabular metrics, the
// neutral/orange PositionBadge. Opportunities carries its own columns and shows
// upside in orange (never emerald — upside is data, not a good/bad delta).
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50

interface RangeProps {
  siteId: string
  dateRange: { start: string; end: string }
}
interface PagedProps extends RangeProps {
  page: number
  setPage: (p: number) => void
}

// A non-interactive row (bar + hover highlight, consistent with the grammar).
function StaticRow({ children, share }: { children: React.ReactNode; share: number }) {
  return (
    <div className="relative flex h-9 items-center px-3 transition-colors duration-fast ease-apple hover:bg-neutral-800/60">
      <RowBar share={share} />
      {children}
    </div>
  )
}

export function CountriesView({ siteId, dateRange, page, setPage }: PagedProps) {
  const { data, error, isLoading, mutate } = useGSCTopCountries(siteId, dateRange.start, dateRange.end, PAGE_SIZE, page * PAGE_SIZE)
  const rows = data?.countries ?? []
  const maxClicks = Math.max(...rows.map((r) => r.clicks), 0)
  return (
    <>
      <StandardHeader label="Country" />
      <ViewBody
        isLoading={isLoading}
        hasData={!!data}
        error={error}
        isEmpty={rows.length === 0}
        emptyNode={<EmptyState icon={<GlobeHemisphereWest />} title="No country data in this period" description="Country breakdowns appear once Search Console reports impressions by region." className="py-10" />}
        footer={<Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPage={setPage} />}
        onRetry={() => { void mutate() }}
      >
        {rows.map((row) => {
          const name = countryName(row.country)
          return (
            <StaticRow key={row.country} share={maxClicks > 0 ? row.clicks / maxClicks : 0}>
              <span className="relative flex min-w-0 flex-1 items-center gap-2 text-sm text-white" title={name}>
                <CountryFlag alpha3={row.country} />
                <span className="truncate">{name}</span>
              </span>
              <StandardMetrics clicks={row.clicks} impressions={row.impressions} ctr={row.ctr} position={row.position} />
            </StaticRow>
          )
        })}
      </ViewBody>
    </>
  )
}

export function DevicesView({ siteId, dateRange }: RangeProps) {
  const { data, error, isLoading, mutate } = useGSCTopDevices(siteId, dateRange.start, dateRange.end)
  const rows = data?.devices ?? []
  const maxClicks = Math.max(...rows.map((r) => r.clicks), 0)
  return (
    <>
      <StandardHeader label="Device" />
      <ViewBody
        isLoading={isLoading}
        hasData={!!data}
        error={error}
        isEmpty={rows.length === 0}
        emptyNode={<EmptyState icon={<Monitor />} title="No device data in this period" description="Device breakdowns appear once Search Console reports impressions by device." className="py-10" />}
        onRetry={() => { void mutate() }}
      >
        {rows.map((row) => {
          const Icon = deviceIcon(row.device)
          const label = row.device.charAt(0).toUpperCase() + row.device.slice(1).toLowerCase()
          return (
            <StaticRow key={row.device} share={maxClicks > 0 ? row.clicks / maxClicks : 0}>
              <span className="relative flex min-w-0 flex-1 items-center gap-2 text-sm text-white">
                <Icon className="h-4 w-4 shrink-0 text-neutral-400" />
                <span className="truncate">{label}</span>
              </span>
              <StandardMetrics clicks={row.clicks} impressions={row.impressions} ctr={row.ctr} position={row.position} />
            </StaticRow>
          )
        })}
      </ViewBody>
    </>
  )
}

const OPP = { position: 'w-14', impressions: 'sm:w-24', clicks: 'w-16', potential: 'w-16' } as const

export function OpportunitiesView({ siteId, dateRange }: RangeProps) {
  const { data, error, isLoading, mutate } = useGSCOpportunities(siteId, dateRange.start, dateRange.end, PAGE_SIZE)
  const rows = data?.opportunities ?? []
  const maxImpr = Math.max(...rows.map((r) => r.impressions), 0)
  return (
    <>
      <p className="border-b border-border px-3 py-2.5 text-xs text-neutral-500">
        Queries ranking just off the first page where better content or titles can win clicks.
      </p>
      <div className="flex h-8 items-center border-b border-border px-3 text-xs text-neutral-500">
        <span className="min-w-0 flex-1">Query</span>
        <div className="ml-3 flex shrink-0 items-center gap-3">
          <span className={cn(OPP.position, 'text-right')}>Position</span>
          <span className={cn('hidden sm:inline-block', OPP.impressions, 'text-right')}>Impressions</span>
          <span className={cn(OPP.clicks, 'text-right')}>Clicks</span>
          <span className={cn(OPP.potential, 'text-right')}>Potential</span>
        </div>
      </div>
      <ViewBody
        isLoading={isLoading}
        hasData={!!data}
        error={error}
        isEmpty={rows.length === 0}
        emptyNode={<EmptyState icon={<Target />} title="No striking-distance queries in this period" description="Opportunities appear when queries rank just off the first page with clicks to win." className="py-10" />}
        onRetry={() => { void mutate() }}
      >
        {rows.map((row) => (
          <StaticRow key={row.query} share={maxImpr > 0 ? row.impressions / maxImpr : 0}>
            <span className="relative min-w-0 flex-1 truncate text-sm text-white" title={row.query}>{row.query}</span>
            <div className="relative ml-3 flex shrink-0 items-center gap-3 text-sm tabular-nums">
              <span className={cn(OPP.position, 'flex justify-end')}><PositionBadge position={row.position} /></span>
              <span className={cn('hidden sm:inline-block', OPP.impressions, 'text-right text-neutral-400')}>{formatNumber(row.impressions)}</span>
              <span className={cn(OPP.clicks, 'text-right text-neutral-300')}>{formatNumber(row.clicks)}</span>
              <span className={cn(OPP.potential, 'text-right font-medium text-brand-orange')}>&rarr; {formatCompact(row.potential_clicks)}</span>
            </div>
          </StaticRow>
        ))}
      </ViewBody>
    </>
  )
}
