'use client'

import { useState, useEffect, Fragment } from 'react'
import {
  Spinner,
  Input,
  Button,
  Select,
  Banner,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  getAuthErrorMessage,
} from '@ciphera-net/facet'
import { ListChecks, CaretRight, CaretDown } from '@phosphor-icons/react'
import { SettingsPanel, EmptyRow } from '@/components/settings/panels'
import { StatusChip, type ChipTone } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { useAuth } from '@/lib/auth/context'
import { getAuditLog, type AuditLogEntry } from '@/lib/api/audit'
import { formatPlanName } from '@/lib/plans'
import { formatDateTimeShort } from '@/lib/utils/formatDate'

const ACTION_LABELS: Record<string, string> = {
  site_created: 'Created site',
  site_updated: 'Updated site',
  site_deleted: 'Deleted site',
  site_restored: 'Restored site',
  goal_created: 'Created goal',
  goal_updated: 'Updated goal',
  goal_deleted: 'Deleted goal',
  funnel_created: 'Created funnel',
  funnel_updated: 'Updated funnel',
  funnel_deleted: 'Deleted funnel',
  gsc_connected: 'Connected Google Search Console',
  gsc_disconnected: 'Disconnected Google Search Console',
  bunny_connected: 'Connected BunnyCDN',
  bunny_disconnected: 'Disconnected BunnyCDN',
  member_invited: 'Invited member',
  member_removed: 'Removed member',
  member_role_changed: 'Changed member role',
  org_updated: 'Updated organization',
  subscription_plan_changed: 'Changed plan',
  billing_checkout_started: 'Started checkout',
  admin_plan_granted: 'Plan granted (admin)',
  subscription_cancelled: 'Cancelled subscription',
  subscription_resumed: 'Resumed subscription',
}

