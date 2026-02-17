'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSite, type Site } from '@/lib/api/sites'
import { getRealtimeVisitors, getSessionDetails, type Visitor, type SessionEvent } from '@/lib/api/realtime'
import { toast } from '@ciphera-net/ui'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import { LoadingOverlay, UserIcon } from '@ciphera-net/ui'
import { motion, AnimatePresence } from 'framer-motion'

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return 'just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  return `${Math.floor(diffInSeconds / 86400)}d ago`
}

export default function RealtimePage() {
  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string

  const [site, setSite] = useState<Site | null>(null)
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null)
  const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingEvents, setLoadingEvents] = useState(false)

  // Load site info and initial visitors
  useEffect(() => {
    const init = async () => {
      try {
        const [siteData, visitorsData] = await Promise.all([
          getSite(siteId),
          getRealtimeVisitors(siteId)
        ])
        setSite(siteData)
        setVisitors(visitorsData || [])
        // Select first visitor if available
        if (visitorsData && visitorsData.length > 0) {
          handleSelectVisitor(visitorsData[0])
        }
      } catch (error: unknown) {
        toast.error(getAuthErrorMessage(error) || 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [siteId])

  // Poll for updates
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await getRealtimeVisitors(siteId)
        setVisitors(data || [])
        
        // Update selected visitor reference if they are still in the list
        if (selectedVisitor) {
            const updatedVisitor = data?.find(v => v.session_id === selectedVisitor.session_id)
            if (updatedVisitor) {
                // Don't overwrite the selectedVisitor state directly to avoid flickering details
                // But we could update "last seen" indicators if we wanted
            }
        }
      } catch (e) {
        // Silent fail
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [siteId, selectedVisitor])

  const handleSelectVisitor = async (visitor: Visitor) => {
    setSelectedVisitor(visitor)
    setLoadingEvents(true)
    try {
      const events = await getSessionDetails(siteId, visitor.session_id)
      setSessionEvents(events || [])
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || 'Failed to load session details')
    } finally {
      setLoadingEvents(false)
    }
  }

  if (loading) return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Realtime" />
  if (!site) return <div className="p-8">Site not found</div>

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 h-[calc(100vh-64px)] flex flex-col">
      <div className="mb-6 flex items-center justify-between">
        <div>
            <div className="flex items-center gap-2 mb-1">
                <button onClick={() => router.push(`/sites/${siteId}`)} className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange focus:rounded">
                    &larr; Back to Dashboard
                </button>
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-3">
            Realtime Visitors
            <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <span className="text-lg font-normal text-neutral-500" aria-live="polite" aria-atomic="true">
                {visitors.length} active now
            </span>
            </h1>
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 gap-6 min-h-0">
        {/* Visitors List */}
        <div className="w-full md:w-1/3 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden flex flex-col bg-white dark:bg-neutral-900">
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">Active Sessions</h2>
          </div>
          <div className="overflow-y-auto flex-1">
            {visitors.length === 0 ? (
              <div className="p-8 flex flex-col items-center justify-center text-center gap-3">
                <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-3">
                  <UserIcon className="w-6 h-6 text-neutral-500 dark:text-neutral-400" />
                </div>
                <p className="text-sm font-medium text-neutral-900 dark:text-white">
                  No active visitors right now
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  New visitors will appear here in real-time
                </p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                <AnimatePresence mode="popLayout">
                  {visitors.map((visitor) => (
                    <motion.button
                      key={visitor.session_id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.2 }}
                      onClick={() => handleSelectVisitor(visitor)}
                      className={`w-full text-left p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-inset ${
                        selectedVisitor?.session_id === visitor.session_id ? 'bg-neutral-50 dark:bg-neutral-800/50 ring-1 ring-inset ring-neutral-200 dark:ring-neutral-700' : ''
                      }`}
                    >
                    <div className="flex justify-between items-start mb-1">
                        <div className="font-medium text-neutral-900 dark:text-white truncate pr-2">
                             {visitor.country ? `${getFlagEmoji(visitor.country)} ${visitor.city || 'Unknown City'}` : 'Unknown Location'}
                        </div>
                        <span className="text-xs text-neutral-500 whitespace-nowrap">
                            {formatTimeAgo(visitor.last_seen)}
                        </span>
                    </div>
                    <div className="text-sm text-neutral-600 dark:text-neutral-400 truncate mb-1" title={visitor.current_path}>
                        {visitor.current_path}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-neutral-400">
                        <span>{visitor.device_type}</span>
                        <span>•</span>
                        <span>{visitor.browser}</span>
                        <span>•</span>
                        <span>{visitor.os}</span>
                        <span className="ml-auto bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-600 dark:text-neutral-400">
                            {visitor.pageviews} views
                        </span>
                    </div>
                  </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Session Details */}
        <div className="flex-1 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden flex flex-col bg-white dark:bg-neutral-900">
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 flex justify-between items-center">
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                    {selectedVisitor ? 'Session Journey' : 'Select a visitor'}
                </h2>
                {selectedVisitor && (
                    <span className="text-xs font-mono text-neutral-400">
                        ID: {selectedVisitor.session_id.substring(0, 8)}...
                    </span>
                )}
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
                {!selectedVisitor ? (
                    <div className="h-full flex items-center justify-center text-neutral-500">
                        Select a visitor on the left to see their activity.
                    </div>
                ) : loadingEvents ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-900 dark:border-white"></div>
                    </div>
                ) : (
                    <div className="relative pl-6 border-l-2 border-neutral-100 dark:border-neutral-800 space-y-8">
                        {sessionEvents.map((event, idx) => (
                            <div key={event.id} className="relative">
                                <span className={`absolute -left-[29px] top-1 h-3 w-3 rounded-full border-2 border-white dark:border-neutral-900 ${
                                    idx === 0 ? 'bg-green-500 ring-4 ring-green-100 dark:ring-green-900/30' : 'bg-neutral-300 dark:bg-neutral-700'
                                }`}></span>
                                
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-neutral-900 dark:text-white">
                                            Visited {event.path}
                                        </span>
                                        <span className="text-xs text-neutral-500">
                                            {new Date(event.timestamp).toLocaleTimeString()}
                                        </span>
                                    </div>
                                    
                                    {event.referrer && (
                                        <div className="text-xs text-neutral-500">
                                            Referrer: <span className="text-neutral-700 dark:text-neutral-300">{event.referrer}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                         <div className="relative">
                                <span className="absolute -left-[29px] top-1 h-3 w-3 rounded-full border-2 border-white dark:border-neutral-900 bg-neutral-300 dark:bg-neutral-700"></span>
                                <div className="text-sm text-neutral-500">
                                    Session started {formatTimeAgo(sessionEvents[sessionEvents.length - 1]?.timestamp || new Date().toISOString())}
                                </div>
                         </div>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  )
}

function getFlagEmoji(countryCode: string) {
  if (!countryCode || countryCode.length !== 2) return '🌍'
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}
