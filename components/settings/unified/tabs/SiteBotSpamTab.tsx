'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button, Toggle, toast, Spinner, getAuthErrorMessage } from '@ciphera-net/facet'
import { Checkbox } from '@/components/ui/checkbox'
import { getDateRange } from '@/lib/utils/format'
import { ShieldCheck, Shield } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useSite, useQuarantineStats, useSessions, useSiteDomainReputation } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'
import { quarantineSessions, restoreSessions, createDomainOverride, deleteDomainOverride } from '@/lib/api/quarantine'
import SettingsSections from '@/components/settings/SettingsSections'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import { StatusChip, type ChipTone } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useCan } from '@/lib/auth/permissions'

/** Title-case a raw snake_case string as a readable fallback. */
function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/** Domain reputation classification → house tone + label. */
function actionTone(action: string): ChipTone {
  if (action === 'quarantine') return 'danger'
  if (action === 'allow') return 'success'
  return 'neutral'
}
function humanizeAction(action: string): string {
  if (action === 'quarantine') return 'Blocked'
  if (action === 'allow') return 'Allowed'
  return titleCase(action)
}

/**
 * Reputation source → tone + label. Learned/collaborative (dynamic) sources
 * read as `purple`; imported seed/blocklist sources read as `info`. Raw
 * snake_case is humanized (matomo_seed → "Seed", legacy_blocklist → "Blocklist").
 */
function sourceTone(source: string): ChipTone {
  if (source === 'learned' || source === 'collaborative') return 'purple'
  if (source === 'matomo_seed' || source === 'legacy_blocklist') return 'info'
  return 'neutral'
}
function humanizeSource(source: string): string {
  switch (source) {
    case 'matomo_seed': return 'Seed'
    case 'legacy_blocklist': return 'Blocklist'
    case 'learned': return 'Learned'
    case 'collaborative': return 'Collaborative'
    default: return titleCase(source)
  }
}

