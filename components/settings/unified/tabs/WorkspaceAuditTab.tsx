'use client'

import { useState, useEffect } from 'react'
import { Spinner } from '@ciphera-net/ui'
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

export default function WorkspaceAuditTab() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.org_id) return
    getAuditLog({ limit: 50 })
      .then(data => setEntries(data.entries))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user?.org_id])

  if (loading) return <div className="flex items-center justify-center py-12"><Spinner className="w-6 h-6 text-neutral-500" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Audit Log</h3>
        <p className="text-sm text-neutral-400">Track who made changes and when.</p>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-8">No activity recorded yet.</p>
      ) : (
        <div className="space-y-0.5">
          {entries.map(entry => (
            <div key={entry.id} className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-neutral-800/20 transition-colors">
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
    </div>
  )
}
