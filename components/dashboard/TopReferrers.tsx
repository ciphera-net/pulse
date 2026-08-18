'use client'

import { useState } from 'react'
import { formatNumber } from '@/lib/utils/format'
import { getReferrerDisplayName, getReferrerFavicon, getReferrerIcon, mergeReferrersByDisplayName } from '@/lib/utils/icons'
import {
  ArrowSquareOut,
  FrameCornersIcon,
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
import { Modal } from '@ciphera-net/facet'
import { Globe } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { ListSkeleton } from '@/components/skeletons'
import VirtualList from './VirtualList'
import { TopReferrer } from '@/lib/api/stats'
import { useFullDimensionList } from '@/lib/swr/dashboard'
import { type DimensionFilter } from '@/lib/filters'

interface TopReferrersProps {
  referrers: Array<{ referrer: string; pageviews: number }>
  channels?: Array<{ channel: string; pageviews: number }>
  collectReferrers?: boolean
  siteId: string
  dateRange: { start: string, end: string }
  // True range totals — the F9 denominator. Both tabs count pageviews, so
  // both divide by totals.pageviews; no totals → no percentages.
  totals?: { pageviews: number; visitors: number }
  // Active page filters, threaded into the modal fetch (F14).
  filters?: string
  // Hidden on the anonymous share surface (no full-list endpoints there).
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
  const [view, setView] = useState<'referrers' | 'channels'>('referrers')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalSearch, setModalSearch] = useState('')
  const [faviconFailed, setFaviconFailed] = useState<Set<string>>(new Set())

  const denom = totals && totals.pageviews > 0 ? totals.pageviews : null
  const pct = (pageviews: number) =>
    denom != null ? `${Math.round((pageviews / denom) * 100)}%` : ''

  // Modal data via SWR — armed only while open, filters on the key (F14/F17).
  const {
    data: fullData,
    error: fullError,
    isLoading: isLoadingFull,
    mutate: refetchFull,
  } = useFullDimensionList<TopReferrer>(
    isModalOpen ? 'referrers' : null,
    siteId, dateRange?.start, dateRange?.end, 100, filters,
  )

  // Filter out empty/unknown referrers
  const filteredReferrers = (referrers || []).filter(
    ref => ref.referrer && ref.referrer !== 'Unknown' && ref.referrer !== ''
  )

  const mergedReferrers = mergeReferrersByDisplayName(filteredReferrers)

  const hasData = mergedReferrers.length > 0
  const displayedReferrers = hasData ? mergedReferrers.slice(0, LIMIT) : []
  const emptySlots = Math.max(0, LIMIT - displayedReferrers.length)
  const showViewAll = memberFeatures && hasData && mergedReferrers.length > LIMIT

  // Channels data
  const filteredChannels = (channels || []).filter(c => c.channel && c.pageviews > 0)
  const hasChannelData = filteredChannels.length > 0
  const displayedChannels = hasChannelData ? filteredChannels.slice(0, LIMIT) : []
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
    <>
      <div className="bg-card rounded-none p-6 h-full flex flex-col border border-border min-w-0">
        <div className="flex items-center justify-between gap-2 mb-4">
          {/* Matches the scrolling tab row every other dimension card uses, so a
              narrow card can never push the header action off its right edge. */}
          <div className="flex gap-1 min-w-0 overflow-x-auto scrollbar-hide pb-1 max-md:[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)]" role="tablist" aria-label="Referrers view tabs">
            {(['referrers', 'channels'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setView(tab)}
                role="tab"
                aria-selected={view === tab}
                className={`relative px-2.5 py-3 sm:py-1 text-xs font-medium transition-colors capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange rounded-none cursor-pointer ${
                  view === tab
                    ? 'text-white'
                    : 'text-neutral-500 hover:text-neutral-300'
                } ease-apple`}
              >
                {tab}
                <span
                  className={`absolute inset-x-0 -bottom-px h-[3px] rounded-none transition-[width,background-color] duration-base ${
                    view === tab ? 'bg-brand-orange scale-x-100' : 'bg-transparent scale-x-0'
                  } ease-apple`}
                />
              </button>
            ))}
          </div>
          <div className="flex min-w-0 shrink items-center gap-1.5">
            {denom != null && (
              <span className="hidden min-w-0 truncate whitespace-nowrap text-[11px] text-neutral-500 sm:block">
                share of {formatNumber(denom)} pageviews
              </span>
            )}
            {view === 'referrers' && showViewAll && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="shrink-0 p-1.5 text-neutral-500 hover:text-brand-orange hover:bg-neutral-800 transition-all cursor-pointer rounded-none ease-apple"
                aria-label="View all referrers"
              >
                <FrameCornersIcon className="w-4 h-4" weight="bold" />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2 flex-1 min-h-[270px]">
          {view === 'referrers' ? (
            /* ── Referrers tab ── */
            !collectReferrers ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <p className="text-neutral-400 text-sm">Referrer tracking is disabled in site settings</p>
              </div>
            ) : hasData ? (
              <>
                {displayedReferrers.map((ref) => {
                  const maxPv = displayedReferrers[0]?.pageviews ?? 0
                  const barWidth = maxPv > 0 ? (ref.pageviews / maxPv) * 75 : 0
                  return (
                    <div
                      key={ref.referrer}
                      onClick={() => onFilter?.({ dimension: 'referrer', operator: 'is', values: ref.allReferrers ?? [ref.referrer] })}
                      className={`interactive-row relative overflow-hidden flex items-center justify-between h-9 group rounded-none px-2 -mx-2${onFilter ? ' cursor-pointer' : ''}`}
                    >
                      <div
                        className="absolute inset-y-0.5 left-0.5 bg-brand-orange/[0.07] border-l-2 border-brand-orange/70 rounded-none transition-[width,background-color] ease-apple"
                        style={{ width: `${barWidth}%` }}
                      />
                      <div className="relative flex-1 truncate text-white flex items-center gap-3">
                        {renderReferrerIcon(ref.referrer)}
                        <span className="truncate" title={getReferrerDisplayName(ref.referrer)}>{getReferrerDisplayName(ref.referrer)}</span>
                      </div>
                      <div className="relative flex items-center gap-2 ml-4">
                        <span className="text-xs font-medium text-brand-orange opacity-100 translate-x-0 md:opacity-0 md:translate-x-2 md:group-hover:opacity-100 md:group-hover:translate-x-0 transition-[opacity,transform] duration-base ease-apple">
                          {pct(ref.pageviews)}
                        </span>
                        <span className="text-sm font-semibold text-neutral-400">
                          {formatNumber(ref.pageviews)}
                        </span>
                      </div>
                    </div>
                  )
                })}
                {Array.from({ length: emptySlots }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
                ))}
              </>
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
              <>
                {displayedChannels.map((ch) => {
                  const maxPv = displayedChannels[0]?.pageviews ?? 0
                  const barWidth = maxPv > 0 ? (ch.pageviews / maxPv) * 75 : 0
                  return (
                    <div
                      key={ch.channel}
                      onClick={() => onFilter?.({ dimension: 'channel', operator: 'is', values: [ch.channel] })}
                      className={`interactive-row relative overflow-hidden flex items-center justify-between h-9 group rounded-none px-2 -mx-2${onFilter ? ' cursor-pointer' : ''}`}
                    >
                      <div
                        className="absolute inset-y-0.5 left-0.5 bg-brand-orange/[0.07] border-l-2 border-brand-orange/70 rounded-none transition-[width,background-color] ease-apple"
                        style={{ width: `${barWidth}%` }}
                      />
                      <div className="relative flex-1 truncate text-white flex items-center gap-3">
                        <span className="flex-shrink-0">{getChannelIcon(ch.channel)}</span>
                        <span className="truncate" title={ch.channel}>{ch.channel}</span>
                      </div>
                      <div className="relative flex items-center gap-2 ml-4">
                        <span className="text-xs font-medium text-brand-orange opacity-100 translate-x-0 md:opacity-0 md:translate-x-2 md:group-hover:opacity-100 md:group-hover:translate-x-0 transition-[opacity,transform] duration-base ease-apple">
                          {pct(ch.pageviews)}
                        </span>
                        <span className="text-sm font-semibold text-neutral-400">
                          {formatNumber(ch.pageviews)}
                        </span>
                      </div>
                    </div>
                  )
                })}
                {Array.from({ length: channelEmptySlots }).map((_, i) => (
                  <div key={`ch-empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
                ))}
              </>
            ) : (
              <EmptyState
                icon={<Globe />}
                title="No channel data yet"
                description="Channels group your traffic by type — direct, organic, social, and referral — as visitors arrive."
              />
            )
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setModalSearch('') }}
        title="Referrers"
        className="max-w-2xl max-h-[90vh] flex flex-col !bg-card !border-neutral-800"
      >
        <div>
          <input
            type="text"
            value={modalSearch}
            onChange={(e) => setModalSearch(e.target.value)}
            placeholder="Search referrers..."
            className="w-full px-3 py-2 mb-3 text-sm bg-neutral-800 border border-neutral-700 rounded-none text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50"
          />
          {denom != null && (
            <p className="mb-3 text-[11px] text-neutral-500">
              Shares are of all {formatNumber(denom)} pageviews in the range — searching narrows the rows, not the denominator.
            </p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoadingFull ? (
            <div className="py-4">
              <ListSkeleton rows={10} />
            </div>
          ) : fullError ? (
            <ErrorCard
              title="Couldn’t load the full list"
              onRetry={() => refetchFull()}
            />
          ) : (() => {
            const cleaned = (fullData ?? []).filter(
              ref => ref.referrer && ref.referrer !== 'Unknown' && ref.referrer !== ''
            )
            const modalData = mergeReferrersByDisplayName(cleaned).filter(r => !modalSearch || getReferrerDisplayName(r.referrer).toLowerCase().includes(modalSearch.toLowerCase()))
            return modalData.length > 0 ? (
              <VirtualList
                items={modalData}
                estimateSize={36}
                className="pr-2"
                renderItem={(ref) => (
                  <div
                    key={ref.referrer}
                    onClick={() => { if (onFilter) { onFilter({ dimension: 'referrer', operator: 'is', values: ref.allReferrers ?? [ref.referrer] }); setIsModalOpen(false) } }}
                    className={`interactive-row flex items-center justify-between h-9 group rounded-none px-2${onFilter ? ' cursor-pointer' : ''}`}
                  >
                    <div className="flex-1 truncate text-white flex items-center gap-3">
                      {renderReferrerIcon(ref.referrer)}
                      <span className="truncate" title={getReferrerDisplayName(ref.referrer)}>{getReferrerDisplayName(ref.referrer)}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <span className="text-xs font-medium text-brand-orange opacity-100 translate-x-0 md:opacity-0 md:translate-x-2 md:group-hover:opacity-100 md:group-hover:translate-x-0 transition-[opacity,transform] duration-base ease-apple">
                        {pct(ref.pageviews)}
                      </span>
                      <span className="text-sm font-semibold text-neutral-400">
                        {formatNumber(ref.pageviews)}
                      </span>
                    </div>
                  </div>
                )}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm text-neutral-500">{modalSearch ? 'No referrers match your search' : 'No referrers in this range'}</p>
              </div>
            )
          })()}
        </div>
      </Modal>
    </>
  )
}