// * Fallback for actions the label map doesn't know yet — "quarantine_rule_created"
// * reads as "Quarantine rule created" instead of leaking the raw event name.
function humanizeAction(action: string): string {
  const words = action.replace(/[._]/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// * ONE disciplined tone map (spec §2.3 / §6): neutral by default, coral only for
// * genuinely destructive events (deletes, removals, disconnects, cancellations)
// * so a scan surfaces removals — NO lone greens (creations/connections stay
// * neutral; a "Created site" line is not a success signal).
function actionTone(action: string): ChipTone {
  if (/(deleted|removed|disconnected|cancelled)$/.test(action)) return 'danger'
  return 'neutral'
}

// * Payload values are shallow (strings/numbers/bools; rarely a nested object).
function formatPayloadValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const PAGE_SIZE = 20

// Sentinel for the "no action filter" state. An empty string blanks a Radix
// Select trigger, so we select this explicitly and translate it to '' (= no
// `action` param) at the call site.
const ACTION_FILTER_ALL = 'all'

export default function WorkspaceAuditTab() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [actionFilter, setActionFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!user?.org_id) return
    setLoading(true)
    setError(null)
    getAuditLog({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      ...(actionFilter && { action: actionFilter }),
      ...(startDate && { start_date: startDate }),
      ...(endDate && { end_date: endDate }),
    })
      .then(data => {
        setEntries(data.entries)
        setTotal(data.total)
      })
      .catch((err) => {
        setError(getAuthErrorMessage(err as Error) || 'Failed to load audit log')
        setLoading(false)
      })
      .finally(() => setLoading(false))
  }, [user?.org_id, page, actionFilter, startDate, endDate, retryCount])

  const handleRetry = () => { setError(null); setRetryCount(c => c + 1) }

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Date inputs emit `YYYY-MM-DD`, so a lexical comparison correctly detects an
  // inverted range — which the API answers with zero rows and would otherwise
  // read as a genuine "No activity yet" empty state.
  const invalidRange = Boolean(startDate && endDate && startDate > endDate)
  const filtersActive = Boolean(actionFilter || startDate || endDate)

  return (
    <div className="space-y-6">
      {/* Filters — Facet Select + dark-schemed native date inputs (spec §6) */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="audit-action" className="block font-semibold text-micro-label uppercase text-muted-foreground">
            Action
          </label>
          <Select
            id="audit-action"
            aria-label="Filter by action"
            // Radix Select renders a blank trigger for an empty value (it reads as
            // "no selection"), so the unfiltered state carries an explicit `all`
            // sentinel — mapped back to '' for the API — and a placeholder as a
            // belt-and-suspenders fallback.
            value={actionFilter || ACTION_FILTER_ALL}
            onChange={(val) => { setActionFilter(val === ACTION_FILTER_ALL ? '' : val); setPage(1) }}
            placeholder="All actions"
            className="w-[13rem]"
            options={[
              { value: ACTION_FILTER_ALL, label: 'All actions' },
              ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })),
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="audit-from" className="block font-semibold text-micro-label uppercase text-muted-foreground">
            From
          </label>
          <Input
            id="audit-from"
            type="date"
            value={startDate}
            onChange={e => { setStartDate(e.target.value); setPage(1) }}
            className="w-[10rem] [color-scheme:dark]"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="audit-to" className="block font-semibold text-micro-label uppercase text-muted-foreground">
            To
          </label>
          <Input
            id="audit-to"
            type="date"
            value={endDate}
            onChange={e => { setEndDate(e.target.value); setPage(1) }}
            className="w-[10rem] [color-scheme:dark]"
          />
        </div>
        {filtersActive && (
          <Button
            variant="secondary"
            onClick={() => { setActionFilter(''); setStartDate(''); setEndDate(''); setPage(1) }}
          >
            Clear
          </Button>
        )}
      </div>

      {invalidRange && (
        <Banner tone="warning" title="Start date is after end date." />
      )}

      {error ? (
        <SettingsErrorState variant="card" message={error} onRetry={handleRetry} />
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner className="w-6 h-6 text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <SettingsPanel>
          <EmptyRow
            icon={<ListChecks weight="regular" />}
            title="No activity yet"
            caption="Workspace actions like site changes and member updates will appear here as they happen."
          />
        </SettingsPanel>
      ) : (
        <>
          <Table aria-label="Audit log">
            <THead>
              <TR>
                <TH className="w-8" aria-label="Expand" />
                <TH>Time</TH>
                <TH>Actor</TH>
                <TH>Action</TH>
              </TR>
            </THead>
            <TBody>
              {entries.map(entry => {
                const hasPayload = Boolean(entry.payload && Object.keys(entry.payload).length > 0)
                const isOpen = expanded.has(entry.id)
                return (
                  <Fragment key={entry.id}>
                    <TR
                      className={hasPayload ? 'cursor-pointer' : undefined}
                      onClick={hasPayload ? () => toggleExpanded(entry.id) : undefined}
                    >
                      <TD className="w-8 text-muted-foreground">
                        {hasPayload && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleExpanded(entry.id) }}
                            aria-expanded={isOpen}
                            aria-controls={`audit-payload-${entry.id}`}
                            aria-label={isOpen ? 'Hide details' : 'Show details'}
                            className="flex items-center text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {isOpen ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}
                          </button>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap tabular-nums text-xs text-muted-foreground">
                        {formatDateTimeShort(new Date(entry.occurred_at))}
                      </TD>
                      <TD className="min-w-0 font-medium text-foreground">
                        <span className="block truncate" title={entry.actor_email || 'System'}>
                          {entry.actor_email || 'System'}
                        </span>
                      </TD>
                      <TD title={ACTION_LABELS[entry.action] || humanizeAction(entry.action)}>
                        <StatusChip
                          tone={actionTone(entry.action)}
                          className="whitespace-normal font-semibold uppercase text-[11px] tracking-[0.08em]"
                        >
                          {ACTION_LABELS[entry.action] || humanizeAction(entry.action)}
                        </StatusChip>
                      </TD>
                    </TR>
                    {hasPayload && isOpen && (
                      <TR>
                        <TD colSpan={4} id={`audit-payload-${entry.id}`} className="bg-muted p-0">
                          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 px-5 py-4 sm:grid-cols-2">
                            {Object.entries(entry.payload!).map(([key, value]) => (
                              <div
                                key={key}
                                className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2"
                              >
                                <dt className="font-semibold text-micro-label uppercase text-muted-foreground">
                                  {key.replace(/_/g, ' ')}
                                </dt>
                                {/* plan ids surface in payloads (plan_id: "solo") — show the
                                    canonical display name, same as the billing card */}
                                <dd className="break-all text-right font-mono text-xs text-foreground">
                                  {key === 'plan_id' && typeof value === 'string'
                                    ? formatPlanName(value)
                                    : formatPayloadValue(value)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </TD>
                      </TR>
                    )}
                  </Fragment>
                )
              })}
            </TBody>
          </Table>

          <div className="flex items-center justify-between gap-4">
            <span className="text-xs tabular-nums text-muted-foreground">
              {total > 0 ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}` : 'No entries'}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                onClick={() => setPage(p => p + 1)}
                disabled={page * PAGE_SIZE >= total}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
