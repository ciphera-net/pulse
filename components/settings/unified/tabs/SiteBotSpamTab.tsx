'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Button,
  Toggle,
  Checkbox,
  SegmentedControl,
  Spinner,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  RailGrid,
  RailGridTile,
  toast,
  getAuthErrorMessage,
} from '@ciphera-net/facet'
import { Shield, Globe } from '@phosphor-icons/react'
import { getDateRange } from '@/lib/utils/format'
import { useSite, useQuarantineStats, useSessions, useSiteDomainReputation } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'
import { quarantineSessions, restoreSessions, createDomainOverride, deleteDomainOverride } from '@/lib/api/quarantine'
import { SettingsPanel, PanelRows, PanelRow, EmptyRow } from '@/components/settings/panels'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
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

/** A session's suspicion score → the house risk chip (danger/warning/neutral). */
function riskChip(score: number) {
  const tone: ChipTone = score >= 5 ? 'danger' : score >= 3 ? 'warning' : 'neutral'
  const label = score >= 5 ? 'High risk' : score >= 3 ? 'Suspicious' : 'Low risk'
  return <StatusChip tone={tone}>{label}</StatusChip>
}

/** Micro-label section header — the section grammar now that SettingsSections is gone. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-micro-label uppercase text-muted-foreground">{children}</p>
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

  // The visible slice of the current view — sessions this view is responsible
  // for. Drives both the rows and the empty check so a failed fetch can never
  // masquerade as an empty result (that path is handled separately below).
  const visibleSessions = (sessions || []).filter(s => botView === 'blocked' ? s.quarantined : !s.quarantined)

  // A domain-block final confirm reclassifies LIVE traffic; the destructive
  // solid fill lives only on that dialog's confirm button.
  const domains = domainReputation?.domains

  if (!site) return <SettingsLoadingState rows={3} />

  return (
    <div className="space-y-8">
      {/* ── Filtering ─────────────────────────────────────────────────── */}
      <SettingsPanel
        kicker="Filtering"
        description="Automatically filter bot traffic and referrer spam from your analytics."
      >
        <PanelRows>
          <PanelRow
            label="Bot filtering"
            caption="Filter known bots, crawlers, referrer spam, and suspicious traffic."
            control={
              <Toggle checked={filterBots} onChange={() => setFilterBots(p => !p)} disabled={!canManage} />
            }
          />
        </PanelRows>
      </SettingsPanel>

      {/* ── Detection stats — RailGrid of mono numerals ───────────────── */}
      <section className="space-y-3">
        <SectionLabel>Quarantine activity</SectionLabel>
        {botStatsError ? (
          /* A failed fetch must read as a server error, not a clean site. */
          <SettingsErrorState
            variant="banner"
            message="Couldn't load quarantine stats. This is a server error, not a clean site — try again in a moment."
            onRetry={() => mutateBotStats()}
            retrying={botStatsLoading}
          />
        ) : botStats ? (
          <RailGrid minTileWidth={150}>
            <StatTile value={botStats.total_quarantined ?? 0} label="Quarantined" />
            <StatTile value={botStats.last_24h ?? 0} label="Last 24h" />
            <StatTile value={Object.keys(botStats.by_reason || {}).length} label="Detection types" />
          </RailGrid>
        ) : (
          <RailGrid minTileWidth={150}>
            {[0, 1, 2].map(i => (
              <RailGridTile key={i}>
                <div className="h-7 w-12 animate-pulse rounded-none bg-input" />
                <div className="mt-2 h-3 w-20 animate-pulse rounded-none bg-muted" />
              </RailGridTile>
            ))}
          </RailGrid>
        )}
      </section>

      {/* ── Session review — RuledTable + neutral SegmentedControl ─────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel>Session review</SectionLabel>
          <SegmentedControl
            aria-label="Session view"
            size="sm"
            options={[
              { value: 'review', label: 'Suspicious' },
              { value: 'blocked', label: 'Quarantined' },
            ]}
            value={botView}
            onChange={(v) => { setBotView(v as 'review' | 'blocked'); setSelectedSessions(new Set()) }}
          />
        </div>

        {/* Suspicious-only view filter (review mode only) — available to all. */}
        {botView === 'review' && (
          <div className="flex items-center justify-between gap-4 rounded-none border border-border bg-card px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Suspicious only</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Show only sessions flagged as suspicious.</p>
            </div>
            <Toggle checked={suspiciousOnly} onChange={() => setSuspiciousOnly(v => !v)} />
          </div>
        )}

        {/* Bulk actions — managers only; selection is hidden for view-only. */}
        {canManage && selectedSessions.size > 0 && (
          <div className="flex items-center gap-3 rounded-none border border-border bg-muted px-4 py-2 text-sm">
            <span className="text-muted-foreground">{selectedSessions.size} selected</span>
            {botView === 'review' ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmBulkFlag(true)}
                disabled={isSaving('bulk')}
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                {isSaving('bulk') ? <><Spinner className="h-4 w-4" />Flagging…</> : 'Flag as bot'}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleBotUnfilter(Array.from(selectedSessions), 'bulk')}
                disabled={isSaving('bulk')}
              >
                {isSaving('bulk') ? <><Spinner className="h-4 w-4" />Unblocking…</> : 'Unblock'}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setSelectedSessions(new Set())} disabled={isSaving('bulk')} className="ml-auto">Clear</Button>
          </div>
        )}

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
          <div className="flex items-center justify-center rounded-none border border-border bg-card py-10">
            <Spinner className="h-5 w-5 text-muted-foreground" />
          </div>
        ) : visibleSessions.length === 0 ? (
          <SettingsPanel>
            <EmptyRow
              icon={<Shield weight="regular" />}
              title={botView === 'blocked' ? 'No quarantined sessions' : 'No suspicious sessions found'}
              caption={botView === 'blocked'
                ? 'Suspicious and blocked sessions will appear here once traffic flows through your site.'
                : 'Sessions flagged as suspicious will appear here for review.'}
            />
          </SettingsPanel>
        ) : (
          <Table aria-label="Session review" containerClassName="max-h-[26rem] overflow-y-auto">
            <THead>
              <TR>
                {canManage && <TH className="w-8" aria-label="Select" />}
                <TH>Session</TH>
                <TH>Risk</TH>
                {canManage && <TH className="w-px" aria-label="Actions" />}
              </TR>
            </THead>
            <TBody>
              {visibleSessions.map(session => {
                const sessionKey = `session:${session.session_id}`
                const path = session.first_page || '/'
                const meta = [
                  `${session.pageviews} page(s)`,
                  session.duration ? `${Math.round(session.duration)}s` : 'No duration',
                  [session.city, session.country].filter(Boolean).join(', ') || 'Unknown location',
                  session.browser || 'Unknown browser',
                  session.referrer || 'Direct',
                ].join(' · ')
                return (
                  <TR key={session.session_id}>
                    {canManage && (
                      <TD className="w-8">
                        <Checkbox
                          checked={selectedSessions.has(session.session_id)}
                          onChange={() => {
                            setSelectedSessions(prev => {
                              const next = new Set(prev)
                              if (next.has(session.session_id)) next.delete(session.session_id)
                              else next.add(session.session_id)
                              return next
                            })
                          }}
                          aria-label={`Select session ${path}`}
                        />
                      </TD>
                    )}
                    <TD>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate font-mono text-sm text-foreground">{path}</span>
                        <span className="text-xs text-muted-foreground">{meta}</span>
                      </div>
                    </TD>
                    <TD>{session.suspicion_score != null ? riskChip(session.suspicion_score) : null}</TD>
                    {canManage && (
                      <TD className="text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => botView === 'review' ? handleBotFilter([session.session_id], sessionKey) : handleBotUnfilter([session.session_id], sessionKey)}
                          disabled={isSaving(sessionKey)}
                          className={`shrink-0 whitespace-nowrap ${botView === 'review' ? 'border-destructive/30 text-destructive hover:bg-destructive/10' : ''}`}
                        >
                          {isSaving(sessionKey)
                            ? <><Spinner className="h-4 w-4" />{botView === 'review' ? 'Flagging…' : 'Unblocking…'}</>
                            : (botView === 'review' ? 'Flag as bot' : 'Unblock')}
                        </Button>
                      </TD>
                    )}
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}
      </section>

      {/* ── Domain reputation — ruled rows ────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <SectionLabel>Domain reputation</SectionLabel>
          <p className="mt-1 text-sm text-muted-foreground">
            Referrer domains seen on your site and their global reputation. Override to allow or block specific domains.
          </p>
        </div>

        {domainsError ? (
          <SettingsErrorState
            variant="banner"
            message="Couldn't load domain reputation. This is a server error, not an empty list — try again in a moment."
            onRetry={() => mutateDomains()}
            retrying={domainsLoading}
          />
        ) : domainReputation === undefined ? (
          <div className="flex items-center justify-center rounded-none border border-border bg-card py-10">
            <Spinner className="h-5 w-5 text-muted-foreground" />
          </div>
        ) : !domains || domains.length === 0 ? (
          <SettingsPanel>
            <EmptyRow
              icon={<Globe weight="regular" />}
              title="No domain data yet"
              caption="Referrer domain reputation scores will appear once traffic flows through your site."
            />
          </SettingsPanel>
        ) : (
          <Table aria-label="Domain reputation" containerClassName="max-h-[22rem] overflow-y-auto">
            <THead>
              <TR>
                <TH>Domain</TH>
                <TH numeric>Events</TH>
                <TH numeric>Bot</TH>
                {canManage && <TH className="w-px" aria-label="Actions" />}
              </TR>
            </THead>
            <TBody>
              {domains.map(domain => (
                <TR key={domain.domain}>
                  <TD>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-mono text-sm text-foreground">{domain.domain}</span>
                      <StatusChip tone={actionTone(domain.action)}>{humanizeAction(domain.action)}</StatusChip>
                      <StatusChip tone={sourceTone(domain.source)}>{humanizeSource(domain.source)}</StatusChip>
                      {domain.override && (
                        <StatusChip tone="warning">Override: {humanizeAction(domain.override)}</StatusChip>
                      )}
                    </div>
                  </TD>
                  <TD numeric className="text-muted-foreground">{domain.total_events}</TD>
                  <TD numeric className="text-muted-foreground">{Math.round(domain.bot_ratio * 100)}%</TD>
                  {canManage && (
                    <TD>
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleDomainAllow(domain.domain)}
                          disabled={domainBusy(domain.domain)}
                        >
                          {isSaving(`${domain.domain}:allow`) ? <Spinner className="h-4 w-4" /> : 'Allow'}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setBlockTarget(domain.domain)}
                          disabled={domainBusy(domain.domain)}
                          className="border-destructive/30 text-destructive hover:bg-destructive/10"
                        >
                          {isSaving(`${domain.domain}:block`) ? <Spinner className="h-4 w-4" /> : 'Block'}
                        </Button>
                        {domain.override && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDomainReset(domain.domain)}
                            disabled={domainBusy(domain.domain)}
                          >
                            {isSaving(`${domain.domain}:reset`) ? <Spinner className="h-4 w-4" /> : 'Reset'}
                          </Button>
                        )}
                      </div>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

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

/** A single detection stat: mono numeral over a mono micro-label caption. */
function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <RailGridTile>
      <p className="font-mono text-2xl tabular-nums text-foreground">{value}</p>
      <p className="mt-1 font-mono text-micro-label uppercase text-muted-foreground">{label}</p>
    </RailGridTile>
  )
}
