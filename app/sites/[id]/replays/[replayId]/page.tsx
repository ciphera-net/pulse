'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSite, type Site } from '@/lib/api/sites'
import { getReplay, getReplayData, deleteReplay, formatDuration, type SessionReplay } from '@/lib/api/replays'
import { toast } from 'sonner'
import LoadingOverlay from '@/components/LoadingOverlay'
import type { eventWithTime } from '@rrweb/types'

function formatDate(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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

export default function ReplayViewerPage() {
  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string
  const replayId = params.replayId as string

  const [site, setSite] = useState<Site | null>(null)
  const [replay, setReplay] = useState<SessionReplay | null>(null)
  const [replayData, setReplayData] = useState<eventWithTime[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [playerReady, setPlayerReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const playerContainerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<unknown>(null)

  // Load site and replay info
  useEffect(() => {
    const init = async () => {
      try {
        const [siteData, replayData] = await Promise.all([
          getSite(siteId),
          getReplay(siteId, replayId)
        ])
        setSite(siteData)
        setReplay(replayData)
      } catch (error: unknown) {
        toast.error('Failed to load replay')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [siteId, replayId])

  // Load replay data
  useEffect(() => {
    const loadData = async () => {
      if (!replay) return
      setLoadingData(true)
      try {
        const data = await getReplayData(siteId, replayId)
        setReplayData(data)
      } catch (error: unknown) {
        toast.error('Failed to load replay data')
      } finally {
        setLoadingData(false)
      }
    }
    loadData()
  }, [replay, siteId, replayId])

  // Initialize rrweb player when data is ready
  useEffect(() => {
    if (!replayData || !playerContainerRef.current || replayData.length === 0) return

    // Dynamically import rrweb-player
    const initPlayer = async () => {
      try {
        const rrwebPlayer = await import('rrweb-player')

        // Clear previous player
        if (playerContainerRef.current) {
          playerContainerRef.current.innerHTML = ''
        }

        // Calculate dimensions - use container width and maintain aspect ratio
        const containerWidth = playerContainerRef.current!.clientWidth
        const containerHeight = Math.max(500, Math.min(700, window.innerHeight - 300))

        // Create player with proper scaling
        const player = new rrwebPlayer.default({
          target: playerContainerRef.current!,
          props: {
            events: replayData,
            width: containerWidth,
            height: containerHeight,
            autoPlay: false,
            showController: true,
            speed: speed,
            skipInactive: true,
            showWarning: false,
            showDebug: false,
            // Enable responsive scaling
            UNSAFE_replayCanvas: false,
          },
        })

        playerRef.current = player

        // Listen for player events
        player.addEventListener('pause', () => setIsPlaying(false))
        player.addEventListener('start', () => setIsPlaying(true))
        player.addEventListener('finish', () => setIsPlaying(false))

        setPlayerReady(true)
      } catch (error) {
        console.error('Failed to initialize player:', error)
        toast.error('Failed to initialize replay player')
      }
    }

    initPlayer()

    return () => {
      if (playerRef.current) {
        // Cleanup player
        playerRef.current = null
      }
    }
  }, [replayData])

  // Update speed
  useEffect(() => {
    if (playerRef.current && typeof (playerRef.current as { setSpeed?: (s: number) => void }).setSpeed === 'function') {
      (playerRef.current as { setSpeed: (s: number) => void }).setSpeed(speed)
    }
  }, [speed])

  const handleDelete = async () => {
    try {
      await deleteReplay(siteId, replayId)
      toast.success('Replay deleted')
      router.push(`/sites/${siteId}/replays`)
    } catch (error: unknown) {
      toast.error('Failed to delete replay')
    }
  }

  if (loading) return <LoadingOverlay logoSrc="/ciphera_icon_no_margins.png" title="Loading Replay" />
  if (!site || !replay) return <div className="p-8">Replay not found</div>

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={() => router.push(`/sites/${siteId}/replays`)}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
          >
            &larr; Back to Replays
          </button>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
            Session Replay
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Player */}
        <div className="flex-1">
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden bg-white dark:bg-neutral-900">
            {/* Player Container */}
            <div
              ref={playerContainerRef}
              className="w-full bg-neutral-100 dark:bg-neutral-800 min-h-[500px] flex items-center justify-center [&_.rr-player]:!w-full [&_.rr-player]:!max-w-full [&_.rr-player__frame]:!w-full [&_.replayer-wrapper]:!mx-auto"
            >
              {loadingData ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-neutral-900 dark:border-white"></div>
                  <span className="text-sm text-neutral-500">Loading replay data...</span>
                </div>
              ) : !replayData || replayData.length === 0 ? (
                <div className="text-center text-neutral-500 p-8">
                  <div className="text-4xl mb-4">🎬</div>
                  <p className="text-lg font-medium mb-2">No replay data available</p>
                  <p className="text-sm">This session may not have recorded any events.</p>
                </div>
              ) : null}
            </div>

            {/* Custom Controls */}
            {playerReady && (
              <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-neutral-500">Playback Speed:</span>
                  <div className="flex gap-1">
                    {[0.5, 1, 2, 4].map((s) => (
                      <button
                        key={s}
                        onClick={() => setSpeed(s)}
                        className={`px-2 py-1 text-sm rounded ${
                          speed === s
                            ? 'bg-brand-orange text-white'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-neutral-500">
                  <span>{replay.events_count} events</span>
                  <span>•</span>
                  <span>{formatDuration(replay.duration_ms)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Session Info Sidebar */}
        <div className="w-80 flex-shrink-0">
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden bg-white dark:bg-neutral-900">
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50">
              <h2 className="font-semibold text-neutral-900 dark:text-white">Session Details</h2>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <span className="text-xs text-neutral-500 uppercase tracking-wider">Session ID</span>
                <p className="font-mono text-sm text-neutral-900 dark:text-white mt-1">{replay.session_id}</p>
              </div>

              <div>
                <span className="text-xs text-neutral-500 uppercase tracking-wider">Entry Page</span>
                <p className="text-sm text-neutral-900 dark:text-white mt-1 break-all">{replay.entry_page}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-neutral-500 uppercase tracking-wider">Duration</span>
                  <p className="text-sm text-neutral-900 dark:text-white mt-1">{formatDuration(replay.duration_ms)}</p>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 uppercase tracking-wider">Events</span>
                  <p className="text-sm text-neutral-900 dark:text-white mt-1">{replay.events_count}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-neutral-500 uppercase tracking-wider">Device</span>
                  <p className="text-sm text-neutral-900 dark:text-white mt-1 capitalize">{replay.device_type || 'Unknown'}</p>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 uppercase tracking-wider">Browser</span>
                  <p className="text-sm text-neutral-900 dark:text-white mt-1">{replay.browser || 'Unknown'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-neutral-500 uppercase tracking-wider">OS</span>
                  <p className="text-sm text-neutral-900 dark:text-white mt-1">{replay.os || 'Unknown'}</p>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 uppercase tracking-wider">Location</span>
                  <p className="text-sm text-neutral-900 dark:text-white mt-1">{getFlagEmoji(replay.country)} {replay.country || 'Unknown'}</p>
                </div>
              </div>

              <div>
                <span className="text-xs text-neutral-500 uppercase tracking-wider">Started</span>
                <p className="text-sm text-neutral-900 dark:text-white mt-1">{formatDate(replay.started_at)}</p>
              </div>

              {replay.ended_at && (
                <div>
                  <span className="text-xs text-neutral-500 uppercase tracking-wider">Ended</span>
                  <p className="text-sm text-neutral-900 dark:text-white mt-1">{formatDate(replay.ended_at)}</p>
                </div>
              )}

              <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center gap-2">
                  {replay.is_skeleton_mode ? (
                    <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-2 py-1 rounded">
                      🔒 Skeleton Mode (Anonymous)
                    </span>
                  ) : replay.consent_given ? (
                    <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-1 rounded">
                      ✓ Consent Given
                    </span>
                  ) : (
                    <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2 py-1 rounded">
                      ⚠ No Consent Record
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">Delete Replay?</h3>
            <p className="text-neutral-600 dark:text-neutral-400 mb-6">
              This action cannot be undone. The replay data will be permanently deleted.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
