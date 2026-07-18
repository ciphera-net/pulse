'use client'
import { useEffect, useState } from 'react'
import { Button, Banner } from '@ciphera-net/facet'
import { Plugs } from '@phosphor-icons/react'
import { SettingsPanel, PanelRow, PanelRows, EmptyRow } from '@/components/settings/panels'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { StatusChip } from '@/components/settings/StatusChip'
import { listWebhooks, deleteWebhook, type Webhook } from '@/lib/api/notifications-webhooks'
import WebhookFormModal from './WebhookFormModal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

export default function WebhooksSection() {
  const [webhooks, setWebhooks] = useState<Webhook[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = async () => {
    try {
      const r = await listWebhooks()
      setWebhooks(r.webhooks ?? [])
      setError(null)
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load')
    }
  }

  useEffect(() => { load() }, [])

  const retry = async () => {
    setRetrying(true)
    await load()
    setRetrying(false)
  }

  const handleDelete = (id: string) => {
    setConfirmDeleteId(id)
  }

  const doDelete = async () => {
    if (!confirmDeleteId) return
    try {
      await deleteWebhook(confirmDeleteId)
      await load()
    } catch (e) {
      // Surface the failure instead of silently swallowing it.
      setError((e as Error).message ?? 'Failed to delete webhook')
    }
  }

  // Exact branch parity with the pre-redesign section:
  //  - list renders whenever populated (even alongside an error banner)
  //  - the in-frame empty state only shows when there is no error
  //  - the bare loading skeleton only shows when there is no error
  const showPanel = webhooks !== null && (webhooks.length > 0 || !error)
  const showLoading = webhooks === null && !error

  return (
    <div className="space-y-3">
      {/* Delivery / operation failure surface (load + delete errors). Rendered
          as a persistent danger Banner above the panel; the populated list
          stays visible beneath it, and Retry re-runs the load. */}
      {error && (
        <Banner
          tone="danger"
          title={error}
          action={
            <Button size="sm" variant="secondary" isLoading={retrying} onClick={retry}>
              Retry
            </Button>
          }
        />
      )}

      {showLoading && <SettingsLoadingState rows={2} />}

      {showPanel && (
        <SettingsPanel
          kicker="Webhook destinations"
          description="Webhook URLs are stored encrypted at rest. Payloads contain the event ID and timestamp only — never event content."
          action={
            <Button variant="default" size="sm" onClick={() => setShowForm(true)}>
              Add webhook
            </Button>
          }
        >
          {webhooks!.length === 0 ? (
            <EmptyRow
              icon={<Plugs weight="regular" />}
              title="No webhooks configured"
              caption="Add a webhook to receive event notifications over HTTP."
              action={
                <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
                  Add webhook
                </Button>
              }
            />
          ) : (
            <PanelRows>
              {webhooks!.map(w => (
                <PanelRow
                  key={w.id}
                  label={
                    <span className="flex items-center gap-2">
                      {w.label || '(no label)'}
                      {!w.enabled && <StatusChip tone="neutral">Disabled</StatusChip>}
                    </span>
                  }
                  control={
                    // Row action is ALWAYS visible (no hover-only reveal).
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleDelete(w.id)}
                    >
                      Delete
                    </Button>
                  }
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-muted-foreground">{w.url_masked}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{w.subscribed_types.join(', ')}</p>
                  </div>
                </PanelRow>
              ))}
            </PanelRows>
          )}
        </SettingsPanel>
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
