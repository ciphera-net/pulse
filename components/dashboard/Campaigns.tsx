'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { formatNumber } from '@ciphera-net/ui'
import { Modal, ArrowRightIcon, Button, Spinner } from '@ciphera-net/ui'
import { ChevronDownIcon, DownloadIcon } from '@ciphera-net/ui'
import { getCampaigns, CampaignStat } from '@/lib/api/stats'
import { getReferrerFavicon, getReferrerIcon, getReferrerDisplayName } from '@/lib/utils/icons'
import { FaBullhorn } from 'react-icons/fa'
import { PlusIcon } from '@radix-ui/react-icons'
import UtmBuilder from '@/components/tools/UtmBuilder'

interface CampaignsProps {
  siteId: string
  dateRange: { start: string, end: string }
}

const LIMIT = 7
const EMPTY_LABEL = '—'

type SortKey = 'source' | 'medium' | 'campaign' | 'visitors' | 'pageviews'
type SortDir = 'asc' | 'desc'

function sortCampaigns(data: CampaignStat[], key: SortKey, dir: SortDir): CampaignStat[] {
  return [...data].sort((a, b) => {
    const av = key === 'visitors' ? a.visitors : key === 'pageviews' ? a.pageviews : (a[key] || '').toLowerCase()
    const bv = key === 'visitors' ? b.visitors : key === 'pageviews' ? b.pageviews : (b[key] || '').toLowerCase()
    if (typeof av === 'number' && typeof bv === 'number') {
      return dir === 'asc' ? av - bv : bv - av
    }
    const cmp = String(av).localeCompare(String(bv))
    return dir === 'asc' ? cmp : -cmp
  })
}

function campaignRowKey(item: CampaignStat): string {
  return `${item.source}|${item.medium}|${item.campaign}`
}

