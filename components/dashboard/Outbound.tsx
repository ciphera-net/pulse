'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { ArrowSquareOut, FileText, Globe } from '@phosphor-icons/react'
import { Switcher } from '@ciphera-net/facet'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { CardPager, useCardPage } from '@/components/dashboard/CardPager'
import { CascadeGroup, CascadeRow, RowBar } from '@/components/dashboard/Cascade'
import { DimensionInfoTip } from '@/components/dashboard/MetricInfoTip'
import { useOutboundLinks } from '@/lib/swr/dashboard'
import { FAVICON_SERVICE_URL } from '@/lib/utils/favicon'
import { formatNumber } from '@/lib/utils/format'
import { type DimensionFilter } from '@/lib/filters'
import { type GoalCountStat } from '@/lib/api/stats'

// ---------------------------------------------------------------------------
// Outbound — where visitors go when they leave (owner pick A, 08-09-2026;
// artifact "Outbound" caa623a4). The tracker has recorded every click on a
// link to another hostname as an `outbound_link` event with `url` and
// `page_path` since the script shipped; this card is the first surface for it.
//
// Three views on one card: Domains (clicks grouped by host), Links (one row
// per link, path dimmed after the host), From page (the page the click
// happened on). The number is CLICKS, and the card says so — the property
// endpoints count events, and a visitor who clicked twice counts twice. The
// footnote carries the one people-number the goal counts do know (how many
// visitors clicked out at all) as a share of the range's visitors.
//
// 🔴 "Outbound" means any OTHER hostname, so a site's own product apps
// (pulse.ciphera.net from ciphera.net) show as destinations. Grouping
// same-organisation hosts is a build option the owner has not picked; rows
// stay plain until then.
//
// The property endpoints take no filters, so under page filters this card
// is whole-site — and says so in the footnote instead of pretending
// (no silent failures). A filtered aggregate is the backend follow-up.
// ---------------------------------------------------------------------------

interface OutboundProps {
  siteId: string
  dateRange: { start: string; end: string }
  period?: string
  /** True range totals — the denominator for "N% of visitors left through a link". */
  totals?: { pageviews: number; visitors: number }
  /** The dashboard fan-out's goal counts; the outbound_link row carries the visitor count. */
  goalCounts?: GoalCountStat[]
  /** Active page filters — the endpoints ignore them, so the card labels itself whole-site. */
  filters?: string
  onFilter?: (filter: DimensionFilter) => void
}

type Tab = 'domains' | 'links' | 'from_page'

const LIMIT = 7
/** Longest bar = 75% of the row, the house cap. */
const BAR_CAP = 75

