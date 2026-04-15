'use client'
import { useState } from 'react'
import { createWebhook, testWebhook } from '@/lib/api/notifications-webhooks'

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="max-w-lg w-full mx-4 glass-overlay rounded-xl p-6"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white mb-3">Add webhook</h3>

        <div className="space-y-4 text-sm">
          <div>
            <label className="block text-xs text-neutral-400 mb-1">URL</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-white focus:border-brand-orange focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-400 mb-1">Label (optional)</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. #ops alerts"
              className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-white focus:border-brand-orange focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-400 mb-2">Subscribed event types</label>
            <div className="grid grid-cols-2 gap-2">
              {TYPE_OPTIONS.map(t => (
                <label key={t.id} className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(t.id)}
                    onChange={() => toggle(t.id)}
                    className="accent-brand-orange"
                  />
                  {t.label}
                </label>
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

        <div className="mt-6 flex justify-between items-center">
          <button
            type="button"
            onClick={handleTest}
            disabled={busy || !url}
            className="text-xs text-neutral-400 hover:text-white disabled:opacity-50"
          >
            Test endpoint
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-neutral-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy || !url || selected.length === 0}
              className="px-4 py-2 text-sm rounded bg-brand-orange hover:bg-brand-orange/90 text-white disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save webhook'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
