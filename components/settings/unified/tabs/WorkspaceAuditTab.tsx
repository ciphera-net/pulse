'use client'

import { useState, useEffect, Fragment } from 'react'
import {
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
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { useAuth } from '@/lib/auth/context'
import { getAuditLog, type AuditLogEntry } from '@/lib/api/audit'
import { formatPlanName } from '@/lib/plans'
import { formatDateTimeFull } from '@/lib/utils/formatDate'
import { cn } from '@/lib/utils'

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

// * Fallback for actions the label map doesn't know yet: "quarantine_rule_created"
// * reads as "Quarantine rule created" instead of leaking the raw event name.
function humanizeAction(action: string): string {
  const words = action.replace(/[._]/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// Same treatment for a payload key: "site_id" reads as "Site id".
function humanizeKey(key: string): string {
  const words = key.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// * ONE disciplined tone map (spec §2.3 / §6): neutral by default, coral only for
// * genuinely destructive events (deletes, removals, disconnects, cancellations)
// * so a scan surfaces removals. NO lone greens (creations/connections stay
// * neutral; a "Created site" line is not a success signal).
function actionTone(action: string): ChipTone {
  if (/(deleted|removed|disconnected|cancelled)$/.test(action)) return 'danger'
  return 'neutral'
}

// * A payload key that names an id, a credential or a path (site_id, api_key,
// * domain) is code and renders mono; everything else, including a boolean, a
// * number or an English word, is copy and stays sans (spec §6/§9).
function isIdentifierKey(key: string): boolean {
  return /(^|_)(id|key|token|slug|hash)$/.test(key) || key === 'domain' || key === 'path' || key === 'url'
}

// * Payload values are shallow (strings/numbers/bools; rarely a nested object).
function formatPayloadValue(key: string, value: unknown): { text: string; mono: boolean } {
  // plan ids surface in payloads (plan_id: "solo"). Show the canonical display
  // name, same as the billing card, as plain copy rather than a raw slug.
  if (key === 'plan_id' && typeof value === 'string') {
    return { text: formatPlanName(value), mono: false }
  }
  if (value === null || value === undefined) return { text: 'None', mono: false }
  if (typeof value === 'boolean') return { text: value ? 'Yes' : 'No', mono: false }
  if (typeof value === 'number') return { text: value.toLocaleString(), mono: false }
  // A nested-object payload value is rare, but its dump is a raw JSON blob:
  // that is code by rule 9's own test (meaningful typed into a config file),
  // so it renders mono like any other identifier, not as sans copy.
  if (typeof value === 'object') return { text: JSON.stringify(value), mono: true }
  return { text: String(value), mono: isIdentifierKey(key) }
}

const PAGE_SIZE = 20

// Sentinel for the "no action filter" state. An empty string blanks a Radix
// Select trigger, so we select this explicitly and translate it to '' (= no
// `action` param) at the call site.
const ACTION_FILTER_ALL = 'all'

const AUDIT_LOG_DESCRIPTION =
  'A record of changes made across the workspace: sites, goals, funnels, integrations, members and billing.'

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

  // Whether the FIRST fetch has ever succeeded. Filters live inside the panel
  // that also shows the table, so once there is something to filter the panel
  // (and its filter controls) stays mounted for every later refetch a filter
  // or page change triggers, rather than the whole section unmounting into a
  // skeleton on every interaction, which would drop focus mid-selection and
  // make picking a "from" date and a "to" date in succession unusable.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

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
        setHasLoadedOnce(true)
      })
      .catch((err) => {
        setError(getAuthErrorMessage(err as Error) || 'Try again in a moment.')
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
  // inverted range, which the API answers with zero rows and would otherwise
  // read as a genuine "No activity yet" empty state.
  const invalidRange = Boolean(startDate && endDate && startDate > endDate)
  const filtersActive = Boolean(actionFilter || startDate || endDate)

  const rangeStart = (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)

  // A fetch triggered AFTER the first one has already landed (a filter, a
  // date, a page, or a retry from the banner): the panel and its rows stay
  // mounted (see hasLoadedOnce above), so this is the only signal that a
  // request is in flight. Without it, the previous page's rows keep reading
  // as current for the whole round trip.
  const refetching = hasLoadedOnce && loading

  // Filters: Facet Select + dark-schemed native date inputs (spec §6), the
  // panel's FIRST ROW rather than its header action: in the action slot they
  // pushed the description into a five-line column (staging, 16-09-2026). They
  // stay put across a populated or an empty result, and drop away only
  // alongside the panel itself while the first load or a failed load takes
  // its place.
  const filterToolbar = (
    <div className="flex flex-wrap items-end gap-3 border-b border-border px-5 py-4">
      <div className="space-y-1.5">
        <label htmlFor="audit-action" className="block text-xs font-medium text-muted-foreground">
          Action
        </label>
        <Select
          id="audit-action"
          aria-label="Filter by action"
          // Radix Select renders a blank trigger for an empty value (it reads as
          // "no selection"), so the unfiltered state carries an explicit `all`
          // sentinel, mapped back to '' for the API, and a placeholder as a
          // belt-and-suspenders fallback.
          value={actionFilter || ACTION_FILTER_ALL}
          onChange={(val) => { setActionFilter(val === ACTION_FILTER_ALL ? '' : val); setPage(1) }}
          placeholder="All actions"
          disabled={refetching}
          className="w-52"
          options={[
            { value: ACTION_FILTER_ALL, label: 'All actions' },
            ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="audit-from" className="block text-xs font-medium text-muted-foreground">
          From
        </label>
        <Input
          id="audit-from"
          type="date"
          value={startDate}
          onChange={e => { setStartDate(e.target.value); setPage(1) }}
          disabled={refetching}
          className="w-40 [color-scheme:dark]"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="audit-to" className="block text-xs font-medium text-muted-foreground">
          To
        </label>
        <Input
          id="audit-to"
          type="date"
          value={endDate}
          onChange={e => { setEndDate(e.target.value); setPage(1) }}
          disabled={refetching}
          className="w-40 [color-scheme:dark]"
        />
      </div>
      {filtersActive && (
        <Button
          variant="outline"
          size="sm"
          disabled={refetching}
          onClick={() => { setActionFilter(''); setStartDate(''); setEndDate(''); setPage(1) }}
        >
          Clear
        </Button>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      {invalidRange && (
        <Banner tone="warning" title="Start date is after end date." />
      )}

      {!hasLoadedOnce && error ? (
        <SettingsErrorState
          variant="card"
          title="Couldn't load the audit log"
          message={error}
          onRetry={handleRetry}
        />
      ) : !hasLoadedOnce && loading ? (
        <SettingsLoadingState rows={6} />
      ) : (
        <SettingsPanel title="Audit log" description={AUDIT_LOG_DESCRIPTION}>
          {filterToolbar}
          {error ? (
            <div className="px-5 py-4">
              {/* No title slot on the banner variant, so the message itself
                  names the failure (spec §10). A later refetch failing keeps
                  the panel and its filters in place; only a first-ever load
                  fails full-page above. */}
              <SettingsErrorState
                variant="banner"
                message={`Couldn't load the audit log. ${error}`}
                onRetry={handleRetry}
              />
            </div>
          ) : entries.length === 0 ? (
            <EmptyRow
              icon={<ListChecks weight="regular" />}
              title="No activity yet"
              caption="Workspace actions like site changes and member updates will appear here as they happen."
            />
          ) : (
            <div
              aria-busy={refetching || undefined}
              className={cn(
                // A refetch (filter, date, page, or a retry) keeps the previous
                // page's rows mounted so focus and scroll position survive it
                // (see hasLoadedOnce); dimming them and shutting off pointer
                // events is what stops that stale page from reading as current
                // for the whole round trip (spec §10/§13).
                refetching && 'pointer-events-none opacity-60 transition-opacity duration-fast ease-apple motion-reduce:transition-none',
              )}
            >
              <Table aria-label="Audit log" containerClassName="border-0">
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
                    const label = ACTION_LABELS[entry.action] || humanizeAction(entry.action)
                    return (
                      <Fragment key={entry.id}>
                        <TR>
                          <TD className="w-8">
                            {hasPayload && (
                              // The ONE control that expands this row (spec §6/§14):
                              // no click handler on the <TR> beside it.
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => toggleExpanded(entry.id)}
                                aria-expanded={isOpen}
                                aria-controls={`audit-payload-${entry.id}`}
                                aria-label={isOpen ? 'Hide details' : 'Show details'}
                              >
                                {isOpen ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}
                              </Button>
                            )}
                          </TD>
                          <TD className="whitespace-nowrap tabular-nums text-xs text-muted-foreground">
                            {formatDateTimeFull(new Date(entry.occurred_at))}
                          </TD>
                          <TD className="min-w-0 font-medium text-foreground">
                            <span className="block truncate" title={entry.actor_email || 'System'}>
                              {entry.actor_email || 'System'}
                            </span>
                          </TD>
                          <TD title={label}>
                            <StatusChip tone={actionTone(entry.action)}>{label}</StatusChip>
                          </TD>
                        </TR>
                        {hasPayload && isOpen && (
                          <TR>
                            <TD colSpan={4} id={`audit-payload-${entry.id}`} className="bg-muted p-0">
                              <dl className="grid grid-cols-1 gap-x-8 gap-y-2 px-5 py-4 sm:grid-cols-2">
                                {Object.entries(entry.payload!).map(([key, value]) => {
                                  const { text, mono } = formatPayloadValue(key, value)
                                  return (
                                    <div
                                      key={key}
                                      className="flex items-baseline justify-between gap-3 border-b border-border pb-2"
                                    >
                                      <dt className="text-xs text-muted-foreground">{humanizeKey(key)}</dt>
                                      <dd className={cn('text-right text-xs text-foreground', mono && 'font-mono break-all')}>
                                        {text}
                                      </dd>
                                    </div>
                                  )
                                })}
                              </dl>
                            </TD>
                          </TR>
                        )}
                      </Fragment>
                    )
                  })}
                </TBody>
              </Table>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {rangeStart.toLocaleString()} to {rangeEnd.toLocaleString()} of {total.toLocaleString()}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1 || refetching}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={page * PAGE_SIZE >= total || refetching}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </SettingsPanel>
      )}
    </div>
  )
}
