'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSite, type Site } from '@/lib/api/sites'
import { listReplays, formatDuration, type ReplayListItem, type ReplayFilters } from '@/lib/api/replays'
import { toast } from 'sonner'
import LoadingOverlay from '@/components/LoadingOverlay'

function formatDate(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getFlagEmoji(countryCode: string | null) {
  if (!countryCode || countryCode.length !== 2) return '🌍'
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}

function getDeviceEmoji(deviceType: string | null) {
  switch (deviceType?.toLowerCase()) {
    case 'mobile':
      return '📱'
    case 'tablet':
      return '📱'
    default:
      return '💻'
  }
}

export default function ReplaysPage() {
  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string

  const [site, setSite] = useState<Site | null>(null)
  const [replays, setReplays] = useState<ReplayListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState<ReplayFilters>({
    limit: 20,
    offset: 0,
  })

  // Load site info and replays
  useEffect(() => {
    const init = async () => {
      try {
        const siteData = await getSite(siteId)
        setSite(siteData)
      } catch (error: unknown) {
        toast.error('Failed to load site')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [siteId])

  // Load replays when filters change
  useEffect(() => {
    const loadReplays = async () => {
      try {
        const response = await listReplays(siteId, filters)
        setReplays(response.replays || [])
        setTotal(response.total)
      } catch (error: unknown) {
        toast.error('Failed to load replays')
      }
    }
    if (site) {
      loadReplays()
    }
  }, [siteId, site, filters])

  const handlePageChange = (newOffset: number) => {
    setFilters(prev => ({ ...prev, offset: newOffset }))
  }

  if (loading) return <LoadingOverlay logoSrc="/ciphera_icon_no_margins.png" title="Session Replays" />
  if (!site) return <div className="p-8">Site not found</div>

  const currentPage = Math.floor((filters.offset || 0) / (filters.limit || 20)) + 1
  const totalPages = Math.ceil(total / (filters.limit || 20))

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={() => router.push(`/sites/${siteId}`)}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
          >
            &larr; Back to Dashboard
          </button>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-3">
            Session Replays
            <span className="text-lg font-normal text-neutral-500">
              {total} recordings
            </span>
          </h1>
          {site.replay_mode === 'disabled' && (
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-xl text-sm">
              <span>⚠️</span>
              <span>Session replay is disabled</span>
              <button
                onClick={() => router.push(`/sites/${siteId}/settings`)}
                className="underline hover:no-underline"
              >
                Enable in settings
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-4 flex-wrap">
        <select
          className="px-3 py-2 border border-neutral-200 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-800 text-sm"
          value={filters.device_type || ''}
          onChange={(e) => setFilters(prev => ({ ...prev, device_type: e.target.value || undefined, offset: 0 }))}
        >
          <option value="">All Devices</option>
          <option value="desktop">Desktop</option>
          <option value="mobile">Mobile</option>
          <option value="tablet">Tablet</option>
        </select>

        <select
          className="px-3 py-2 border border-neutral-200 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-800 text-sm"
          value={filters.min_duration || ''}
          onChange={(e) => setFilters(prev => ({ ...prev, min_duration: e.target.value ? parseInt(e.target.value) : undefined, offset: 0 }))}
        >
          <option value="">Any Duration</option>
          <option value="5000">5s+</option>
          <option value="30000">30s+</option>
          <option value="60000">1m+</option>
          <option value="300000">5m+</option>
        </select>
      </div>

      {/* Replays List */}
      <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden bg-white dark:bg-neutral-900">
        {replays.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <div className="text-4xl mb-4">🎬</div>
            <p className="text-lg font-medium mb-2">No session replays yet</p>
            <p className="text-sm">
              {site.replay_mode === 'disabled'
                ? 'Enable session replay in settings to start recording visitor sessions.'
                : 'Recordings will appear here once visitors start interacting with your site.'}
            </p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50">
                  <th className="text-left px-4 py-3 text-sm font-semibold text-neutral-600 dark:text-neutral-400">Session</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-neutral-600 dark:text-neutral-400">Entry Page</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-neutral-600 dark:text-neutral-400">Duration</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-neutral-600 dark:text-neutral-400">Device</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-neutral-600 dark:text-neutral-400">Location</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-neutral-600 dark:text-neutral-400">Date</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold text-neutral-600 dark:text-neutral-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {replays.map((replay) => (
                  <tr
                    key={replay.id}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/sites/${siteId}/replays/${replay.id}`)}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        {replay.is_skeleton_mode && (
                          <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded">
                            Skeleton
                          </span>
                        )}
                        <span className="font-mono text-sm text-neutral-500">
                          {replay.session_id.substring(0, 8)}...
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-neutral-900 dark:text-white truncate block max-w-[200px]" title={replay.entry_page}>
                        {replay.entry_page}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-neutral-600 dark:text-neutral-400">
                        {formatDuration(replay.duration_ms)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 text-sm">
                        <span>{getDeviceEmoji(replay.device_type)}</span>
                        <span className="text-neutral-600 dark:text-neutral-400">
                          {replay.browser || 'Unknown'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm">
                        {getFlagEmoji(replay.country)} {replay.country || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-neutral-500">
                        {formatDate(replay.started_at)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/sites/${siteId}/replays/${replay.id}`)
                        }}
                        className="text-sm text-brand-orange hover:underline"
                      >
                        Watch →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 dark:border-neutral-800">
                <span className="text-sm text-neutral-500">
                  Showing {(filters.offset || 0) + 1} - {Math.min((filters.offset || 0) + (filters.limit || 20), total)} of {total}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePageChange((filters.offset || 0) - (filters.limit || 20))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm border border-neutral-200 dark:border-neutral-700 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-sm text-neutral-500">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange((filters.offset || 0) + (filters.limit || 20))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm border border-neutral-200 dark:border-neutral-700 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
