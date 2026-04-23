'use client'

import { useState, useEffect } from 'react'
import { Spinner, Input, Button } from '@ciphera-net/ui'
import { ListChecks } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/lib/auth/context'
import { getAuditLog, type AuditLogEntry } from '@/lib/api/audit'
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
  plan_changed: 'Changed plan',
  subscription_cancelled: 'Cancelled subscription',
  subscription_resumed: 'Resumed subscription',
}

const PAGE_SIZE = 20

export default function WorkspaceAuditTab() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [actionFilter, setActionFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    if (!user?.org_id) return
    setLoading(true)
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
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user?.org_id, page, actionFilter, startDate, endDate])

  if (loading) return <div className="flex items-center justify-center py-12"><Spinner className="w-6 h-6 text-neutral-500" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Audit Log</h3>
        <p className="text-sm text-neutral-400">Track who made changes and when.</p>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Action</label>
          <Input
            value={actionFilter}
            onChange={e => { setActionFilter(e.target.value); setPage(1) }}
            placeholder="e.g. site_created"
            className="w-40"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">From</label>
          <Input
            type="date"
            value={startDate}
            onChange={e => { setStartDate(e.target.value); setPage(1) }}
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">To</label>
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
            <div key={entry.id} className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-neutral-800/40 transition-colors ease-apple">
              <div>
                <p className="text-sm text-white">
                  <span className="font-medium">{entry.actor_email || 'System'}</span>
                  {' '}
                  <span className="text-neutral-400">{ACTION_LABELS[entry.action] || entry.action}</span>
                </p>
                {entry.payload && Object.keys(entry.payload).length > 0 && (
                  <p className="text-xs text-neutral-500 mt-0.5">{JSON.stringify(entry.payload)}</p>
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
