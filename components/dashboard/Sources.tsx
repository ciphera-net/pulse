'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
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
  Globe,
} from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { ListSkeleton } from '@/components/skeletons'
import { type CampaignStat, type TopReferrer } from '@/lib/api/stats'
import { useCampaignsList, useFullDimensionList } from '@/lib/swr/dashboard'
import { type DimensionFilter } from '@/lib/filters'
import { MetricRowStat, MetricUnitLabel, rowBarWidth } from '@/components/dashboard/MetricRowStat'
import { DimensionInfoTip } from '@/components/dashboard/MetricInfoTip'
import { CardPager, useCardPage } from '@/components/dashboard/CardPager'
import { CascadeGroup, CascadeRow, RowBar } from '@/components/dashboard/Cascade'
import { Select, Switcher } from '@ciphera-net/facet'

/**
 * Sources — where visitors came from, in ONE card.
 *
 * Owner ruling 06-09-2026 (round "Acquisition, One Card", pick BH): the
 * separate Campaigns card is gone; its five UTM views live behind a third
 * view of the Referrers/Channels card, chosen with a Select so the Switcher
 * stays three wide and the card keeps its half-width slot (seven views at
 * half width measurably clipped). The Locations card moved up beside it.
 *
 * What moved in from Campaigns, unchanged in meaning: the SWR rows hook with
 * its three honest states (loading / error-not-fake-empty / rows), the
 * client-side UTM grouping with visitors-weighted rates, the full-list fetch
 * that arms only on an eighth grouped row, the payload-rows diet for the
 * public share surface (keeps both member-only fetches unarmed), the
 * `utm_<dimension>` click-to-filter, and the period token for sub-day windows.
 * The campaigns fetch is armed only while the Campaigns view is open, so a
 * dashboard that never opens it never pays for it.
 */

type View = 'referrers' | 'channels' | 'campaigns'
type UtmDimension = 'source' | 'medium' | 'campaign' | 'term' | 'content'
// The ids that reach the InfoTip registry: the two list views plus the five
// UTM dimensions. The `campaigns` VIEW never reaches it — on that view the
// dimension is the key. The terms guard (lib/dashboard/__tests__/terms.test.ts)
// reads this union, so it must stay exact.
type Tab = 'referrers' | 'channels' | 'source' | 'medium' | 'campaign' | 'term' | 'content'

const UTM_OPTIONS: { value: UtmDimension; label: string }[] = [
  { value: 'source', label: 'Source' },
  { value: 'medium', label: 'Medium' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'term', label: 'Term' },
  { value: 'content', label: 'Content' },
]

