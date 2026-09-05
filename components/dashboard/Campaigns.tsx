'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { ListSkeleton } from '@/components/skeletons'
import { type CampaignStat } from '@/lib/api/stats'
import { useCampaignsList } from '@/lib/swr/dashboard'
import { getReferrerFavicon, getReferrerIcon, getReferrerDisplayName } from '@/lib/utils/icons'
import { Megaphone } from '@phosphor-icons/react'
import { type DimensionFilter } from '@/lib/filters'
import { MetricRowStat, MetricUnitLabel, rowBarWidth } from '@/components/dashboard/MetricRowStat'
import { CardPager, useCardPage } from '@/components/dashboard/CardPager'
import { CascadeGroup, CascadeRow, RowBar } from '@/components/dashboard/Cascade'
import { DimensionInfoTip } from '@/components/dashboard/MetricInfoTip'

interface CampaignsProps {
  siteId: string
  dateRange: { start: string, end: string }
  // The API period token (1h/24h/…): sub-day rolling windows resolve on the
  // SERVER — the card's date bounds alone span two whole days when the
  // window crosses midnight.
  period?: string
  filters?: string
  // True range totals — the F9 denominator. Campaign rows count VISITORS, so
  // shares divide by totals.visitors; no totals → no percentages.
  totals?: { pageviews: number; visitors: number }
  onFilter?: (filter: DimensionFilter) => void
  // The public share surface's diet (02-09-2026): rows arrive ON the dashboard
  // payload — floored and capped by the backend's single public exit — instead
  // of the member-only /campaigns endpoint. When provided, BOTH fetches below
  // stay unarmed; the member-only full-list can never fire from a share view.
  // Named like the sibling cards' payload props (referrers, countries, ...).
  campaigns?: CampaignStat[]
}

type UtmTab = 'source' | 'medium' | 'campaign' | 'term' | 'content'

const LIMIT = 7