export default function SiteBotSpamTab({ siteId }: { siteId: string }) {
  const canManage = useCan('quarantine.manage')
  const { data: site, mutate } = useSite(siteId)
  const { data: botStats, error: botStatsError, isLoading: botStatsLoading, mutate: mutateBotStats } = useQuarantineStats(siteId)
  const { data: domainReputation, error: domainsError, isLoading: domainsLoading, mutate: mutateDomains } = useSiteDomainReputation(siteId)
  const [filterBots, setFilterBots] = useState(false)
  const initialFilterRef = useRef<boolean | null>(null)

  const [botView, setBotView] = useState<'review' | 'blocked'>('review')
  const [suspiciousOnly, setSuspiciousOnly] = useState(true)
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set())
  const [botDateRange] = useState(() => getDateRange(7))

  const { data: sessionsData, error: sessionsError, isLoading: sessionsLoading, mutate: mutateSessions } = useSessions(siteId, { start_date: botDateRange.start, end_date: botDateRange.end, suspicious: botView === 'review' ? suspiciousOnly : undefined })
  const sessions = sessionsData?.sessions

  // Per-action in-flight tracking: disables the acting control and guards
  // against double-submit while a mutation is pending. Keys: 'bulk',
  // `session:<id>`, `<domain>:allow|block|reset`.
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set())
  const isSaving = (key: string) => savingKeys.has(key)
  const withSaving = useCallback(async (key: string, fn: () => Promise<void>) => {
    if (savingKeys.has(key)) return
    setSavingKeys(prev => new Set(prev).add(key))
    try {
      await fn()
    } finally {
      setSavingKeys(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }, [savingKeys])

  // Consequential-action confirmations (reclassify LIVE traffic as bot).
  const [confirmBulkFlag, setConfirmBulkFlag] = useState(false)
  const [blockTarget, setBlockTarget] = useState<string | null>(null)

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
  }, [siteId, filterBots, mutate, site])

  const handleBotFilter = (sessionIds: string[], key: string) =>
    withSaving(key, async () => {
      try {
        await quarantineSessions(siteId, sessionIds)
        toast.success(`${sessionIds.length} session(s) flagged as bot`)
        setSelectedSessions(new Set())
        mutateSessions()
        mutateBotStats()
      } catch (err) {
        toast.error(getAuthErrorMessage(err as Error) || 'Failed to flag sessions')
      }
    })

  const handleBotUnfilter = (sessionIds: string[], key: string) =>
    withSaving(key, async () => {
      try {
        await restoreSessions(siteId, sessionIds)
        toast.success(`${sessionIds.length} session(s) unblocked`)
        setSelectedSessions(new Set())
        mutateSessions()
        mutateBotStats()
      } catch (err) {
        toast.error(getAuthErrorMessage(err as Error) || 'Failed to unblock sessions')
      }
    })

  const handleDomainAllow = (domainName: string) =>
    withSaving(`${domainName}:allow`, async () => {
      try {
        await createDomainOverride(siteId, domainName, 'allow')
        toast.success(`${domainName} allowed`)
        mutateDomains()
      } catch (err) { toast.error(getAuthErrorMessage(err as Error) || 'Failed to update domain') }
    })

  const handleDomainBlock = (domainName: string) =>
    withSaving(`${domainName}:block`, async () => {
      try {
        await createDomainOverride(siteId, domainName, 'quarantine')
        toast.success(`${domainName} quarantined`)
        mutateDomains()
      } catch (err) { toast.error(getAuthErrorMessage(err as Error) || 'Failed to quarantine domain') }
    })

  const handleDomainReset = (domainName: string) =>
    withSaving(`${domainName}:reset`, async () => {
      try {
        await deleteDomainOverride(siteId, domainName)
        toast.success('Override removed')
        mutateDomains()
      } catch (err) { toast.error(getAuthErrorMessage(err as Error) || 'Failed to reset override') }
    })

  const domainBusy = (d: string) => isSaving(`${d}:allow`) || isSaving(`${d}:block`) || isSaving(`${d}:reset`)

  if (!site) return <div className="flex items-center justify-center py-12"><Spinner className="w-6 h-6 text-neutral-500" /></div>

  return (
    <div className="space-y-6">
      <SettingsSections sections={[
        { id: 'section-filtering', label: 'Filtering' },
        { id: 'section-sessions', label: 'Bot Sessions' },
        { id: 'section-reputation', label: 'Domain Reputation' },
      ]} />

      <div id="section-filtering" className="scroll-mt-20">
        <h3 className="text-base font-semibold text-white mb-1">Bot & Spam Filtering</h3>
        <p className="text-sm text-neutral-400">Automatically filter bot traffic and referrer spam from your analytics.</p>
      </div>

      {/* Bot filtering toggle */}
      <div className="flex items-center justify-between py-3 px-4 rounded-none bg-neutral-800/30 border border-neutral-800">
        <div className="flex items-center gap-3">
          <ShieldCheck weight="bold" className="w-5 h-5 text-brand-orange" />
          <div>
            <p className="text-sm font-medium text-white">Enable bot filtering</p>
            <p className="text-xs text-neutral-500">Filter known bots, crawlers, referrer spam, and suspicious traffic.</p>
          </div>
        </div>
        <Toggle checked={filterBots} onChange={() => setFilterBots(p => !p)} disabled={!canManage} />
      </div>

      {/* Stats — a failed fetch must read as a server error, not a clean site */}
      {botStatsError ? (
        <SettingsErrorState
          variant="banner"
          message="Couldn't load quarantine stats. This is a server error, not a clean site — try again in a moment."
          onRetry={() => mutateBotStats()}
          retrying={botStatsLoading}
        />
      ) : botStats ? (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-none border border-neutral-800 bg-neutral-800/30 p-4 text-center">
            <p className="text-2xl font-bold tabular-nums text-white">{botStats.total_quarantined ?? 0}</p>
            <p className="text-xs text-neutral-500 mt-1">Quarantined events</p>
          </div>
          <div className="rounded-none border border-neutral-800 bg-neutral-800/30 p-4 text-center">
            <p className="text-2xl font-bold tabular-nums text-white">{botStats.last_24h ?? 0}</p>
            <p className="text-xs text-neutral-500 mt-1">Last 24h</p>
          </div>
          <div className="rounded-none border border-neutral-800 bg-neutral-800/30 p-4 text-center">
            <p className="text-2xl font-bold tabular-nums text-white">{Object.keys(botStats.by_reason || {}).length}</p>
            <p className="text-xs text-neutral-500 mt-1">Detection types</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="rounded-none border border-neutral-800 bg-neutral-800/30 p-4">
              <div className="h-7 w-12 mx-auto rounded-none bg-neutral-800 animate-pulse" />
              <div className="h-3 w-20 mx-auto mt-2 rounded-none bg-neutral-800/60 animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Session Review */}
      <div id="section-sessions" className="scroll-mt-20 space-y-3 pt-6 border-t border-neutral-800">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-neutral-300 mb-2">Session Review</h4>
          {/* Review/Blocked toggle */}
          <div className="flex items-center gap-1">
            <Button
              variant={botView === 'review' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => { setBotView('review'); setSelectedSessions(new Set()) }}
            >
              Suspicious
            </Button>
            <Button
              variant={botView === 'blocked' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => { setBotView('blocked'); setSelectedSessions(new Set()) }}
            >
              Quarantined
            </Button>
          </div>
        </div>

        {/* Suspicious only filter (review mode only) — a view filter, available to all */}
        {botView === 'review' && (
          <div className="flex items-center justify-between py-3 px-4 rounded-none bg-neutral-800/30 border border-neutral-800">
            <div>
              <p className="text-sm font-medium text-white">Suspicious only</p>
              <p className="text-xs text-neutral-500">Show only sessions flagged as suspicious.</p>
            </div>
            <Toggle checked={suspiciousOnly} onChange={() => setSuspiciousOnly(v => !v)} />
          </div>
        )}

        {/* Bulk actions bar (managers only — selection is hidden for view-only) */}
        {canManage && selectedSessions.size > 0 && (
          <div className="flex items-center gap-3 p-2 bg-brand-orange/10 border border-brand-orange/20 rounded-none text-sm">
            <span className="text-neutral-300">{selectedSessions.size} selected</span>
            {botView === 'review' ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmBulkFlag(true)}
                disabled={isSaving('bulk')}
                className="text-red-400 border-red-900/50 hover:bg-red-900/20"
              >
                {isSaving('bulk') ? <><Spinner className="w-4 h-4" />Flagging…</> : 'Flag as bot'}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleBotUnfilter(Array.from(selectedSessions), 'bulk')}
                disabled={isSaving('bulk')}
              >
                {isSaving('bulk') ? <><Spinner className="w-4 h-4" />Unblocking…</> : 'Unblock'}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setSelectedSessions(new Set())} disabled={isSaving('bulk')} className="ml-auto">Clear</Button>
          </div>
        )}

        {/* Session cards */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {sessionsError ? (
            /* A failed request must never masquerade as "no suspicious sessions" —
             * that would read as a healthy site while detection is actually down. */
            <SettingsErrorState
              variant="card"
              message="Couldn't load sessions — the request failed, so this is a server error, not an empty result. Try again in a moment."
              onRetry={() => mutateSessions()}
              retrying={sessionsLoading}
            />
          ) : sessionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="w-5 h-5 text-neutral-500" />
            </div>
          ) : (
            <>
          {(sessions || [])
            .filter(s => botView === 'blocked' ? s.quarantined : !s.quarantined)
            .map(session => {
              const sessionKey = `session:${session.session_id}`
              return (
              <div key={session.session_id} className="flex items-center gap-3 p-3 rounded-none border border-neutral-800 hover:bg-neutral-800/40 hover:border-neutral-700 transition-colors ease-apple">
                {canManage && (
                  <Checkbox
                    checked={selectedSessions.has(session.session_id)}
                    onCheckedChange={(checked) => {
                      const next = new Set(selectedSessions)
                      checked ? next.add(session.session_id) : next.delete(session.session_id)
                      setSelectedSessions(next)
                    }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">{session.first_page || '/'}</span>
                    {session.suspicion_score != null && (
                      <StatusChip tone={session.suspicion_score >= 5 ? 'danger' : session.suspicion_score >= 3 ? 'warning' : 'neutral'}>
                        {session.suspicion_score >= 5 ? 'High risk' : session.suspicion_score >= 3 ? 'Suspicious' : 'Low risk'}
                      </StatusChip>
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
                {canManage && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => botView === 'review' ? handleBotFilter([session.session_id], sessionKey) : handleBotUnfilter([session.session_id], sessionKey)}
                    disabled={isSaving(sessionKey)}
                    className={`shrink-0 ${botView === 'review' ? 'text-red-400 border-red-900/50 hover:bg-red-900/20' : ''}`}
                  >
                    {isSaving(sessionKey)
                      ? <><Spinner className="w-4 h-4" />{botView === 'review' ? 'Flagging…' : 'Unblocking…'}</>
                      : (botView === 'review' ? 'Flag as bot' : 'Unblock')}
                  </Button>
                )}
              </div>
              )
            })}
          {(!sessions || sessions.filter(s => botView === 'blocked' ? s.quarantined : !s.quarantined).length === 0) && (
            <EmptyState
              title={botView === 'blocked' ? 'No quarantined sessions' : 'No suspicious sessions found'}
              description={botView === 'blocked' ? 'Suspicious and blocked sessions will appear here once traffic flows through your site.' : undefined}
              icon={<Shield weight="regular" />}
              className="py-8"
            />
          )}
            </>
          )}
        </div>
      </div>

      {/* Domain Reputation */}
      <div id="section-reputation" className="scroll-mt-20 space-y-3 pt-6 border-t border-neutral-800">
        <h4 className="text-sm font-medium text-neutral-300 mb-2">Domain Reputation</h4>
        <p className="text-xs text-neutral-500">Referrer domains seen on your site and their global reputation. Override to allow or block specific domains.</p>

        {domainsError ? (
          <SettingsErrorState
            variant="banner"
            message="Couldn't load domain reputation. This is a server error, not an empty list — try again in a moment."
            onRetry={() => mutateDomains()}
            retrying={domainsLoading}
          />
        ) : domainReputation === undefined ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="w-5 h-5 text-neutral-500" />
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {domainReputation.domains?.map(domain => (
              <div key={domain.domain} className="flex items-center justify-between p-3 rounded-none border border-neutral-800 hover:bg-neutral-800/40 transition-colors ease-apple">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono text-white truncate">{domain.domain}</span>
                    <StatusChip tone={actionTone(domain.action)}>{humanizeAction(domain.action)}</StatusChip>
                    <StatusChip tone={sourceTone(domain.source)}>{humanizeSource(domain.source)}</StatusChip>
                    {domain.override && (
                      <StatusChip tone="warning">Override: {humanizeAction(domain.override)}</StatusChip>
                    )}
                  </div>
                  <div className="flex gap-3 text-xs text-neutral-500 mt-0.5">
                    <span>{domain.total_events} events</span>
                    <span>{Math.round(domain.bot_ratio * 100)}% bot</span>
                  </div>
                </div>
                {canManage && (
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleDomainAllow(domain.domain)}
                      disabled={domainBusy(domain.domain)}
                      className={domain.override === 'allow' ? 'bg-green-900/30 text-green-400 border-green-900/50' : ''}
                    >
                      {isSaving(`${domain.domain}:allow`) ? <Spinner className="w-4 h-4" /> : 'Allow'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setBlockTarget(domain.domain)}
                      disabled={domainBusy(domain.domain)}
                      className={`text-red-400 border-red-900/50 hover:bg-red-900/20${domain.override === 'quarantine' ? ' bg-red-900/30' : ''}`}
                    >
                      {isSaving(`${domain.domain}:block`) ? <Spinner className="w-4 h-4" /> : 'Block'}
                    </Button>
                    {domain.override && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDomainReset(domain.domain)}
                        disabled={domainBusy(domain.domain)}
                      >
                        {isSaving(`${domain.domain}:reset`) ? <Spinner className="w-4 h-4" /> : 'Reset'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {(!domainReputation.domains || domainReputation.domains.length === 0) && (
              <EmptyState
                title="No domain data yet"
                description="Referrer domain reputation scores will appear once traffic flows through your site."
                icon={<Shield weight="regular" />}
                className="py-8"
              />
            )}
          </div>
        )}
      </div>

      {canManage && (
        <SettingsSaveBar
          isDirty={isDirty}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      )}

      {/* Consequential-action confirmations — bulk flag & domain block reclassify LIVE traffic */}
      <ConfirmDialog
        open={confirmBulkFlag}
        onOpenChange={setConfirmBulkFlag}
        title={`Flag ${selectedSessions.size} session(s) as bot?`}
        description="These sessions will be quarantined and removed from your analytics as bot traffic going forward. You can unblock them later from the Quarantined view."
        confirmLabel="Flag as bot"
        variant="danger"
        onConfirm={() => handleBotFilter(Array.from(selectedSessions), 'bulk')}
      />
      <ConfirmDialog
        open={blockTarget !== null}
        onOpenChange={(open) => { if (!open) setBlockTarget(null) }}
        title="Block this domain?"
        description={blockTarget ? `Traffic from ${blockTarget} will be reclassified as bot traffic and quarantined from your analytics going forward. You can reset this override later.` : undefined}
        confirmLabel="Block domain"
        variant="danger"
        onConfirm={async () => { if (blockTarget) await handleDomainBlock(blockTarget) }}
      />
    </div>
  )
}
