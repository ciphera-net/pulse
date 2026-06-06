'use client'
import { useEffect, useState } from 'react'
import { Button } from '@ciphera-net/ui'
import { Plugs } from '@phosphor-icons/react'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { EmptyState } from '@/components/ui/EmptyState'
import { listWebhooks, deleteWebhook, type Webhook } from '@/lib/api/notifications-webhooks'
import WebhookFormModal from './WebhookFormModal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

export default function WebhooksSection() {
  const [webhooks, setWebhooks] = useState<Webhook[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = async () => {
    try {
      const r = await listWebhooks()
      setWebhooks(r.webhooks ?? [])
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load')
    }
  }

  useEffect(() => { load() }, [])

  const handleDelete = (id: string) => {
    setConfirmDeleteId(id)
  }

  const doDelete = async () => {
    if (!confirmDeleteId) return
    await deleteWebhook(confirmDeleteId)
    load()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          Webhook URLs are stored encrypted at rest. Payload contains event ID and timestamp only — no event content.
        </p>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowForm(true)}
        >
          Add webhook
        </Button>
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}
      {webhooks === null && <SettingsLoadingState />}
      {webhooks && webhooks.length === 0 && (
        <EmptyState
          title="No webhooks configured"
          description="Add a webhook to receive event notifications via HTTP."
          icon={<Plugs weight="regular" />}
          className="py-8"
        />
      )}
      {webhooks && webhooks.length > 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-800/30 divide-y divide-neutral-800">
          {webhooks.map(w => (
            <div key={w.id} className="flex items-center justify-between px-4 py-3 group">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white">{w.label || '(no label)'}</p>
                <p className="text-xs text-neutral-500 font-mono truncate">{w.url_masked}</p>
                <p className="text-xs text-neutral-400 mt-1">
                  {w.subscribed_types.join(', ')}
                  {!w.enabled && <span className="ml-2 text-red-400">disabled</span>}
                </p>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity ease-apple">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-400 ml-3"
                  onClick={() => handleDelete(w.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <WebhookFormModal onClose={() => setShowForm(false)} onCreated={load} />
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null) }}
        title="Delete webhook"
        description="Future events will not be delivered to this URL."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={doDelete}
      />
    </div>
  )
}
