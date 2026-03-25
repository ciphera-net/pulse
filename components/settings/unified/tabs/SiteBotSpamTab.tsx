'use client'

import { useState, useEffect } from 'react'
import { Button, Toggle, toast, Spinner, getDateRange } from '@ciphera-net/ui'
import { ShieldCheck } from '@phosphor-icons/react'
import { useSite, useBotFilterStats, useSessions } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'
import { botFilterSessions, botUnfilterSessions } from '@/lib/api/bot-filter'

export default function SiteBotSpamTab({ siteId }: { siteId: string }) {
  const { data: site, mutate } = useSite(siteId)
  const { data: botStats, mutate: mutateBotStats } = useBotFilterStats(siteId)
  const [filterBots, setFilterBots] = useState(false)
  const [saving, setSaving] = useState(false)

  const [botView, setBotView] = useState<'review' | 'blocked'>('review')
  const [suspiciousOnly, setSuspiciousOnly] = useState(true)
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set())
  const [botDateRange] = useState(() => getDateRange(7))

  const { data: sessionsData, mutate: mutateSessions } = useSessions(siteId, botDateRange.start, botDateRange.end, botView === 'review' ? suspiciousOnly : false)
  const sessions = sessionsData?.sessions

  useEffect(() => {
    if (site) setFilterBots(site.filter_bots ?? false)
  }, [site])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSite(siteId, { name: site?.name || '', filter_bots: filterBots })
      await mutate()
      toast.success('Bot filtering updated')
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleBotFilter = async (sessionIds: string[]) => {
    try {
      await botFilterSessions(siteId, sessionIds)
      toast.success(`${sessionIds.length} session(s) flagged as bot`)
      setSelectedSessions(new Set())
      mutateSessions()
      mutateBotStats()
    } catch {
      toast.error('Failed to flag sessions')
    }
  }

  const handleBotUnfilter = async (sessionIds: string[]) => {
    try {
      await botUnfilterSessions(siteId, sessionIds)
      toast.success(`${sessionIds.length} session(s) unblocked`)
      setSelectedSessions(new Set())
      mutateSessions()
      mutateBotStats()
    } catch {
      toast.error('Failed to unblock sessions')
    }
  }

  if (!site) return <div className="flex items-center justify-center py-12"><Spinner className="w-6 h-6 text-neutral-500" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Bot & Spam Filtering</h3>
        <p className="text-sm text-neutral-400">Automatically filter bot traffic and referrer spam from your analytics.</p>
      </div>

      {/* Bot filtering toggle */}
      <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-neutral-800/30 border border-neutral-800">
        <div className="flex items-center gap-3">
          <ShieldCheck weight="bold" className="w-5 h-5 text-brand-orange" />
          <div>
            <p className="text-sm font-medium text-white">Enable bot filtering</p>
            <p className="text-xs text-neutral-400">Filter known bots, crawlers, referrer spam, and suspicious traffic.</p>
          </div>
        </div>
        <Toggle checked={filterBots} onChange={() => setFilterBots(p => !p)} />
      </div>

      {/* Stats */}
      {botStats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-neutral-800 bg-neutral-800/30 p-4 text-center">
            <p className="text-2xl font-bold text-white">{botStats.filtered_sessions ?? 0}</p>
            <p className="text-xs text-neutral-400 mt-1">Sessions filtered</p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-800/30 p-4 text-center">
            <p className="text-2xl font-bold text-white">{botStats.filtered_events ?? 0}</p>
            <p className="text-xs text-neutral-400 mt-1">Events filtered</p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-800/30 p-4 text-center">
            <p className="text-2xl font-bold text-white">{botStats.auto_blocked_this_month ?? 0}</p>
            <p className="text-xs text-neutral-400 mt-1">Auto-blocked this month</p>
          </div>
        </div>
      )}

      {/* Session Review */}
      <div className="space-y-3 pt-6 border-t border-neutral-800">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-neutral-300">Session Review</h4>
          {/* Review/Blocked toggle */}
          <div className="flex items-center rounded-lg border border-neutral-700 overflow-hidden text-sm">
            <button
              onClick={() => { setBotView('review'); setSelectedSessions(new Set()) }}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${botView === 'review' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}
            >
              Review
            </button>
            <button
              onClick={() => { setBotView('blocked'); setSelectedSessions(new Set()) }}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${botView === 'blocked' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}
            >
              Blocked
            </button>
          </div>
        </div>

        {/* Suspicious only filter (review mode only) */}
        {botView === 'review' && (
          <label className="flex items-center gap-2 text-sm text-neutral-400">
            <input
              type="checkbox"
              checked={suspiciousOnly}
              onChange={e => setSuspiciousOnly(e.target.checked)}
              className="w-4 h-4 rounded"
              style={{ accentColor: '#FD5E0F' }}
            />
            Suspicious only
          </label>
        )}

        {/* Bulk actions bar */}
        {selectedSessions.size > 0 && (
          <div className="flex items-center gap-3 p-2 bg-brand-orange/10 border border-brand-orange/20 rounded-lg text-sm">
            <span className="text-neutral-300">{selectedSessions.size} selected</span>
            {botView === 'review' ? (
              <button onClick={() => handleBotFilter(Array.from(selectedSessions))} className="text-red-400 hover:text-red-300 font-medium">Flag as bot</button>
            ) : (
              <button onClick={() => handleBotUnfilter(Array.from(selectedSessions))} className="text-green-400 hover:text-green-300 font-medium">Unblock</button>
            )}
            <button onClick={() => setSelectedSessions(new Set())} className="text-neutral-500 hover:text-neutral-300 ml-auto">Clear</button>
          </div>
        )}

        {/* Session cards */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {(sessions || [])
            .filter(s => botView === 'blocked' ? s.bot_filtered : !s.bot_filtered)
            .map(session => (
              <div key={session.session_id} className="flex items-center gap-3 p-3 rounded-xl border border-neutral-800 hover:border-neutral-700 transition-colors">
                <input
                  type="checkbox"
                  checked={selectedSessions.has(session.session_id)}
                  onChange={e => {
                    const next = new Set(selectedSessions)
                    e.target.checked ? next.add(session.session_id) : next.delete(session.session_id)
                    setSelectedSessions(next)
                  }}
                  className="w-4 h-4 shrink-0 cursor-pointer"
                  style={{ accentColor: '#FD5E0F' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">{session.first_page || '/'}</span>
                    {session.suspicion_score != null && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        session.suspicion_score >= 5 ? 'bg-red-900/30 text-red-400' :
                        session.suspicion_score >= 3 ? 'bg-yellow-900/30 text-yellow-400' :
                        'bg-neutral-800 text-neutral-400'
                      }`}>
                        {session.suspicion_score >= 5 ? 'High risk' : session.suspicion_score >= 3 ? 'Suspicious' : 'Low risk'}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500 mt-0.5">
                    <span>{session.pageviews} page(s)</span>
                    <span>{session.duration ? `${Math.round(session.duration)}s` : 'No duration'}</span>
                    <span>{[session.city, session.country].filter(Boolean).join(', ') || 'Unknown location'}</span>
                    <span>{session.browser || 'Unknown browser'}</span>
                    <span>{session.referrer || 'Direct'}</span>
                  </div>
                </div>
                <button
                  onClick={() => botView === 'review' ? handleBotFilter([session.session_id]) : handleBotUnfilter([session.session_id])}
                  className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    botView === 'review'
                      ? 'text-red-400 border-red-500/20 hover:bg-red-900/20'
                      : 'text-green-400 border-green-500/20 hover:bg-green-900/20'
                  }`}
                >
                  {botView === 'review' ? 'Flag as bot' : 'Unblock'}
                </button>
              </div>
            ))}
          {(!sessions || sessions.filter(s => botView === 'blocked' ? s.bot_filtered : !s.bot_filtered).length === 0) && (
            <p className="text-sm text-neutral-500 text-center py-4">
              {botView === 'blocked' ? 'No blocked sessions' : 'No suspicious sessions found'}
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} variant="primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}
