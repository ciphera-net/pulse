'use client'

import { useState } from 'react'
import { getReferrerDisplayName, getReferrerFavicon, getReferrerIcon, mergeReferrersByDisplayName } from '@/lib/utils/icons'
import {
  ArrowSquareOut,
  Link as LinkIcon,
  MagnifyingGlass,
  UsersThree,
  CurrencyCircleDollar,
  Megaphone,
  Robot,
  Envelope,
  PlayCircle,
  Monitor,
  Handshake,
  ChatCircle,
  Question,
} from '@phosphor-icons/react'
import { Globe } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { TopReferrer } from '@/lib/api/stats'
import { useFullDimensionList } from '@/lib/swr/dashboard'
import { type DimensionFilter } from '@/lib/filters'
import { MetricRowStat, MetricUnitLabel, rowBarWidth } from '@/components/dashboard/MetricRowStat'
import { DimensionInfoTip } from '@/components/dashboard/MetricInfoTip'
import { CardPager, useCardPage } from '@/components/dashboard/CardPager'
import { CascadeGroup, CascadeRow, RowBar } from '@/components/dashboard/Cascade'
import { Switcher } from '@ciphera-net/facet'

interface TopReferrersProps {
  referrers: Array<{ referrer: string; pageviews: number; visitors?: number; bounce_rate?: number | null; avg_duration?: number | null }>
  channels?: Array<{ channel: string; pageviews: number; visitors?: number; bounce_rate?: number | null; avg_duration?: number | null }>
  collectReferrers?: boolean
  siteId: string
  dateRange: { start: string, end: string }
  // True range totals — the F9 denominator. Both tabs count pageviews, so
  // both divide by totals.pageviews; no totals → no percentages.
  totals?: { pageviews: number; visitors: number }
  // Active page filters, threaded into the full-list fetch (F14).
  filters?: string
  // The anonymous share surface has no full-list endpoints; it paginates only
  // what its own payload carries.
  memberFeatures?: boolean
  onFilter?: (filter: DimensionFilter) => void
}

const LIMIT = 7

function getChannelIcon(channel: string) {
  const cls = "w-5 h-5 text-neutral-500"
  switch (channel) {
    case 'Direct': return <LinkIcon className={cls} />
    case 'Organic Search': return <MagnifyingGlass className={cls} />
    case 'Organic Social': return <UsersThree className={cls} />
    case 'Paid Search': return <CurrencyCircleDollar className={cls} />
    case 'Paid Social': return <Megaphone className={cls} />
    case 'AI': return <Robot className={cls} />
    case 'Email': return <Envelope className={cls} />
    case 'Referral': return <ArrowSquareOut className={cls} />
    case 'Organic Video': return <PlayCircle className={cls} />
    case 'Display': return <Monitor className={cls} />
    case 'Affiliate': return <Handshake className={cls} />
    case 'SMS': return <ChatCircle className={cls} />
    default: return <Question className={cls} />
  }
}

