'use client'
import { useState } from 'react'
import { Button, Input } from '@ciphera-net/facet'
import { CheckCircle, XCircle } from '@phosphor-icons/react'
import { Checkbox } from '@/components/ui/checkbox'
import { StatusChip } from '@/components/settings/StatusChip'
import { createWebhook, testWebhook } from '@/lib/api/notifications-webhooks'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const TYPE_OPTIONS = [
  { id: 'billing_', label: 'All billing events' },
  { id: 'security_', label: 'All security events' },
  { id: 'uptime_', label: 'All uptime events' },
  { id: 'site_', label: 'All site events' },
  { id: 'team_', label: 'All team events' },
  { id: 'system_', label: 'All system events' },
]

interface Props {
  onClose: () => void
  onCreated: () => void
}

export default function WebhookFormModal({ onClose, onCreated }: Props) {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ url?: string; types?: string }>({})
  const [err, setErr] = useState<string | null>(null)

  const toggle = (id: string) => {
    setFieldErrors(fe => ({ ...fe, types: undefined }))
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  const handleTest = async () => {
    setTestResult(null); setErr(null)
    if (!url) { setFieldErrors(fe => ({ ...fe, url: 'Enter the webhook URL first.' })); return }
    setFieldErrors(fe => ({ ...fe, url: undefined }))
    setBusy(true)
    try {
      const r = await testWebhook(url)
      if (r.ok) setTestResult({ ok: true, message: `Got ${r.status} from endpoint` })
      else setTestResult({ ok: false, message: `${r.error ?? 'Test failed'} (status ${r.status ?? 'n/a'})` })
    } catch (e) {
      setTestResult({ ok: false, message: (e as Error).message ?? 'Test failed' })
    } finally {
      setBusy(false)
    }
  }

  const handleSave = async () => {
    setErr(null)
    const next: { url?: string; types?: string } = {}
    if (!url) next.url = 'Enter the webhook URL.'
    if (selected.length === 0) next.types = 'Pick at least one event type.'
    setFieldErrors(next)
    if (next.url || next.types) return
    setBusy(true)
    try {
      await createWebhook({ url, label: label || null, subscribed_types: selected })
      onCreated()
      onClose()
    } catch (e) {
      setErr((e as Error).message ?? 'Failed to create webhook')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add webhook</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">URL</label>
            <Input
              type="url"
              value={url}
              onChange={e => { setUrl(e.target.value); setFieldErrors(fe => ({ ...fe, url: undefined })) }}
              placeholder="https://hooks.slack.com/services/..."
              aria-invalid={fieldErrors.url ? true : undefined}
            />
            {fieldErrors.url && <p className="text-xs text-red-400 mt-1">{fieldErrors.url}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Label (optional)</label>
            <Input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. #ops alerts"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-2">Subscribed event types</label>
            <div className="grid grid-cols-2 gap-2">
              {TYPE_OPTIONS.map(t => (
                <Checkbox
                  key={t.id}
                  checked={selected.includes(t.id)}
                  onCheckedChange={() => toggle(t.id)}
                  label={t.label}
                />
              ))}
            </div>
            {fieldErrors.types && <p className="text-xs text-red-400 mt-1">{fieldErrors.types}</p>}
          </div>

          {testResult && (
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip
                tone={testResult.ok ? 'success' : 'danger'}
                icon={testResult.ok
                  ? <CheckCircle size={14} weight="fill" />
                  : <XCircle size={14} weight="fill" />}
              >
                {testResult.ok ? 'Reachable' : 'Failed'}
              </StatusChip>
              <span className="text-xs text-neutral-400">{testResult.message}</span>
            </div>
          )}
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>

        <div className="flex justify-between items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTest}
            disabled={busy || !url}
          >
            Test endpoint
          </Button>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleSave}
              disabled={busy || !url || selected.length === 0}
            >
              {busy ? 'Saving…' : 'Save webhook'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