interface SourcesProps {
  referrers: Array<{ referrer: string; pageviews: number; visitors?: number; bounce_rate?: number | null; avg_duration?: number | null }>
  channels?: Array<{ channel: string; pageviews: number; visitors?: number; bounce_rate?: number | null; avg_duration?: number | null }>
  collectReferrers?: boolean
  siteId: string
  dateRange: { start: string, end: string }
  // The API period token (1h/24h/…): sub-day rolling windows resolve on the
  // SERVER — the card's date bounds alone span two whole days when the
  // window crosses midnight. Campaigns view only.
  period?: string
  // True range totals — the F9 denominator. Referrers and channels count
  // pageviews; campaign rows count VISITORS. MetricRowStat picks the right
  // one from the row shape; no totals → no percentages.
  totals?: { pageviews: number; visitors: number }
  // Active page filters, threaded into the full-list fetches (F14).
  filters?: string
  // The anonymous share surface has no full-list endpoints; it paginates only
  // what its own payload carries.
  memberFeatures?: boolean
  onFilter?: (filter: DimensionFilter) => void
  // The public share surface's diet (02-09-2026): campaign rows arrive ON the
  // dashboard payload — floored and capped by the backend's single public
  // exit — instead of the member-only /campaigns endpoint. When provided,
  // BOTH campaign fetches stay unarmed; the member-only full-list can never
  // fire from a share view.
  campaigns?: CampaignStat[]
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

type GroupedRow = { name: string; visitors: number; pageviews: number; bounce_rate: number | null; avg_duration: number | null }

/** Group campaign rows by one UTM dimension; rates are visitors-weighted means
 *  of the non-null components — a component with no rate contributes no
 *  weight rather than dragging the mean toward zero. */
function groupByDimension(rows: CampaignStat[], dimension: UtmDimension): GroupedRow[] {
  type Acc = { visitors: number; pageviews: number; bounceW: number; bounceBase: number; durW: number; durBase: number }
  const grouped = new Map<string, Acc>()
  for (const item of rows) {
    const raw = item[dimension]
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
}

export default function Sources({
  referrers,
  channels = [],
  collectReferrers = true,
  siteId,
  dateRange,
  period,
  totals,
  filters,
  memberFeatures = true,
  onFilter,
  campaigns: payloadRows,
}: SourcesProps) {
  // A row that filters is a real control; one that cannot is inert text.
  const Row = onFilter ? 'button' : 'div'
  const [view, setView] = useState<View>('referrers')
  const [utm, setUtm] = useState<UtmDimension>('source')
  const [faviconFailed, setFaviconFailed] = useState<Set<string>>(new Set())

  // ── Referrers ──
  const filteredReferrers = (referrers || []).filter(
    ref => ref.referrer && ref.referrer !== 'Unknown' && ref.referrer !== ''
  )
  const mergedReferrers = mergeReferrersByDisplayName(filteredReferrers)
  // The dashboard fan-out carries only the top 10 — when it overflows the
  // card, fetch the full list once and paginate it client-side.
  const wantsReferrerFullList = memberFeatures && view === 'referrers' && mergedReferrers.length > LIMIT
  const { data: fullReferrers } = useFullDimensionList<TopReferrer>(
    wantsReferrerFullList ? 'referrers' : null,
    siteId, dateRange?.start, dateRange?.end, 100, filters,
  )
  // Gate on the want: hook-state left over from another range must never
  // outrank the fan-out rows (the frozen-blocks bug, 01-09-2026).
  const fullMerged = wantsReferrerFullList && fullReferrers
    ? mergeReferrersByDisplayName(fullReferrers.filter(ref => ref.referrer && ref.referrer !== 'Unknown' && ref.referrer !== ''))
    : null
  const allReferrers = fullMerged && fullMerged.length >= mergedReferrers.length ? fullMerged : mergedReferrers
  const hasReferrerData = allReferrers.length > 0

  // ── Channels ──
  const filteredChannels = (channels || []).filter(c => c.channel && c.pageviews > 0)
  const hasChannelData = filteredChannels.length > 0

  // ── Campaigns (armed only while the view is open; never from a share view) ──
  const campaignsArmed = view === 'campaigns' && payloadRows === undefined
  const { data: campaignRows, error: campaignError, isLoading: campaignsLoading, mutate: refetchCampaigns } =
    useCampaignsList(siteId, dateRange.start, dateRange.end, 10, filters, campaignsArmed, period)
  const campaignData = payloadRows ?? campaignRows ?? []
  const sortedCampaigns = useMemo(() => [...campaignData].sort((a, b) => b.visitors - a.visitors), [campaignData])
  const groupedCampaigns = useMemo(() => groupByDimension(sortedCampaigns, utm), [sortedCampaigns, utm])
  const hasCampaignData = campaignData.length > 0
  // Overflow is judged on the GROUPED rows — the full list arms only when the
  // card genuinely has an eighth grouped row to page to.
  const wantsCampaignFullList = campaignsArmed && hasCampaignData && groupedCampaigns.length > LIMIT
  const { data: fullCampaignsRaw } =
    useCampaignsList(siteId, dateRange.start, dateRange.end, 100, filters, wantsCampaignFullList, period)
  const groupedAllCampaigns = useMemo(() => {
    const base = fullCampaignsRaw && fullCampaignsRaw.length > 0 ? fullCampaignsRaw : campaignData
    return groupByDimension([...base].sort((a, b) => b.visitors - a.visitors), utm)
  }, [fullCampaignsRaw, campaignData, utm])
  const allCampaigns = groupedAllCampaigns.length >= groupedCampaigns.length ? groupedAllCampaigns : groupedCampaigns

  // ── Paging: one pager, keyed on the whole context ──
  const activeCount = view === 'referrers' ? allReferrers.length : view === 'channels' ? filteredChannels.length : allCampaigns.length
  const pageCount = Math.max(1, Math.ceil(activeCount / LIMIT))
  const [page, setPage] = useCardPage(`${view}|${view === 'campaigns' ? utm : ''}|${filters ?? ''}|${dateRange?.start}|${dateRange?.end}`, pageCount)
  const slice = <T,>(rows: T[]) => rows.slice((page - 1) * LIMIT, page * LIMIT)
  const displayedReferrers = slice(allReferrers)
  const displayedChannels = slice(filteredChannels)
  const displayedCampaigns = hasCampaignData ? slice(allCampaigns) : []
  const emptySlotsFor = (n: number) => Math.max(0, LIMIT - n)

  function renderFavicon(key: string) {
    const faviconUrl = getReferrerFavicon(key)
    const useFavicon = faviconUrl && !faviconFailed.has(key)
    if (useFavicon) {
      return (
        <Image
          src={faviconUrl}
          alt=""
          width={20}
          height={20}
          className="w-5 h-5 flex-shrink-0 rounded-none object-contain"
          onError={() => setFaviconFailed((prev) => new Set(prev).add(key))}
          onLoad={(e) => {
            // Google's favicon service returns a 16x16 default globe when no real favicon exists
            const img = e.currentTarget
            if (img.naturalWidth <= 16) setFaviconFailed((prev) => new Set(prev).add(key))
          }}
          unoptimized
        />
      )
    }
    return <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center">{getReferrerIcon(key)}</span>
  }

  const rowClass = `interactive-row w-full text-left relative overflow-hidden flex items-center justify-between h-9 group rounded-none px-2 -mx-2${onFilter ? ' cursor-pointer' : ''}`
  const infoTipKey: Tab = view === 'campaigns' ? utm : view

  return (
    <div data-tour="dimension-card" data-tour-card="referrers" className="bg-card rounded-none p-6 h-full flex flex-col border border-border min-w-0">
      <div className="flex items-center justify-between gap-2 mb-4">
        {/* The overflow wrapper keeps a narrow card scrollable, as the tab row was. */}
        <div className="min-w-0 overflow-x-auto scrollbar-hide pb-1">
          <Switcher
            size="sm"
            tone="solid"
            aria-label="Sources view"
            options={[
              { value: 'referrers', label: 'Referrers' },
              { value: 'channels', label: 'Channels' },
              { value: 'campaigns', label: 'Campaigns' },
            ]}
            value={view}
            onChange={(v) => setView(v as View)}
          />
        </div>
        <DimensionInfoTip tab={infoTipKey} className="ms-2 me-auto" />
        <div className="flex min-w-0 shrink items-center gap-2">
          {view === 'campaigns' && (
            // The UTM dimension. A Select, not more segments: seven views at
            // half width clip (measured in the round); three plus a picker fit.
            <Select
              aria-label="Campaign dimension"
              options={UTM_OPTIONS}
              value={utm}
              onChange={(v) => setUtm(v as UtmDimension)}
              className="h-7 min-w-[7.5rem] text-xs"
            />
          )}
          <MetricUnitLabel />
        </div>
      </div>

      <div className="flex-1 min-h-[270px]">
        {view === 'referrers' ? (
          /* ── Referrers ── */
          !collectReferrers ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <p className="text-neutral-400 text-sm">Referrer tracking is disabled in site settings</p>
            </div>
          ) : hasReferrerData ? (
            <CascadeGroup flipKey={`referrers-${page}`} className="space-y-2">
              {displayedReferrers.map((ref, i) => (
                <CascadeRow key={ref.referrer} index={i}>
                  <Row
                    {...(onFilter ? { type: 'button' as const, onClick: () => onFilter?.({ dimension: 'referrer', operator: 'is', values: ref.allReferrers ?? [ref.referrer] }) } : {})}
                    className={rowClass}
                  >
                    <RowBar width={rowBarWidth(ref, allReferrers)} index={i} />
                    <div className="relative flex-1 truncate text-white flex items-center gap-3">
                      {renderFavicon(ref.referrer)}
                      <span className="truncate" title={getReferrerDisplayName(ref.referrer)}>{getReferrerDisplayName(ref.referrer)}</span>
                    </div>
                    <MetricRowStat row={ref} totals={totals} />
                  </Row>
                </CascadeRow>
              ))}
              {Array.from({ length: emptySlotsFor(displayedReferrers.length) }).map((_, i) => (
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
        ) : view === 'channels' ? (
          /* ── Channels ── */
          hasChannelData ? (
            <CascadeGroup flipKey={`channels-${page}`} className="space-y-2">
              {displayedChannels.map((ch, i) => (
                <CascadeRow key={ch.channel} index={i}>
                  <Row
                    {...(onFilter ? { type: 'button' as const, onClick: () => onFilter?.({ dimension: 'channel', operator: 'is', values: [ch.channel] }) } : {})}
                    className={rowClass}
                  >
                    <RowBar width={rowBarWidth(ch, filteredChannels)} index={i} />
                    <div className="relative flex-1 truncate text-white flex items-center gap-3">
                      <span className="flex-shrink-0">{getChannelIcon(ch.channel)}</span>
                      <span className="truncate" title={ch.channel}>{ch.channel}</span>
                    </div>
                    <MetricRowStat row={ch} totals={totals} />
                  </Row>
                </CascadeRow>
              ))}
              {Array.from({ length: emptySlotsFor(displayedChannels.length) }).map((_, i) => (
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
        ) : (
          /* ── Campaigns (UTM) ── */
          campaignsLoading && !hasCampaignData ? (
            <ListSkeleton rows={LIMIT} />
          ) : campaignError && !campaignRows ? (
            // The anti-fake-empty: a failed request must never read as "no
            // campaign traffic". `!campaignRows` so a background revalidation
            // failure keeps the last good rows on screen.
            <ErrorCard
              title="Couldn’t load campaigns"
              description="The rest of the dashboard is unaffected."
              onRetry={() => refetchCampaigns()}
            />
          ) : hasCampaignData ? (
            <CascadeGroup flipKey={`${utm}-${page}`} className="space-y-2">
              {displayedCampaigns.map((item, i) => (
                <CascadeRow key={item.name} index={i}>
                  <Row
                    {...(onFilter ? { type: 'button' as const, onClick: () => onFilter?.({ dimension: `utm_${utm}`, operator: 'is', values: [item.name] }) } : {})}
                    className={rowClass}
                  >
                    <RowBar width={rowBarWidth(item, allCampaigns)} index={i} />
                    <div className="relative flex-1 text-white flex items-center gap-3 min-w-0">
                      {utm === 'source' && renderFavicon(item.name)}
                      <div className="min-w-0">
                        <div className="truncate font-medium text-sm" title={item.name}>
                          {utm === 'source' ? getReferrerDisplayName(item.name) : item.name}
                        </div>
                      </div>
                    </div>
                    <MetricRowStat row={item} totals={totals} />
                  </Row>
                </CascadeRow>
              ))}
              {Array.from({ length: emptySlotsFor(displayedCampaigns.length) }).map((_, i) => (
                <div key={`utm-empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
              ))}
            </CascadeGroup>
          ) : (
            <EmptyState
              icon={<Megaphone />}
              title="No UTM data yet"
              description="Tag your links with UTM parameters to track which campaigns drive the most traffic."
            />
          )
        )}
      </div>

      <CardPager page={page} pageCount={pageCount} onPageChange={setPage} label={view} />
    </div>
  )
}
