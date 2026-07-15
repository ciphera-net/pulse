'use client'

import { useState, useEffect } from 'react'
import { Spinner, Input, Button, getAuthErrorMessage } from '@ciphera-net/facet'
import Select from '@/components/ui/select'
import { ListChecks } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/lib/auth/context'
import { useCan } from '@/lib/auth/permissions'
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

// * Payload values are shallow (strings/numbers/bools; rarely a nested object).
function formatPayloadValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const PAGE_SIZE = 20

export default function WorkspaceAuditTab() {
  const { user } = useAuth()
  const canView = useCan('audit.view')
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [actionFilter, setActionFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

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

  if (error) {
    return (
      <div className="rounded-none border border-red-900/50 bg-red-950/20 p-6 text-center">
        <p className="text-red-400 text-sm mb-4">{error}</p>
        <Button variant="secondary" onClick={() => { setError(null); setRetryCount(c => c + 1) }}>Retry</Button>
      </div>
    )
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Spinner className="w-6 h-6 text-neutral-500" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Audit Log</h3>
        <p className="text-sm text-neutral-400">Track who made changes and when.</p>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-1">Action</label>
          <Select
            variant="input"
            value={actionFilter}
            onChange={(val) => { setActionFilter(val); setPage(1) }}
            options={[
              { value: '', label: 'All actions' },
              ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })),
            ]}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-1">From</label>
          <Input
            type="date"
            value={startDate}
            onChange={e => { setStartDate(e.target.value); setPage(1) }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-1">To</label>
          <Input
            type="date"
            value={endDate}
            onChange={e => { setEndDate(e.target.value); setPage(1) }}
          />
        </div>
        {(actionFilter || startDate || endDate) && (
          <Button
            variant="secondary"
            className="text-sm"
            onClick={() => { setActionFilter(''); setStartDate(''); setEndDate(''); setPage(1) }}
          >
            Clear
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Workspace actions like site changes and member updates will appear here as they happen."
          icon={<ListChecks weight="regular" />}
          className="py-8"
        />
      ) : (
        <div className="space-y-1">
          {entries.map(entry => (
            <div key={entry.id} className="flex items-center justify-between px-4 py-3 rounded-none hover:bg-neutral-800/40 transition-colors ease-apple">
              <div>
                <p className="text-sm text-white">
                  <span className="font-medium">{entry.actor_email || 'System'}</span>
                  {' '}
                  <span className="text-neutral-400">{ACTION_LABELS[entry.action] || humanizeAction(entry.action)}</span>
                </p>
                {entry.payload && Object.keys(entry.payload).length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {Object.entries(entry.payload).map(([key, value]) => (
                      <span key={key} className="text-xs text-neutral-500">
                        <span className="text-neutral-600">{key.replace(/_/g, ' ')}:</span>{' '}
                        {/* plan ids surface in payloads (plan_id: "solo") — show the
                            canonical display name, same as the billing card */}
                        {key === 'plan_id' && typeof value === 'string'
                          ? formatPlanName(value)
                          : formatPayloadValue(value)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-neutral-500 shrink-0 ml-4">
                {formatDateTimeShort(new Date(entry.occurred_at))}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-6 border-t border-neutral-800">
        <span className="text-xs text-neutral-500">
          {total > 0 ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}` : 'No entries'}
        </span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="text-sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            className="text-sm"
            onClick={() => setPage(p => p + 1)}
            disabled={page * PAGE_SIZE >= total}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