interface Row {
  key: string
  label: string
  /** Dimmed suffix after the label (a link's path). */
  sub?: string
  host?: string
  href?: string
  path?: string
  clicks: number
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

/** A destination's favicon through the app's own proxy, falling back to the house globe. */
function DestinationIcon({ host, failed, onFail }: { host: string; failed: boolean; onFail: () => void }) {
  if (failed) return <Globe className="text-neutral-500" />
  return (
    <Image
      src={`${FAVICON_SERVICE_URL}?domain=${encodeURIComponent(host)}&sz=32`}
      alt=""
      width={20}
      height={20}
      className="h-5 w-5 shrink-0 rounded-none object-contain"
      onError={onFail}
      unoptimized
    />
  )
}

export default function Outbound({ siteId, dateRange, period, totals, goalCounts, filters, onFilter }: OutboundProps) {
  const [activeTab, setActiveTab] = useState<Tab>('domains')
  const [faviconFailed, setFaviconFailed] = useState<Set<string>>(() => new Set())
  const { data, error, isLoading } = useOutboundLinks(siteId, dateRange.start, dateRange.end, period)

  const rows = useMemo<Record<Tab, Row[]>>(() => {
    const urls = data?.urls ?? []
    const byHost = new Map<string, number>()
    const links: Row[] = []
    for (const v of urls) {
      const host = hostOf(v.value)
      if (!host) continue
      byHost.set(host, (byHost.get(host) ?? 0) + v.count)
      let sub = ''
      try {
        const u = new URL(v.value)
        sub = u.pathname === '/' && !u.search ? '' : u.pathname + u.search
      } catch { /* no path */ }
      links.push({ key: v.value, label: host, sub, host, href: v.value, clicks: v.count })
    }
    const domains: Row[] = [...byHost.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([host, clicks]) => ({ key: host, label: host, host, clicks }))
    const from_page: Row[] = (data?.paths ?? []).map((v) => ({ key: v.value, label: v.value, path: v.value, clicks: v.count }))
    return { domains, links, from_page }
  }, [data])

  // The share denominator is EVERY outbound click in the range, not the
  // visible page — the same rule the dimension cards apply to visitors (F9).
  // The fan-out's goal count IS that total (one row per event name, no row
  // cap); the summed lists are the fallback, and they are capped at 1,000
  // distinct values, so on a site with more destinations than that the
  // fallback would under-count and inflate every share.
  const outboundGoal = goalCounts?.find((g) => g.event_name === 'outbound_link')
  const summedClicks = useMemo(() => (data?.urls ?? []).reduce((n, v) => n + v.count, 0), [data])
  const totalClicks = outboundGoal?.count ?? summedClicks
  const list = rows[activeTab]
  const pageCount = Math.max(1, Math.ceil(list.length / LIMIT))
  const [page, setPage] = useCardPage(`${activeTab}|${filters ?? ''}|${dateRange.start}|${dateRange.end}`, pageCount)
  const displayed = list.slice((page - 1) * LIMIT, page * LIMIT)
  const emptySlots = Math.max(0, LIMIT - displayed.length)
  const maxClicks = list.reduce((m, r) => Math.max(m, r.clicks), 0)

  const outboundVisitors = outboundGoal?.visitors
  const hasFilters = Boolean(filters)
  const hasData = list.length > 0

  const footnote = (() => {
    if (hasFilters) return 'Outbound is not filtered yet — these are whole-site clicks.'
    if (outboundVisitors != null && totals && totals.visitors > 0) {
      const share = Math.round((outboundVisitors / totals.visitors) * 100)
      return `${share}% of visitors left through a link · clicks, not people — a visitor who clicked twice counts twice`
    }
    return 'Clicks, not people — a visitor who clicked twice counts twice'
  })()

  return (
    <div data-tour="dimension-card" data-tour-card="outbound" className="bg-card rounded-none p-6 h-full flex flex-col border border-border min-w-0">
      <div className="flex items-center justify-between mb-4">
        <div className="min-w-0 overflow-x-auto scrollbar-hide pb-1">
          <Switcher
            size="sm"
            tone="solid"
            aria-label="Outbound view"
            options={[
              { value: 'domains', label: 'Domains' },
              { value: 'links', label: 'Links' },
              { value: 'from_page', label: 'From page' },
            ]}
            value={activeTab}
            onChange={(v) => setActiveTab(v as Tab)}
          />
        </div>
        <DimensionInfoTip tab={activeTab} className="ms-2 me-auto" />
        <div className="flex min-w-0 shrink items-center gap-1.5">
          <span className="shrink-0 text-[11px] text-neutral-500" data-testid="metric-unit">
            clicks
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-[270px]">
        {error && !data ? (
          <ErrorCard title="Couldn’t load outbound links" description="The outbound clicks did not arrive. Reload the page to try again." />
        ) : hasData ? (
          <>
            <CascadeGroup flipKey={`${activeTab}-${page}`} className="space-y-2">
              {displayed.map((row, i) => {
                const width = maxClicks > 0 ? (row.clicks / maxClicks) * BAR_CAP : 0
                const share = totalClicks > 0 ? `${Math.round((row.clicks / totalClicks) * 100)}%` : ''
                const filterable = activeTab === 'from_page' && onFilter && row.path
                const className = `interactive-row w-full text-left relative overflow-hidden flex items-center justify-between h-9 group rounded-none px-2 -mx-2${row.href || filterable ? ' cursor-pointer' : ''}`
                const body = (
                  <>
                    <RowBar width={width} index={i} />
                    <div className="relative flex-1 truncate text-white flex items-center gap-3">
                      <span className="text-lg">
                        {row.host ? (
                          <DestinationIcon
                            host={row.host}
                            failed={faviconFailed.has(row.host)}
                            onFail={() => setFaviconFailed((prev) => new Set(prev).add(row.host as string))}
                          />
                        ) : (
                          <FileText className="text-neutral-500" />
                        )}
                      </span>
                      <span className="truncate" title={row.href ?? row.label}>
                        {row.label}
                        {row.sub && <span className="text-neutral-500">{row.sub}</span>}
                      </span>
                    </div>
                    <div className="relative flex items-center gap-2 ml-4">
                      {share && (
                        <span className="text-xs font-medium text-brand-orange opacity-100 translate-x-0 md:opacity-0 md:translate-x-2 md:group-hover:opacity-100 md:group-hover:translate-x-0 transition-[opacity,transform] duration-base ease-apple">
                          {share}
                        </span>
                      )}
                      <span className="text-sm font-semibold text-neutral-400">{formatNumber(row.clicks)}</span>
                    </div>
                  </>
                )
                return (
                  <CascadeRow key={row.key} index={i}>
                    {row.href ? (
                      // A link row opens the destination — there is no outbound
                      // dimension to filter by, and the click is the row's own subject.
                      <a href={row.href} target="_blank" rel="noopener noreferrer" className={className}>
                        {body}
                      </a>
                    ) : filterable ? (
                      <button type="button" onClick={() => onFilter({ dimension: 'page', operator: 'is', values: [row.path as string] })} className={className}>
                        {body}
                      </button>
                    ) : (
                      <div className={className}>{body}</div>
                    )}
                  </CascadeRow>
                )
              })}
              {Array.from({ length: emptySlots }).map((_, i) => (
                <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
              ))}
            </CascadeGroup>
            <p className="mt-3 text-[11px] text-neutral-500" data-testid="outbound-footnote">{footnote}</p>
          </>
        ) : isLoading && !data ? (
          // Height-stable while the first fetch is in flight — the card must not
          // claim "no clicks" for the 200 ms the endpoint takes.
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: LIMIT }).map((_, i) => (
              <div key={`loading-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<ArrowSquareOut />}
            title="No outbound clicks yet"
            description="Clicks on links to other sites are recorded automatically and appear here. If outbound tracking is off in the script settings, nothing arrives."
            action={{ label: 'Install tracking script', href: '/installation' }}
          />
        )}
      </div>

      <CardPager page={page} pageCount={pageCount} onPageChange={setPage} label={activeTab === 'from_page' ? 'pages' : activeTab} />
    </div>
  )
}