export default function Campaigns({ siteId, dateRange }: CampaignsProps) {
  const [data, setData] = useState<CampaignStat[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isBuilderOpen, setIsBuilderOpen] = useState(false)
  const [fullData, setFullData] = useState<CampaignStat[]>([])
  const [isLoadingFull, setIsLoadingFull] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('visitors')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [faviconFailed, setFaviconFailed] = useState<Set<string>>(new Set())

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        const result = await getCampaigns(siteId, dateRange.start, dateRange.end, 10)
        setData(result)
      } catch (e) {
        console.error(e)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [siteId, dateRange])

  useEffect(() => {
    if (isModalOpen) {
      const fetchFullData = async () => {
        setIsLoadingFull(true)
        try {
          const result = await getCampaigns(siteId, dateRange.start, dateRange.end, 100)
          setFullData(result)
        } catch (e) {
          console.error(e)
        } finally {
          setIsLoadingFull(false)
        }
      }
      fetchFullData()
    } else {
      setFullData([])
    }
  }, [isModalOpen, siteId, dateRange])

  const sortedData = useMemo(
    () => sortCampaigns(data, sortKey, sortDir),
    [data, sortKey, sortDir]
  )
  const sortedFullData = useMemo(
    () => sortCampaigns(fullData.length > 0 ? fullData : data, sortKey, sortDir),
    [fullData, data, sortKey, sortDir]
  )
  const hasData = data.length > 0
  const displayedData = hasData ? sortedData.slice(0, LIMIT) : []
  const emptySlots = Math.max(0, LIMIT - displayedData.length)
  const showViewAll = hasData && data.length > LIMIT

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'visitors' || key === 'pageviews' ? 'desc' : 'asc')
    }
  }

  function renderSourceIcon(source: string) {
    const faviconUrl = getReferrerFavicon(source)
    const useFavicon = faviconUrl && !faviconFailed.has(source)
    if (useFavicon) {
      return (
        <img
          src={faviconUrl}
          alt=""
          className="w-5 h-5 flex-shrink-0 rounded object-contain"
          onError={() => setFaviconFailed((prev) => new Set(prev).add(source))}
        />
      )
    }
    return <span className="text-lg flex-shrink-0">{getReferrerIcon(source)}</span>
  }

  const handleExportCampaigns = () => {
    const rows = sortedData.length > 0 ? sortedData : data
    if (rows.length === 0) return
    const header = ['Source', 'Medium', 'Campaign', 'Visitors', 'Pageviews']
    const csvRows = [
      header.join(','),
      ...rows.map(r =>
        [r.source, r.medium || EMPTY_LABEL, r.campaign || EMPTY_LABEL, r.visitors, r.pageviews].join(',')
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

  const SortHeader = ({ label, colKey, className = '' }: { label: string; colKey: SortKey; className?: string }) => (
    <button
      type="button"
      onClick={() => handleSort(colKey)}
      className={`inline-flex items-center gap-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-inset rounded ${className}`}
      aria-label={`Sort by ${label}`}
    >
      {label}
      {sortKey === colKey ? (
        <ChevronDownIcon className={`w-3 h-3 text-brand-orange ${sortDir === 'asc' ? 'rotate-180' : ''}`} />
      ) : (
        <span className="w-3 h-3 inline-block text-neutral-400" aria-hidden />
      )}
    </button>
  )

  return (
    <>
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Campaigns
          </h3>
          <div className="flex items-center gap-2">
            {hasData && (
              <Button
                variant="ghost"
                onClick={handleExportCampaigns}
                className="h-8 px-3 text-xs gap-2"
              >
                <DownloadIcon className="w-3.5 h-3.5" />
                Export
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => setIsBuilderOpen(true)}
              className="h-8 px-3 text-xs gap-2"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Build URL
            </Button>
            {showViewAll && (
              <Button
                variant="ghost"
                onClick={() => setIsModalOpen(true)}
                className="h-8 px-3 text-xs"
              >
                View All
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 flex-1 min-h-[270px]">
            <div className="grid grid-cols-12 gap-2 mb-2 px-2">
              <div className="col-span-4 h-4 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
              <div className="col-span-2 h-4 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
              <div className="col-span-2 h-4 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
              <div className="col-span-2 h-4 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
              <div className="col-span-2 h-4 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
            </div>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={`skeleton-${i}`} className="grid grid-cols-12 gap-2 h-9 px-2 -mx-2">
                <div className="col-span-4 h-4 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                <div className="col-span-2 h-4 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                <div className="col-span-2 h-4 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                <div className="col-span-2 h-4 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                <div className="col-span-2 h-4 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
              </div>
            ))}
          </div>
        ) : hasData ? (
          <div className="space-y-2 flex-1 min-h-[270px]">
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2 px-2">
              <div className="col-span-4">
                <SortHeader label="Source" colKey="source" className="text-left" />
              </div>
              <div className="col-span-2">
                <SortHeader label="Medium" colKey="medium" className="text-left" />
              </div>
              <div className="col-span-2">
                <SortHeader label="Campaign" colKey="campaign" className="text-left" />
              </div>
              <div className="col-span-2 text-right">
                <SortHeader label="Visitors" colKey="visitors" className="text-right justify-end" />
              </div>
              <div className="col-span-2 text-right">
                <SortHeader label="Pageviews" colKey="pageviews" className="text-right justify-end" />
              </div>
            </div>
            {displayedData.map((item) => (
              <div
                key={campaignRowKey(item)}
                className="grid grid-cols-12 gap-2 items-center h-9 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors text-sm"
              >
                <div className="col-span-4 flex items-center gap-3 truncate">
                  {renderSourceIcon(item.source)}
                  <span className="truncate text-neutral-900 dark:text-white font-medium" title={item.source}>
                    {getReferrerDisplayName(item.source)}
                  </span>
                </div>
                <div className="col-span-2 truncate text-neutral-500 dark:text-neutral-400" title={item.medium}>
                  {item.medium || EMPTY_LABEL}
                </div>
                <div className="col-span-2 truncate text-neutral-500 dark:text-neutral-400" title={item.campaign}>
                  {item.campaign || EMPTY_LABEL}
                </div>
                <div className="col-span-2 text-right font-semibold text-neutral-900 dark:text-white">
                  {formatNumber(item.visitors)}
                </div>
                <div className="col-span-2 text-right text-neutral-600 dark:text-neutral-400">
                  {formatNumber(item.pageviews)}
                </div>
              </div>
            ))}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
            ))}
          </div>
        ) : (
          <div className="flex-1 min-h-[270px] flex flex-col items-center justify-center text-center px-6 py-8 gap-4">
            <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4">
              <FaBullhorn className="w-8 h-8 text-neutral-500 dark:text-neutral-400" />
            </div>
            <h4 className="font-semibold text-neutral-900 dark:text-white">
              Track your marketing campaigns
            </h4>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-md">
              Add <code className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-xs font-mono">utm_source</code>, <code className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-xs font-mono">utm_medium</code>, and <code className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-xs font-mono">utm_campaign</code> parameters to your links to see them here.
            </p>
            <Link
              href="/installation"
              className="inline-flex items-center gap-2 text-sm font-medium text-brand-orange hover:text-brand-orange/90 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-orange/20 rounded"
            >
              Read documentation
              <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="All Campaigns"
      >
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          {isLoadingFull ? (
            <div className="py-8 flex flex-col items-center gap-2">
              <Spinner />
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading...</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2 px-2 sticky top-0 bg-white dark:bg-neutral-900 py-2 z-10">
                <div className="col-span-4">Source</div>
                <div className="col-span-2">Medium</div>
                <div className="col-span-2">Campaign</div>
                <div className="col-span-2 text-right">Visitors</div>
                <div className="col-span-2 text-right">Pageviews</div>
              </div>
              {sortedFullData.map((item) => (
                <div
                  key={campaignRowKey(item)}
                  className="grid grid-cols-12 gap-2 items-center py-2 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors text-sm border-b border-neutral-100 dark:border-neutral-800 last:border-0"
                >
                  <div className="col-span-4 flex items-center gap-3 truncate">
                    {renderSourceIcon(item.source)}
                    <span className="truncate text-neutral-900 dark:text-white font-medium" title={item.source}>
                      {getReferrerDisplayName(item.source)}
                    </span>
                  </div>
                  <div className="col-span-2 truncate text-neutral-500 dark:text-neutral-400" title={item.medium}>
                    {item.medium || EMPTY_LABEL}
                  </div>
                  <div className="col-span-2 truncate text-neutral-500 dark:text-neutral-400" title={item.campaign}>
                    {item.campaign || EMPTY_LABEL}
                  </div>
                  <div className="col-span-2 text-right font-semibold text-neutral-900 dark:text-white">
                    {formatNumber(item.visitors)}
                  </div>
                  <div className="col-span-2 text-right text-neutral-600 dark:text-neutral-400">
                    {formatNumber(item.pageviews)}
                  </div>
                </div>
              ))}
            </>
          )}
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
