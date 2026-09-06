'use client'

import { useMemo, useState } from 'react'
import { getBrowserIcon, getOSIcon, getDeviceIcon } from '@/lib/utils/icons'
import { Monitor } from '@phosphor-icons/react'
import { DeviceMobile } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useFullDimensionList, type FullListKind } from '@/lib/swr/dashboard'
import { type DimensionFilter } from '@/lib/filters'
import { MetricRowStat, MetricUnitLabel, rowBarWidth } from '@/components/dashboard/MetricRowStat'
import { DimensionInfoTip } from '@/components/dashboard/MetricInfoTip'
import { CardPager, useCardPage } from '@/components/dashboard/CardPager'
import { CascadeGroup, CascadeRow, RowBar } from '@/components/dashboard/Cascade'
import { Switcher } from '@ciphera-net/facet'

interface TechSpecsProps {
  browsers: Array<{ browser: string; pageviews: number; visitors?: number; bounce_rate?: number | null; avg_duration?: number | null }>
  os: Array<{ os: string; pageviews: number; visitors?: number; bounce_rate?: number | null; avg_duration?: number | null }>
  devices: Array<{ device: string; pageviews: number; visitors?: number; bounce_rate?: number | null; avg_duration?: number | null }>
  screenResolutions: Array<{ screen_resolution: string; pageviews: number; visitors?: number; bounce_rate?: number | null; avg_duration?: number | null }>
  collectDeviceInfo?: boolean
  collectScreenResolution?: boolean
  siteId: string
  dateRange: { start: string, end: string }
  // True range totals — the F9 denominator; no totals → no percentages.
  totals?: { pageviews: number; visitors: number }
  // Active page filters, threaded into the full-list fetch (F14).
  filters?: string
  // The anonymous share surface has no full-list endpoints; it paginates only
  // what its own payload carries.
  memberFeatures?: boolean
  onFilter?: (filter: DimensionFilter) => void
}

type Tab = 'browsers' | 'os' | 'devices' | 'screens'

const TAB_TO_KIND: Record<Tab, FullListKind> = {
  browsers: 'browsers',
  os: 'os',
  devices: 'devices',
  screens: 'screen-resolutions',
}

// The full-list endpoints return rows keyed by their own dimension name; the
// card renders a unified { name, pageviews } shape.
type RawTechRow = { browser?: string; os?: string; device?: string; screen_resolution?: string; pageviews: number; visitors?: number; bounce_rate?: number | null; avg_duration?: number | null }
const RAW_NAME_KEY: Record<Tab, keyof RawTechRow> = {
  browsers: 'browser',
  os: 'os',
  devices: 'device',
  screens: 'screen_resolution',
}

