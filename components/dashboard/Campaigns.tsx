'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatNumber } from '@/lib/utils/format'
import { Modal, ArrowRightIcon, Button } from '@ciphera-net/ui'
import { getCampaigns, CampaignStat } from '@/lib/api/stats'
import { FaBullhorn } from 'react-icons/fa'
import { PlusIcon } from '@radix-ui/react-icons'
import UtmBuilder from '@/components/tools/UtmBuilder'

interface CampaignsProps {
  siteId: string
  dateRange: { start: string, end: string }
}

const LIMIT = 7

export default function Campaigns({ siteId, dateRange }: CampaignsProps) {
  const [data, setData] = useState<CampaignStat[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isBuilderOpen, setIsBuilderOpen] = useState(false)
  const [fullData, setFullData] = useState<CampaignStat[]>([])
  const [isLoadingFull, setIsLoadingFull] = useState(false)

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

  const hasData = data.length > 0
  const displayedData = hasData ? data.slice(0, LIMIT) : []
  const emptySlots = Math.max(0, LIMIT - displayedData.length)
  const showViewAll = hasData && data.length > LIMIT

  return (
    <>
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Campaigns
          </h3>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => setIsBuilderOpen(true)}
              className="h-8 px-3 text-xs gap-1.5"
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
          <div className="space-y-2 flex-1 min-h-[270px] flex flex-col items-center justify-center gap-2">
            <div className="animate-spin w-6 h-6 border-2 border-neutral-300 dark:border-neutral-700 border-t-brand-orange rounded-full" />
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading...</p>
          </div>
        ) : hasData ? (
          <div className="space-y-2 flex-1 min-h-[270px]">
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2 px-2">
              <div className="col-span-4">Source</div>
              <div className="col-span-3">Medium</div>
              <div className="col-span-3">Campaign</div>
              <div className="col-span-2 text-right">Visitors</div>
            </div>
            {displayedData.map((item, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-center h-9 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors text-sm">
                <div className="col-span-4 truncate text-neutral-900 dark:text-white font-medium" title={item.source}>
                  {item.source}
                </div>
                <div className="col-span-3 truncate text-neutral-600 dark:text-neutral-400" title={item.medium}>
                  {item.medium || '-'}
                </div>
                <div className="col-span-3 truncate text-neutral-600 dark:text-neutral-400" title={item.campaign}>
                  {item.campaign || '-'}
                </div>
                <div className="col-span-2 text-right font-semibold text-neutral-900 dark:text-white">
                  {formatNumber(item.visitors)}
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
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-orange hover:text-brand-orange/90 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-orange/20 rounded"
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
              <div className="animate-spin w-6 h-6 border-2 border-neutral-300 dark:border-neutral-700 border-t-brand-orange rounded-full" />
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading...</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2 px-2 sticky top-0 bg-white dark:bg-neutral-900 py-2 z-10">
                <div className="col-span-4">Source</div>
                <div className="col-span-3">Medium</div>
                <div className="col-span-3">Campaign</div>
                <div className="col-span-2 text-right">Visitors</div>
              </div>
              {(fullData.length > 0 ? fullData : data).map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-center py-2 group hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg px-2 -mx-2 transition-colors text-sm border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                  <div className="col-span-4 truncate text-neutral-900 dark:text-white font-medium" title={item.source}>
                    {item.source}
                  </div>
                  <div className="col-span-3 truncate text-neutral-600 dark:text-neutral-400" title={item.medium}>
                    {item.medium || '-'}
                  </div>
                  <div className="col-span-3 truncate text-neutral-600 dark:text-neutral-400" title={item.campaign}>
                    {item.campaign || '-'}
                  </div>
                  <div className="col-span-2 text-right font-semibold text-neutral-900 dark:text-white">
                    {formatNumber(item.visitors)}
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