export default function TopReferrers({ referrers, channels = [], collectReferrers = true, siteId, dateRange, totals, filters, memberFeatures = true, onFilter }: TopReferrersProps) {
  // A row that filters is a real control; one that cannot is inert text.
  // Same conditional-tag pattern as RealtimeVisitorsPopover, hoisted here
  // because the condition is a prop and every row in this file shares it.
  const Row = onFilter ? 'button' : 'div'
  const [view, setView] = useState<'referrers' | 'channels'>('referrers')
  const [faviconFailed, setFaviconFailed] = useState<Set<string>>(new Set())

  // Filter out empty/unknown referrers
  const filteredReferrers = (referrers || []).filter(
    ref => ref.referrer && ref.referrer !== 'Unknown' && ref.referrer !== ''
  )

  const mergedReferrers = mergeReferrersByDisplayName(filteredReferrers)

  // The dashboard fan-out carries only the top 10 — when it overflows the
  // card, fetch the full list once and paginate it client-side (same endpoint
  // the retired view-all modal used).
  const wantsFullList = memberFeatures && view === 'referrers' && mergedReferrers.length > LIMIT
  const { data: fullData } = useFullDimensionList<TopReferrer>(
    wantsFullList ? 'referrers' : null,
    siteId, dateRange?.start, dateRange?.end, 100, filters,
  )
  // Gate on wantsFullList: hook-state left over from another range must never
  // outrank the fan-out rows (the frozen-blocks bug, 01-09-2026).
  const fullMerged = wantsFullList && fullData
    ? mergeReferrersByDisplayName(fullData.filter(ref => ref.referrer && ref.referrer !== 'Unknown' && ref.referrer !== ''))
    : null
  const allReferrers = fullMerged && fullMerged.length >= mergedReferrers.length ? fullMerged : mergedReferrers

  // Channels data
  const filteredChannels = (channels || []).filter(c => c.channel && c.pageviews > 0)
  const hasChannelData = filteredChannels.length > 0
  const hasData = allReferrers.length > 0

  const activeAll = view === 'referrers' ? allReferrers : filteredChannels
  const pageCount = Math.max(1, Math.ceil(activeAll.length / LIMIT))
  // Page state keys on the context: a tab/filter/range change reads as page 1,
  // and a shrinking list clamps at read time.
  const [page, setPage] = useCardPage(`${view}|${filters ?? ''}|${dateRange?.start}|${dateRange?.end}`, pageCount)

  const displayedReferrers = allReferrers.slice((page - 1) * LIMIT, page * LIMIT)
  const emptySlots = Math.max(0, LIMIT - displayedReferrers.length)
  const displayedChannels = filteredChannels.slice((page - 1) * LIMIT, page * LIMIT)
  const channelEmptySlots = Math.max(0, LIMIT - displayedChannels.length)

  function renderReferrerIcon(referrer: string) {
    const faviconUrl = getReferrerFavicon(referrer)
    const useFavicon = faviconUrl && !faviconFailed.has(referrer)
    if (useFavicon) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={faviconUrl}
          alt=""
          width={20}
          height={20}
          className="w-5 h-5 flex-shrink-0 rounded-none object-contain"
          onError={() => setFaviconFailed((prev) => new Set(prev).add(referrer))}
          onLoad={(e) => {
            // Google's favicon service returns a 16x16 default globe when no real favicon exists
            const img = e.currentTarget
            if (img.naturalWidth <= 16) {
              setFaviconFailed((prev) => new Set(prev).add(referrer))
            }
          }}
        />
      )
    }
    return <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center">{getReferrerIcon(referrer)}</span>
  }

  return (
    <div data-tour="dimension-card" data-tour-card="referrers" className="bg-card rounded-none p-6 h-full flex flex-col border border-border min-w-0">
      <div className="flex items-center justify-between gap-2 mb-4">
        {/* Matches the scrolling tab row every other dimension card uses, so a
            narrow card can never push the header action off its right edge. */}
        {/* One Facet Switcher for every dimension card (owner pick C0, 06-09-2026);
            the overflow wrapper keeps a narrow card scrollable, as the tab row was. */}
        <div className="min-w-0 overflow-x-auto scrollbar-hide pb-1">
          <Switcher
            size="sm"
            aria-label="Referrers view"
            options={[
              { value: 'referrers', label: 'Referrers' },
              { value: 'channels', label: 'Channels' },
            ]}
            value={view}
            onChange={(v) => setView(v as 'referrers' | 'channels')}
          />
        </div>
        <DimensionInfoTip tab={view} className="ms-2 me-auto" />
        <div className="flex min-w-0 shrink items-center gap-1.5">
          <MetricUnitLabel />
        </div>
      </div>

      <div className="flex-1 min-h-[270px]">
        {view === 'referrers' ? (
          /* ── Referrers tab ── */
          !collectReferrers ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <p className="text-neutral-400 text-sm">Referrer tracking is disabled in site settings</p>
            </div>
          ) : hasData ? (
            <CascadeGroup flipKey={`referrers-${page}`} className="space-y-2">
              {displayedReferrers.map((ref, i) => {
                const barWidth = rowBarWidth(ref, allReferrers)
                return (
                  <CascadeRow key={ref.referrer} index={i}>
                    <Row
                      {...(onFilter ? { type: 'button' as const, onClick: () => onFilter?.({ dimension: 'referrer', operator: 'is', values: ref.allReferrers ?? [ref.referrer] }) } : {})}
                      className={`interactive-row w-full text-left relative overflow-hidden flex items-center justify-between h-9 group rounded-none px-2 -mx-2${onFilter ? ' cursor-pointer' : ''}`}
                    >
                      <RowBar width={barWidth} index={i} />
                      <div className="relative flex-1 truncate text-white flex items-center gap-3">
                        {renderReferrerIcon(ref.referrer)}
                        <span className="truncate" title={getReferrerDisplayName(ref.referrer)}>{getReferrerDisplayName(ref.referrer)}</span>
                      </div>
                      <MetricRowStat row={ref} totals={totals} />
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
              icon={<Globe />}
              title="Nobody's linked to you yet"
              description="Traffic sources appear here when visitors come from other websites, social media, or search engines."
              action={{ label: 'Install tracking script', href: '/installation' }}
            />
          )
        ) : (
          /* ── Channels tab ── */
          hasChannelData ? (
            <CascadeGroup flipKey={`channels-${page}`} className="space-y-2">
              {displayedChannels.map((ch, i) => {
                const barWidth = rowBarWidth(ch, filteredChannels)
                return (
                  <CascadeRow key={ch.channel} index={i}>
                    <Row
                      {...(onFilter ? { type: 'button' as const, onClick: () => onFilter?.({ dimension: 'channel', operator: 'is', values: [ch.channel] }) } : {})}
                      className={`interactive-row w-full text-left relative overflow-hidden flex items-center justify-between h-9 group rounded-none px-2 -mx-2${onFilter ? ' cursor-pointer' : ''}`}
                    >
                      <RowBar width={barWidth} index={i} />
                      <div className="relative flex-1 truncate text-white flex items-center gap-3">
                        <span className="flex-shrink-0">{getChannelIcon(ch.channel)}</span>
                        <span className="truncate" title={ch.channel}>{ch.channel}</span>
                      </div>
                      <MetricRowStat row={ch} totals={totals} />
                    </Row>
                  </CascadeRow>
                )
              })}
              {Array.from({ length: channelEmptySlots }).map((_, i) => (
                <div key={`ch-empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
              ))}
            </CascadeGroup>
          ) : (
            <EmptyState
              icon={<Globe />}
              title="No channel data yet"
              description="Channels group your traffic by type — direct, organic, social, and referral — as visitors arrive."
            />
          )
        )}
      </div>

      <CardPager page={page} pageCount={pageCount} onPageChange={setPage} label={view} />
    </div>
  )
}
