'use client'

import { useState, useEffect } from 'react'
import { formatNumber } from '@/lib/utils/format'
import { Modal } from '@ciphera-net/ui'
import { getCampaigns, CampaignStat } from '@/lib/api/stats'

interface CampaignsProps {
  siteId: string
  dateRange: { start: string, end: string }
}

const LIMIT = 7

export default function Campaigns({ siteId, dateRange }: CampaignsProps) {
  const [data, setData] = useState<CampaignStat[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [fullData, setFullData] = useState<CampaignStat[]>([])
  const [isLoadingFull, setIsLoadingFull] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        const result = await getCampaigns(siteId, dateRange.start, dateRange.end)
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
          const result = await getCampaigns(siteId, dateRange.start, dateRange.end)
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
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Campaigns
          </h3>
          {showViewAll && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
            >
              View All
            </button>
          )}
        </div>

        <div className="space-y-2 flex-1 min-h-[270px]">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center">
              <p className="text-neutral-500">Loading...</p>
            </div>
          ) : hasData ? (
            <>
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
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center">
              <p className="text-neutral-600 dark:text-neutral-400">No campaign data available</p>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="All Campaigns"
      >
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          {isLoadingFull ? (
            <div className="py-4 text-center text-neutral-500">Loading...</div>
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
    </>
  )
}