function capitalize(s: string): string {
  if (!s) return s
  // Preserve intentional casing (e.g. macOS, iOS, webOS, ChromeOS, FreeBSD)
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const LIMIT = 7

const TAB_TO_DIMENSION: Record<string, string> = { browsers: 'browser', os: 'os', devices: 'device', screens: 'screen_resolution' }

export default function TechSpecs({ browsers, os, devices, screenResolutions, collectDeviceInfo = true, collectScreenResolution = true, siteId, dateRange, totals, filters, memberFeatures = true, onFilter }: TechSpecsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('browsers')
  type TechItem = { name: string; pageviews: number; visitors?: number; bounce_rate?: number | null; avg_duration?: number | null; icon: React.ReactNode }


  // Filter out "Unknown" entries that result from disabled collection
  const filterUnknown = (items: Array<{ name: string; pageviews: number; icon: React.ReactNode }>) => {
    return items.filter(item => item.name && item.name !== 'Unknown' && item.name !== '')
  }

  const getRawData = () => {
    switch (activeTab) {
      case 'browsers':
        return browsers.map(b => ({ name: b.browser, pageviews: b.pageviews, visitors: b.visitors, bounce_rate: b.bounce_rate, avg_duration: b.avg_duration, icon: getBrowserIcon(b.browser) }))
      case 'os':
        return os.map(o => ({ name: o.os, pageviews: o.pageviews, visitors: o.visitors, bounce_rate: o.bounce_rate, avg_duration: o.avg_duration, icon: getOSIcon(o.os) }))
      case 'devices':
        return devices.map(d => ({ name: d.device, pageviews: d.pageviews, visitors: d.visitors, bounce_rate: d.bounce_rate, avg_duration: d.avg_duration, icon: getDeviceIcon(d.device) }))
      case 'screens':
        return screenResolutions.map(s => ({ name: s.screen_resolution, pageviews: s.pageviews, visitors: s.visitors, bounce_rate: s.bounce_rate, avg_duration: s.avg_duration, icon: <Monitor className="text-neutral-500" /> }))
      default:
        return []
    }
  }

  // Check if current tab is disabled by privacy settings
  const isTabDisabled = () => {
    if (!collectDeviceInfo && (activeTab === 'browsers' || activeTab === 'os' || activeTab === 'devices')) {
      return true
    }
    if (!collectScreenResolution && activeTab === 'screens') {
      return true
    }
    return false
  }

  const getDisabledMessage = () => {
    if (!collectDeviceInfo && (activeTab === 'browsers' || activeTab === 'os' || activeTab === 'devices')) {
      return 'Device info collection is disabled in site settings'
    }
    if (!collectScreenResolution && activeTab === 'screens') {
      return 'Screen resolution collection is disabled in site settings'
    }
    return 'No data available'
  }

  const rawData = getRawData()
  const data = filterUnknown(rawData)
  const hasData = data && data.length > 0

  // The dashboard fan-out carries only the top 10 per dimension — when the
  // active tab overflows the card, fetch the full list once (same endpoint the
  // retired view-all modal used) and paginate it client-side.
  const wantsFullList = memberFeatures && !isTabDisabled() && data.length > LIMIT
  const { data: fullRaw } = useFullDimensionList<RawTechRow>(
    wantsFullList ? TAB_TO_KIND[activeTab] : null,
    siteId, dateRange?.start, dateRange?.end, 100, filters,
  )

  const fullData: TechItem[] = useMemo(() => {
    const nameKey = RAW_NAME_KEY[activeTab]
    const iconFor = (name: string) =>
      activeTab === 'browsers' ? getBrowserIcon(name)
        : activeTab === 'os' ? getOSIcon(name)
          : activeTab === 'devices' ? getDeviceIcon(name)
            : <Monitor className="text-neutral-500" />
    return filterUnknown((fullRaw ?? []).map(row => {
      const name = (row[nameKey] as string) ?? ''
      return { name, pageviews: row.pageviews, visitors: row.visitors, bounce_rate: row.bounce_rate, avg_duration: row.avg_duration, icon: iconFor(name) }
    }))
  }, [fullRaw, activeTab])

  // Gate on wantsFullList: stale hook-state from another range must never
  // outrank the fan-out rows (the frozen-blocks bug, 01-09-2026).
  const allData = wantsFullList && fullRaw && fullData.length >= data.length ? fullData : data
  const pageCount = Math.max(1, Math.ceil(allData.length / LIMIT))
  // Page state keys on the context: a tab/filter/range change reads as page 1,
  // and a shrinking list clamps at read time.
  const [page, setPage] = useCardPage(`${activeTab}|${filters ?? ''}|${dateRange?.start}|${dateRange?.end}`, pageCount)

  const displayedData = hasData ? allData.slice((page - 1) * LIMIT, page * LIMIT) : []
  const emptySlots = Math.max(0, LIMIT - displayedData.length)

  return (
    <div data-tour="dimension-card" data-tour-card="tech" className="bg-card rounded-none p-6 h-full flex flex-col border border-border min-w-0">
      <div className="flex items-center justify-between mb-4">
        {/* One Facet Switcher for every dimension card (owner pick C0, 06-09-2026);
            the overflow wrapper keeps a narrow card scrollable, as the tab row was. */}
        <div className="min-w-0 overflow-x-auto scrollbar-hide pb-1">
          <Switcher
            size="sm"
            tone="solid"
            aria-label="Technology view"
            options={[
              { value: 'browsers', label: 'Browsers' },
              { value: 'os', label: 'OS' },
              { value: 'devices', label: 'Devices' },
              { value: 'screens', label: 'Screens' },
            ]}
            value={activeTab}
            onChange={(v) => setActiveTab(v as Tab)}
          />
        </div>
        <DimensionInfoTip tab={activeTab} className="ms-2 me-auto" />
        <div className="flex min-w-0 shrink items-center gap-1.5">
          <MetricUnitLabel />
        </div>
      </div>

      <div className="flex-1 min-h-[270px]">
        {isTabDisabled() ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <p className="text-neutral-400 text-sm">{getDisabledMessage()}</p>
          </div>
        ) : hasData ? (
          <CascadeGroup flipKey={`${activeTab}-${page}`} className="space-y-2">
            {displayedData.map((item, i) => {
              const dim = TAB_TO_DIMENSION[activeTab]
              const canFilter = onFilter && dim
              const barWidth = rowBarWidth(item, allData)
              const Row = canFilter ? 'button' : 'div'
              return (
                <CascadeRow key={item.name} index={i}>
                  <Row
                    {...(canFilter ? { type: 'button' as const, onClick: () => canFilter && onFilter({ dimension: dim, operator: 'is', values: [item.name] }) } : {})}
                    className={`interactive-row w-full text-left relative overflow-hidden flex items-center justify-between h-9 group rounded-none px-2 -mx-2${canFilter ? ' cursor-pointer' : ''}`}
                  >
                    <RowBar width={barWidth} index={i} />
                    <div className="relative flex-1 truncate text-white flex items-center gap-3">
                      {item.icon && <span className="text-lg">{item.icon}</span>}
                      <span className="truncate">{capitalize(item.name)}</span>
                    </div>
                    <MetricRowStat row={item} totals={totals} />
                  </Row>
                </CascadeRow>
              )
            })}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
            ))}
          </CascadeGroup>
        ) : (
          <EmptyState
            icon={<DeviceMobile />}
            title="No devices detected yet"
            description="Browser, OS, and screen data appears automatically as visitors arrive. No extra setup needed."
            action={{ label: 'Install tracking script', href: '/installation' }}
          />
        )}
      </div>

      <CardPager page={page} pageCount={pageCount} onPageChange={setPage} label={activeTab} />
    </div>
  )
}
