'use client'
import { useState } from 'react'
import { Button, Checkbox, Input } from '@ciphera-net/ui'
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
  const [testResult, setTestResult] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const toggle = (id: string) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  const handleTest = async () => {
    setTestResult(null); setErr(null)
    if (!url) { setErr('URL is required'); return }
    setBusy(true)
    try {
      const r = await testWebhook(url)
      if (r.ok) setTestResult(`✓ Got ${r.status} from endpoint`)
      else setTestResult(`✗ ${r.error ?? 'Test failed'} (status ${r.status ?? 'n/a'})`)
    } catch (e) {
      setTestResult(`✗ ${(e as Error).message ?? 'Test failed'}`)
    } finally {
      setBusy(false)
    }
  }

  const handleSave = async () => {
    setErr(null)
    if (!url) { setErr('URL is required'); return }
    if (selected.length === 0) { setErr('Pick at least one event type'); return }
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
            <label className="block text-xs text-neutral-400 mb-1">URL</label>
            <Input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-400 mb-1">Label (optional)</label>
            <Input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. #ops alerts"
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-400 mb-2">Subscribed event types</label>
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
          </div>

          {testResult && (
            <p className={`text-xs ${testResult.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
              {testResult}
            </p>
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
              variant="primary"
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