export default function Campaigns({ siteId, dateRange, period, filters, totals, onFilter, campaigns: payloadRows }: CampaignsProps) {
  const [faviconFailed, setFaviconFailed] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<UtmTab>('source')

  // 🔴 WAS a bare useEffect + useState fetch — the last card in the Acquisition
  // row still on the pre-Phase-3 pattern, missed by the migration that gave
  // every sibling "three honest states". It had no error state, no abort or
  // ordering guard, and its only failure handling was `logger.error`, which is
  // a NO-OP in a production browser build. So a failed request, or a stale
  // response landing after a fresh one, set `data` to [] and rendered the exact
  // same "No UTM data yet" empty state as a genuinely empty range — nothing in
  // the DOM or in state could tell the two apart.
  //
  // SWR keyed on (siteId, dates, limit, filters) fixes both halves: the newest
  // key's data wins, so a superseded in-flight response can no longer overwrite
  // a fresh one, and `error` is a real state the card can state out loud.
  const { data: cardData, error: cardError, isLoading, mutate: refetchCard } =
    useCampaignsList(siteId, dateRange.start, dateRange.end, 10, filters, payloadRows === undefined, period)
  const data = payloadRows ?? cardData ?? []

  // Grouping happens below, so overflow is judged on the grouped rows — the
  // full list (same endpoint the retired view-all modal used) arms only when
  // the card genuinely has an eighth grouped row to page to.

  const sortedData = useMemo(
    () => [...data].sort((a, b) => b.visitors - a.visitors),
    [data]
  )

  const groupedData = useMemo(() => {
    // Rates for a grouped row are visitors-weighted means of the non-null
    // components — a component with no rate contributes no weight rather than
    // dragging the mean toward zero.
    type Acc = { visitors: number; pageviews: number; bounceW: number; bounceBase: number; durW: number; durBase: number }
    const grouped = new Map<string, Acc>()
    for (const item of sortedData) {
      const raw = item[activeTab]
      if (!raw) continue
      let acc = grouped.get(raw)
      if (!acc) {
        acc = { visitors: 0, pageviews: 0, bounceW: 0, bounceBase: 0, durW: 0, durBase: 0 }
        grouped.set(raw, acc)
      }
      acc.visitors += item.visitors
      acc.pageviews += item.pageviews
      if (item.bounce_rate != null && item.visitors > 0) {
        acc.bounceW += item.bounce_rate * item.visitors
        acc.bounceBase += item.visitors
      }
      if (item.avg_duration != null && item.visitors > 0) {
        acc.durW += item.avg_duration * item.visitors
        acc.durBase += item.visitors
      }
    }
    return [...grouped.entries()]
      .map(([name, a]) => ({
        name,
        visitors: a.visitors,
        pageviews: a.pageviews,
        bounce_rate: a.bounceBase > 0 ? a.bounceW / a.bounceBase : null,
        avg_duration: a.durBase > 0 ? a.durW / a.durBase : null,
      }))
      .sort((a, b) => b.visitors - a.visitors)
  }, [sortedData, activeTab])

  const hasData = data.length > 0
  const wantsFullList = hasData && groupedData.length > LIMIT && payloadRows === undefined
  const { data: fullDataRaw } =
    useCampaignsList(siteId, dateRange.start, dateRange.end, 100, filters, wantsFullList, period)
  const sortedFullData = useMemo(
    () => [...((fullDataRaw && fullDataRaw.length > 0) ? fullDataRaw : data)].sort((a, b) => b.visitors - a.visitors),
    [fullDataRaw, data]
  )
  const groupedAll = useMemo(() => {
    type Acc = { visitors: number; pageviews: number; bounceW: number; bounceBase: number; durW: number; durBase: number }
    const grouped = new Map<string, Acc>()
    for (const item of sortedFullData) {
      const raw = item[activeTab]
      if (!raw) continue
      let acc = grouped.get(raw)
      if (!acc) {
        acc = { visitors: 0, pageviews: 0, bounceW: 0, bounceBase: 0, durW: 0, durBase: 0 }
        grouped.set(raw, acc)
      }
      acc.visitors += item.visitors
      acc.pageviews += item.pageviews
      if (item.bounce_rate != null && item.visitors > 0) {
        acc.bounceW += item.bounce_rate * item.visitors
        acc.bounceBase += item.visitors
      }
      if (item.avg_duration != null && item.visitors > 0) {
        acc.durW += item.avg_duration * item.visitors
        acc.durBase += item.visitors
      }
    }
    return [...grouped.entries()]
      .map(([name, a]) => ({
        name,
        visitors: a.visitors,
        pageviews: a.pageviews,
        bounce_rate: a.bounceBase > 0 ? a.bounceW / a.bounceBase : null,
        avg_duration: a.durBase > 0 ? a.durW / a.durBase : null,
      }))
      .sort((a, b) => b.visitors - a.visitors)
  }, [sortedFullData, activeTab])

  const allData = groupedAll.length >= groupedData.length ? groupedAll : groupedData
  const pageCount = Math.max(1, Math.ceil(allData.length / LIMIT))
  // Page state keys on the context: a tab/filter/range change reads as page 1,
  // and a shrinking list clamps at read time.
  const [page, setPage] = useCardPage(`${activeTab}|${filters ?? ''}|${dateRange?.start}|${dateRange?.end}`, pageCount)

  const displayedData = hasData ? allData.slice((page - 1) * LIMIT, page * LIMIT) : []
  const emptySlots = Math.max(0, LIMIT - displayedData.length)

  function renderSourceIcon(source: string) {
    const faviconUrl = getReferrerFavicon(source)
    const useFavicon = faviconUrl && !faviconFailed.has(source)
    if (useFavicon) {
      return (
        <Image
          src={faviconUrl}
          alt=""
          width={20}
          height={20}
          className="w-5 h-5 flex-shrink-0 rounded-none object-contain"
          onError={() => setFaviconFailed((prev) => new Set(prev).add(source))}
          unoptimized
        />
      )
    }
    return <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center">{getReferrerIcon(source)}</span>
  }

  return (
    <div data-tour="dimension-card" data-tour-card="campaigns" className="bg-card rounded-none p-6 h-full flex flex-col border border-border min-w-0">
      <div className="flex items-center justify-between gap-2 mb-4">
        {/* Matches the scrolling tab row every other dimension card uses, so a
            narrow card can never push the unit label off its right edge. */}
        <div className="flex gap-1 min-w-0 overflow-x-auto scrollbar-hide pb-1 max-md:[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)]" role="tablist" aria-label="Campaign dimension tabs">
          {(['source', 'medium', 'campaign', 'term', 'content'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              role="tab"
              aria-selected={activeTab === tab}
              className={`relative px-2.5 py-3 sm:py-1 text-xs font-medium transition-colors capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange rounded-none cursor-pointer ${
                activeTab === tab
                  ? 'text-white'
                  : 'text-neutral-500 hover:text-neutral-300'
              } ease-apple`}
            >
              {tab}
              <span
                className={`absolute inset-x-0 -bottom-px h-[3px] rounded-none transition-[width,background-color] duration-base ${
                  activeTab === tab ? 'bg-brand-orange scale-x-100' : 'bg-transparent scale-x-0'
                } ease-apple`}
              />
            </button>
          ))}
        </div>
        <DimensionInfoTip tab={activeTab} className="ms-2 me-auto" />
        <div className="flex min-w-0 shrink items-center gap-1.5">
          <MetricUnitLabel />
        </div>
      </div>

      <div className="flex-1 min-h-[270px]">
        {isLoading ? (
          <ListSkeleton rows={LIMIT} />
        ) : cardError && !cardData ? (
          // The anti-fake-empty. Before this branch existed a failed request
          // rendered "No UTM data yet" — telling a customer they have no
          // campaign traffic when in fact we simply could not find out.
          // `!cardData` so a background revalidation failure keeps the last
          // good rows on screen instead of blanking a working card.
          <ErrorCard
            title="Couldn’t load campaigns"
            description="The rest of the dashboard is unaffected."
            onRetry={() => refetchCard()}
          />
        ) : hasData ? (
          <CascadeGroup flipKey={`${activeTab}-${page}`} className="space-y-2">
            {displayedData.map((item, i) => {
              const barWidth = rowBarWidth(item, allData)
              const filterDimension = `utm_${activeTab}`
              const Row = onFilter ? 'button' : 'div'
              return (
                <CascadeRow key={item.name} index={i}>
                <Row
                  {...(onFilter ? { type: 'button' as const, onClick: () => onFilter?.({ dimension: filterDimension, operator: 'is', values: [item.name] }) } : {})}
                  className={`interactive-row w-full text-left relative overflow-hidden flex items-center justify-between h-9 group rounded-none px-2 -mx-2${onFilter ? ' cursor-pointer' : ''}`}
                >
                  <RowBar width={barWidth} index={i} />
                  <div className="relative flex-1 text-white flex items-center gap-3 min-w-0">
                    {activeTab === 'source' && renderSourceIcon(item.name)}
                    <div className="min-w-0">
                      <div className="truncate font-medium text-sm" title={item.name}>
                        {activeTab === 'source' ? getReferrerDisplayName(item.name) : item.name}
                      </div>
                    </div>
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
            icon={<Megaphone />}
            title="No UTM data yet"
            description="Tag your links with UTM parameters to track which campaigns drive the most traffic."
          />
        )}
      </div>

      <CardPager page={page} pageCount={pageCount} onPageChange={setPage} label="campaigns" />
    </div>
  )
}
