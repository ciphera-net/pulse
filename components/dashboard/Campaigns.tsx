'use client'

import { useState, useEffect, useMemo } from 'react'
import { logger } from '@/lib/utils/logger'
import Link from 'next/link'
import Image from 'next/image'
import { formatNumber } from '@ciphera-net/ui'
import { Modal, ArrowRightIcon } from '@ciphera-net/ui'
import { ListSkeleton } from '@/components/skeletons'
import VirtualList from './VirtualList'
import { getCampaigns, CampaignStat } from '@/lib/api/stats'
import { getReferrerFavicon, getReferrerIcon, getReferrerDisplayName } from '@/lib/utils/icons'
import { Megaphone, FrameCornersIcon } from '@phosphor-icons/react'
import UtmBuilder from '@/components/tools/UtmBuilder'
import { type DimensionFilter } from '@/lib/filters'

interface CampaignsProps {
  siteId: string
  dateRange: { start: string, end: string }
  filters?: string
  onFilter?: (filter: DimensionFilter) => void
}

type UtmTab = 'source' | 'medium' | 'campaign'

const LIMIT = 7

export default function Campaigns({ siteId, dateRange, filters, onFilter }: CampaignsProps) {
  const [data, setData] = useState<CampaignStat[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalSearch, setModalSearch] = useState('')
  const [isBuilderOpen, setIsBuilderOpen] = useState(false)
  const [fullData, setFullData] = useState<CampaignStat[]>([])
  const [isLoadingFull, setIsLoadingFull] = useState(false)
  const [faviconFailed, setFaviconFailed] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<UtmTab>('source')

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        const result = await getCampaigns(siteId, dateRange.start, dateRange.end, 10, filters)
        setData(result)
      } catch (e) {
        logger.error(e)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [siteId, dateRange, filters])

  useEffect(() => {
    if (isModalOpen) {
      const fetchFullData = async () => {
        setIsLoadingFull(true)
        try {
          const result = await getCampaigns(siteId, dateRange.start, dateRange.end, 100, filters)
          setFullData(result)
        } catch (e) {
          logger.error(e)
        } finally {
          setIsLoadingFull(false)
        }
      }
      fetchFullData()
    } else {
      setFullData([])
    }
  }, [isModalOpen, siteId, dateRange, filters])

  const sortedData = useMemo(
    () => [...data].sort((a, b) => b.visitors - a.visitors),
    [data]
  )
  const sortedFullData = useMemo(
    () => [...(fullData.length > 0 ? fullData : data)].sort((a, b) => b.visitors - a.visitors),
    [fullData, data]
  )

  const groupedData = useMemo(() => {
    const grouped = new Map<string, { visitors: number; pageviews: number }>()
    for (const item of sortedData) {
      const raw = item[activeTab]
      if (!raw) continue
      const key = raw
      const existing = grouped.get(key)
      if (existing) {
        existing.visitors += item.visitors
        existing.pageviews += item.pageviews
      } else {
        grouped.set(key, { visitors: item.visitors, pageviews: item.pageviews })
      }
    }
    return [...grouped.entries()]
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.visitors - a.visitors)
  }, [sortedData, activeTab])

  const totalVisitors = groupedData.reduce((sum, c) => sum + c.visitors, 0)
  const hasData = data.length > 0
  const displayedData = hasData ? groupedData.slice(0, LIMIT) : []
  const showViewAll = hasData && groupedData.length > LIMIT
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
          className="w-5 h-5 flex-shrink-0 rounded object-contain"
          onError={() => setFaviconFailed((prev) => new Set(prev).add(source))}
          unoptimized
        />
      )
    }
    return <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center">{getReferrerIcon(source)}</span>
  }

  const handleExportCampaigns = () => {
    const rows = sortedFullData.length > 0 ? sortedFullData : sortedData
    if (rows.length === 0) return
    const header = ['Source', 'Medium', 'Campaign', 'Visitors', 'Pageviews']
    const csvRows = [
      header.join(','),
      ...rows.map(r =>
        [r.source, r.medium || '', r.campaign || '', r.visitors, r.pageviews].join(',')
      ),
    ]
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `campaigns_${dateRange.start}_${dateRange.end}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="bg-neutral-900/80 border border-white/[0.08] rounded-2xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 pb-1" role="tablist" aria-label="Campaign dimension tabs">
            {(['source', 'medium', 'campaign'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                role="tab"
                aria-selected={activeTab === tab}
                className={`relative px-2.5 py-1 text-xs font-medium transition-colors capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange rounded cursor-pointer ${
                  activeTab === tab
                    ? 'text-white'
                    : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-300'
                } ease-apple`}
              >
                {tab}
                <span
                  className={`absolute inset-x-0 -bottom-px h-[3px] rounded-full transition-all duration-base ${
                    activeTab === tab ? 'bg-brand-orange scale-x-100' : 'bg-transparent scale-x-0'
                  } ease-apple`}
                />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {showViewAll && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="p-1.5 text-neutral-400 dark:text-neutral-500 hover:text-brand-orange dark:hover:text-brand-orange hover:bg-neutral-800 transition-all cursor-pointer rounded-lg ease-apple"
                aria-label="View all campaigns"
              >
                <FrameCornersIcon className="w-4 h-4" weight="bold" />
              </button>
            )}
            <button
              onClick={() => setIsBuilderOpen(true)}
              className="text-xs font-medium text-neutral-400 dark:text-neutral-500 hover:text-brand-orange dark:hover:text-brand-orange transition-colors cursor-pointer ease-apple"
            >
              Build URL
            </button>
          </div>
        </div>

        <div className="space-y-2 flex-1 min-h-[270px]">
          {isLoading ? (
            <ListSkeleton rows={LIMIT} />
          ) : hasData ? (
            <>
              {displayedData.map((item) => {
                const maxVis = displayedData[0]?.visitors ?? 0
                const barWidth = maxVis > 0 ? (item.visitors / maxVis) * 75 : 0
                const filterDimension = activeTab === 'source' ? 'utm_source' : activeTab === 'medium' ? 'utm_medium' : 'utm_campaign'
                return (
                  <div
                    key={item.name}
                    onClick={() => onFilter?.({ dimension: filterDimension, operator: 'is', values: [item.name] })}
                    className={`relative flex items-center justify-between h-9 group hover:bg-neutral-800/50 rounded-lg px-2 -mx-2 transition-colors${onFilter ? ' cursor-pointer' : ''} ease-apple`}
                  >
                    <div
                      className="absolute inset-y-0.5 left-0.5 bg-gradient-to-r from-brand-orange/15 via-brand-orange/8 to-transparent border border-brand-orange/20 shadow-[inset_0_1px_0_rgba(253,94,15,0.08)] rounded-md transition-all ease-apple"
                      style={{ width: `${barWidth}%` }}
                    />
                    <div className="relative flex-1 text-white flex items-center gap-3 min-w-0">
                      {activeTab === 'source' && renderSourceIcon(item.name)}
                      <div className="min-w-0">
                        <div className="truncate font-medium text-sm" title={item.name}>
                          {activeTab === 'source' ? getReferrerDisplayName(item.name) : item.name}
                        </div>
                      </div>
                    </div>
                    <div className="relative flex items-center gap-2 ml-4">
                      <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-base ease-apple">
                        {totalVisitors > 0 ? `${Math.round((item.visitors / totalVisitors) * 100)}%` : ''}
                      </span>
                      <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                        {formatNumber(item.visitors)}
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
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8 gap-3">
              <div className="rounded-full bg-neutral-800 p-4">
                <Megaphone className="w-8 h-8 text-neutral-400" />
              </div>
              <h4 className="font-semibold text-white">
                Track your marketing campaigns
              </h4>
              <p className="text-sm text-neutral-400 max-w-xs">
                Add UTM parameters to your links to see campaign performance here.
              </p>
              <button
                onClick={() => setIsBuilderOpen(true)}
                className="inline-flex items-center gap-2 text-sm font-medium text-brand-orange hover:text-brand-orange/90 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/20 rounded cursor-pointer"
              >
                Build a UTM URL
                <ArrowRightIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setModalSearch('') }}
        title="Campaigns"
        className="max-w-2xl !bg-neutral-900/65 backdrop-blur-3xl backdrop-saturate-150 supports-[backdrop-filter]:!bg-neutral-900/60 !border-white/[0.08]"
      >
        <div>
          <input
            type="text"
            value={modalSearch}
            onChange={(e) => setModalSearch(e.target.value)}
            placeholder="Search campaigns..."
            className="w-full px-3 py-2 mb-3 text-sm bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50"
          />
        </div>
        <div className="max-h-[80vh]">
          {isLoadingFull ? (
            <div className="py-4">
              <ListSkeleton rows={10} />
            </div>
          ) : (() => {
            const filteredCampaigns = !modalSearch ? sortedFullData : sortedFullData.filter(item => {
              const search = modalSearch.toLowerCase()
              return item.source.toLowerCase().includes(search) || (item.medium || '').toLowerCase().includes(search) || (item.campaign || '').toLowerCase().includes(search)
            })
            const modalTotal = filteredCampaigns.reduce((sum, item) => sum + item.visitors, 0)
            return (
              <>
                <div className="flex items-center justify-end mb-2">
                  <button
                    onClick={handleExportCampaigns}
                    className="text-xs font-medium text-neutral-400 hover:text-brand-orange transition-colors cursor-pointer ease-apple"
                  >
                    Export CSV
                  </button>
                </div>
                <VirtualList
                  items={filteredCampaigns}
                  estimateSize={36}
                  className="max-h-[80vh] overflow-y-auto pr-2"
                  renderItem={(item) => (
                    <div
                      key={`${item.source}|${item.medium}|${item.campaign}`}
                      onClick={() => { if (onFilter) { onFilter({ dimension: 'utm_source', operator: 'is', values: [item.source] }); setIsModalOpen(false) } }}
                      className={`flex items-center justify-between py-2 group hover:bg-neutral-800 rounded-lg px-2 transition-colors${onFilter ? ' cursor-pointer' : ''} ease-apple`}
                    >
                      <div className="flex-1 flex items-center gap-3 min-w-0">
                        {renderSourceIcon(item.source)}
                        <div className="min-w-0">
                          <div className="text-white font-medium truncate text-sm" title={item.source}>
                            {getReferrerDisplayName(item.source)}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
                            <span>{item.medium || '—'}</span>
                            <span>·</span>
                            <span className="truncate">{item.campaign || '—'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 ml-4 text-sm">
                        <span className="text-xs font-medium text-brand-orange opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-base ease-apple">
                          {modalTotal > 0 ? `${Math.round((item.visitors / modalTotal) * 100)}%` : ''}
                        </span>
                        <span className="font-semibold text-white">
                          {formatNumber(item.visitors)}
                        </span>
                        <span className="text-neutral-400 dark:text-neutral-500 w-16 text-right">
                          {formatNumber(item.pageviews)} pv
                        </span>
                      </div>
                    </div>
                  )}
                />
              </>
            )
          })()}
        </div>
      </Modal>

      <Modal
        isOpen={isBuilderOpen}
        onClose={() => setIsBuilderOpen(false)}
        title="Campaign URL Builder"
      >
        <div className="p-1">
          <UtmBuilder initialSiteId={siteId} />
        </div>
      </Modal>
    </>
  )
}
