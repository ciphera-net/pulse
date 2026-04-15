'use client'
import { useEffect, useState } from 'react'
import { listWebhooks, deleteWebhook, type Webhook } from '@/lib/api/notifications-webhooks'
import WebhookFormModal from './WebhookFormModal'

export default function WebhooksSection() {
  const [webhooks, setWebhooks] = useState<Webhook[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const load = async () => {
    try {
      const r = await listWebhooks()
      setWebhooks(r.webhooks ?? [])
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load')
    }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this webhook? Future events will not be delivered to this URL.')) return
    try {
      await deleteWebhook(id)
      load()
    } catch (e) {
      setError((e as Error).message ?? 'Delete failed')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          Webhook URLs are stored encrypted at rest. Payload contains event ID and timestamp only — no event content.
        </p>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="px-3 py-1.5 text-sm rounded bg-brand-orange hover:bg-brand-orange/90 text-white"
        >
          Add webhook
        </button>
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}
      {webhooks === null && <div className="text-neutral-500 text-sm">Loading…</div>}
      {webhooks && webhooks.length === 0 && (
        <div className="text-neutral-500 text-sm py-6 text-center border border-white/[0.06] rounded">
          No webhooks configured.
        </div>
      )}
      {webhooks && webhooks.length > 0 && (
        <ul className="space-y-2">
          {webhooks.map(w => (
            <li key={w.id} className="flex items-center justify-between p-3 rounded border border-white/[0.06] bg-white/[0.02]">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white">{w.label || '(no label)'}</p>
                <p className="text-xs text-neutral-500 font-mono truncate">{w.url_masked}</p>
                <p className="text-xs text-neutral-400 mt-1">
                  {w.subscribed_types.join(', ')}
                  {!w.enabled && <span className="ml-2 text-red-400">disabled</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(w.id)}
                className="text-xs text-red-400 hover:underline ml-3"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <WebhookFormModal onClose={() => setShowForm(false)} onCreated={load} />
      )}
    </div>
  )
}
