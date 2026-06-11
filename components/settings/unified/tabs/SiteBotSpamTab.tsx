'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button, Toggle, toast, Spinner, getAuthErrorMessage } from '@ciphera-net/ui'
import { Checkbox } from '@/components/ui/checkbox'
import { getDateRange } from '@/lib/utils/format'
import { ShieldCheck, Shield } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useSite, useQuarantineStats, useSessions, useSiteDomainReputation } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'
import { quarantineSessions, restoreSessions, createDomainOverride, deleteDomainOverride } from '@/lib/api/quarantine'
import SettingsSections from '@/components/settings/SettingsSections'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import { useCan } from '@/lib/auth/permissions'

export default function SiteBotSpamTab({ siteId }: { siteId: string }) {
  const canManage = useCan('quarantine.manage')
  const { data: site, mutate } = useSite(siteId)
  const { data: botStats, mutate: mutateBotStats } = useQuarantineStats(siteId)
  const { data: domainReputation, mutate: mutateDomains } = useSiteDomainReputation(siteId)
  const [filterBots, setFilterBots] = useState(false)
  const initialFilterRef = useRef<boolean | null>(null)

  const [botView, setBotView] = useState<'review' | 'blocked'>('review')
  const [suspiciousOnly, setSuspiciousOnly] = useState(true)
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set())
  const [botDateRange] = useState(() => getDateRange(7))

  const { data: sessionsData, mutate: mutateSessions } = useSessions(siteId, { start_date: botDateRange.start, end_date: botDateRange.end, suspicious: botView === 'review' ? suspiciousOnly : undefined })
  const sessions = sessionsData?.sessions

  const hasInitialized = useRef(false)
  useEffect(() => {
    if (!site || hasInitialized.current) return
    setFilterBots(site.filter_bots ?? false)
    initialFilterRef.current = site.filter_bots ?? false
    hasInitialized.current = true
  }, [site])

  // Track dirty state
  const isDirty = initialFilterRef.current !== null
    ? filterBots !== initialFilterRef.current
    : false

  const handleDiscard = () => {
    if (initialFilterRef.current === null) return
    setFilterBots(initialFilterRef.current)
  }

  const handleSave = useCallback(async () => {
    try {
      await updateSite(siteId, { name: site!.name, filter_bots: filterBots })
      initialFilterRef.current = filterBots
      await mutate()
      toast.success('Bot filtering updated')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to save settings')
    }
  }, [siteId, filterBots, mutate])

  const handleBotFilter = async (sessionIds: string[]) => {
    try {
      await quarantineSessions(siteId, sessionIds)
      toast.success(`${sessionIds.length} session(s) flagged as bot`)
      setSelectedSessions(new Set())
      mutateSessions()
      mutateBotStats()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to flag sessions')
    }
  }

  const handleBotUnfilter = async (sessionIds: string[]) => {
    try {
      await restoreSessions(siteId, sessionIds)
      toast.success(`${sessionIds.length} session(s) unblocked`)
      setSelectedSessions(new Set())
      mutateSessions()
      mutateBotStats()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to unblock sessions')
    }
  }

  if (!site) return <div className="flex items-center justify-center py-12"><Spinner className="w-6 h-6 text-neutral-500" /></div>

  return (
    <div className="space-y-6">
      <SettingsSections sections={[
        { id: 'section-filtering', label: 'Filtering' },
        { id: 'section-sessions', label: 'Bot Sessions' },
        { id: 'section-reputation', label: 'Domain Reputation' },
      ]} />

      <div id="section-filtering">
        <h3 className="text-base font-semibold text-white mb-1">Bot & Spam Filtering</h3>
        <p className="text-sm text-neutral-400">Automatically filter bot traffic and referrer spam from your analytics.</p>
      </div>

      {/* Bot filtering toggle */}
      <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-neutral-800/30 border border-neutral-800">
        <div className="flex items-center gap-3">
          <ShieldCheck weight="bold" className="w-5 h-5 text-brand-orange" />
          <div>
            <p className="text-sm font-medium text-white">Enable bot filtering</p>
            <p className="text-xs text-neutral-500">Filter known bots, crawlers, referrer spam, and suspicious traffic.</p>
          </div>
        </div>
        <Toggle checked={filterBots} onChange={() => setFilterBots(p => !p)} disabled={!canManage} />
      </div>

      {/* Stats */}
      {botStats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-neutral-800 bg-neutral-800/30 p-4 text-center">
            <p className="text-2xl font-bold tabular-nums text-white">{botStats.total_quarantined ?? 0}</p>
            <p className="text-xs text-neutral-500 mt-1">Quarantined events</p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-800/30 p-4 text-center">
            <p className="text-2xl font-bold tabular-nums text-white">{botStats.last_24h ?? 0}</p>
            <p className="text-xs text-neutral-500 mt-1">Last 24h</p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-800/30 p-4 text-center">
            <p className="text-2xl font-bold tabular-nums text-white">{Object.keys(botStats.by_reason || {}).length}</p>
            <p className="text-xs text-neutral-500 mt-1">Detection types</p>
          </div>
        </div>
      )}

      {/* Session Review */}
      <div id="section-sessions" className="space-y-3 pt-6 border-t border-neutral-800">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white mb-2">Session Review</h4>
          {/* Review/Blocked toggle */}
          <div className="flex items-center gap-1">
            <Button
              variant={botView === 'review' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => { setBotView('review'); setSelectedSessions(new Set()) }}
            >
              Suspicious
            </Button>
            <Button
              variant={botView === 'blocked' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => { setBotView('blocked'); setSelectedSessions(new Set()) }}
            >
              Quarantined
            </Button>
          </div>
        </div>

        {/* Suspicious only filter (review mode only) */}
        {botView === 'review' && (
          <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-neutral-800/30 border border-neutral-800">
            <div>
              <p className="text-sm font-medium text-white">Suspicious only</p>
              <p className="text-xs text-neutral-500">Show only sessions flagged as suspicious.</p>
            </div>
            <Toggle checked={suspiciousOnly} onChange={() => setSuspiciousOnly(v => !v)} />
          </div>
        )}

        {/* Bulk actions bar */}
        {selectedSessions.size > 0 && (
          <div className="flex items-center gap-3 p-2 bg-brand-orange/10 border border-brand-orange/20 rounded-lg text-sm">
            <span className="text-neutral-300">{selectedSessions.size} selected</span>
            {botView === 'review' ? (
              <Button variant="secondary" size="sm" onClick={() => handleBotFilter(Array.from(selectedSessions))} disabled={!canManage} className="text-red-400 border-red-900/50 hover:bg-red-900/20">Flag as bot</Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => handleBotUnfilter(Array.from(selectedSessions))} disabled={!canManage}>Unblock</Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setSelectedSessions(new Set())} className="ml-auto">Clear</Button>
          </div>
        )}

        {/* Session cards */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {(sessions || [])
            .filter(s => botView === 'blocked' ? s.quarantined : !s.quarantined)
            .map(session => (
              <div key={session.session_id} className="flex items-center gap-3 p-3 rounded-xl border border-neutral-800 hover:bg-neutral-800/40 hover:border-neutral-700 transition-colors ease-apple">
                <Checkbox
                  checked={selectedSessions.has(session.session_id)}
                  onCheckedChange={(checked) => {
                    const next = new Set(selectedSessions)
                    checked ? next.add(session.session_id) : next.delete(session.session_id)
                    setSelectedSessions(next)
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">{session.first_page || '/'}</span>
                    {session.suspicion_score != null && (
                      <span className={`px-1.5 py-0.5 rounded text-micro-label font-medium ${
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
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => botView === 'review' ? handleBotFilter([session.session_id]) : handleBotUnfilter([session.session_id])}
                  disabled={!canManage}
                  className={`shrink-0 ${botView === 'review' ? 'text-red-400 border-red-900/50 hover:bg-red-900/20' : ''}`}
                >
                  {botView === 'review' ? 'Flag as bot' : 'Unblock'}
                </Button>
              </div>
            ))}
          {(!sessions || sessions.filter(s => botView === 'blocked' ? s.quarantined : !s.quarantined).length === 0) && (
            <EmptyState
              title={botView === 'blocked' ? 'No quarantined sessions' : 'No suspicious sessions found'}
              description={botView === 'blocked' ? 'Suspicious and blocked sessions will appear here once traffic flows through your site.' : undefined}
              icon={<Shield weight="regular" />}
              className="py-8"
            />
          )}
        </div>
      </div>

      {/* Domain Reputation */}
      <div id="section-reputation" className="space-y-3 pt-6 border-t border-neutral-800">
        <h4 className="text-sm font-semibold text-white mb-2">Domain Reputation</h4>
        <p className="text-xs text-neutral-500">Referrer domains seen on your site and their global reputation. Override to allow or block specific domains.</p>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {domainReputation?.domains?.map(domain => (
            <div key={domain.domain} className="flex items-center justify-between p-3 rounded-xl border border-neutral-800 hover:bg-neutral-800/40 transition-colors ease-apple">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-white truncate">{domain.domain}</span>
                  <span className={`px-1.5 py-0.5 rounded text-micro-label font-medium ${
                    domain.action === 'quarantine' ? 'bg-red-900/30 text-red-400' :
                    domain.action === 'allow' ? 'bg-green-900/30 text-green-400' :
                    'bg-neutral-800 text-neutral-400'
                  }`}>
                    {domain.action}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-micro-label font-medium ${
                    domain.source === 'matomo_seed' || domain.source === 'legacy_blocklist' ? 'bg-blue-900/30 text-blue-400' :
                    domain.source === 'learned' ? 'bg-purple-900/30 text-purple-400' :
                    domain.source === 'collaborative' ? 'bg-purple-900/30 text-purple-400' :
                    'bg-neutral-800 text-neutral-400'
                  }`}>
                    {domain.source === 'matomo_seed' ? 'seed' : domain.source === 'collaborative' ? 'Collaborative' : domain.source}
                  </span>
                  {domain.override && (
                    <span className="px-1.5 py-0.5 rounded text-micro-label font-medium bg-amber-900/30 text-amber-400">
                      override: {domain.override}
                    </span>
                  )}
                </div>
                <div className="flex gap-3 text-xs text-neutral-500 mt-0.5">
                  <span>{domain.total_events} events</span>
                  <span>{Math.round(domain.bot_ratio * 100)}% bot</span>
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    try {
                      await createDomainOverride(siteId, domain.domain, 'allow')
                      toast.success(`${domain.domain} allowed`)
                      mutateDomains()
                    } catch (err) { toast.error(getAuthErrorMessage(err as Error) || 'Failed to update domain') }
                  }}
                  disabled={!canManage}
                  className={domain.override === 'allow' ? 'bg-green-900/20 text-green-400 border-green-500/30' : ''}
                >
                  Allow
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    try {
                      await createDomainOverride(siteId, domain.domain, 'quarantine')
                      toast.success(`${domain.domain} quarantined`)
                      mutateDomains()
                    } catch (err) { toast.error(getAuthErrorMessage(err as Error) || 'Failed to quarantine domain') }
                  }}
                  disabled={!canManage}
                  className={`text-red-400 border-red-900/50 hover:bg-red-900/20${domain.override === 'quarantine' ? ' bg-red-900/20' : ''}`}
                >
                  Block
                </Button>
                {domain.override && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      try {
                        await deleteDomainOverride(siteId, domain.domain)
                        toast.success('Override removed')
                        mutateDomains()
                      } catch (err) { toast.error(getAuthErrorMessage(err as Error) || 'Failed to reset override') }
                    }}
                    disabled={!canManage}
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
          ))}
          {(!domainReputation?.domains || domainReputation.domains.length === 0) && (
            <EmptyState
              title="No domain data yet"
              description="Referrer domain reputation scores will appear once traffic flows through your site."
              icon={<Shield weight="regular" />}
              className="py-8"
            />
          )}
        </div>
      </div>

      {canManage && (
        <SettingsSaveBar
          isDirty={isDirty}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      )}
    </div>
  )
}
