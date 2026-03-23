'use client'

import { useState, useEffect } from 'react'
import { Input, Button, Select, toast, Spinner } from '@ciphera-net/ui'
import { Copy, CheckCircle } from '@phosphor-icons/react'
import { useSite } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'

const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'Europe/London (GMT)' },
  { value: 'Europe/Brussels', label: 'Europe/Brussels (CET)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET)' },
  { value: 'Europe/Amsterdam', label: 'Europe/Amsterdam (CET)' },
  { value: 'America/New_York', label: 'America/New York (EST)' },
  { value: 'America/Chicago', label: 'America/Chicago (CST)' },
  { value: 'America/Denver', label: 'America/Denver (MST)' },
  { value: 'America/Los_Angeles', label: 'America/Los Angeles (PST)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (CST)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST)' },
]

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003'

export default function SiteGeneralTab({ siteId }: { siteId: string }) {
  const { data: site, mutate } = useSite(siteId)
  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (site) {
      setName(site.name || '')
      setTimezone(site.timezone || 'UTC')
    }
  }, [site])

  const handleSave = async () => {
    if (!site) return
    setSaving(true)
    try {
      await updateSite(siteId, { name, timezone })
      await mutate()
      toast.success('Site updated')
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const trackingScript = `<script defer data-domain="${site?.domain || ''}" data-api="${API_URL}" src="${APP_URL}/script.js"></script>`
  const frustrationScript = `<script defer src="${APP_URL}/script.frustration.js"></script>`

  const copyScript = () => {
    navigator.clipboard.writeText(trackingScript + '\n' + frustrationScript)
    setCopied(true)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  if (!site) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="w-6 h-6 text-neutral-500" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Site details */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-white mb-1">General Configuration</h3>
          <p className="text-sm text-neutral-400">Update your site details and tracking script.</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5">Site Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="My Website" />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5">Timezone</label>
            <Select
              value={timezone}
              onChange={setTimezone}
              variant="input"
              options={TIMEZONES.map(tz => ({ value: tz.value, label: tz.label }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5">Domain</label>
            <Input value={site.domain} disabled className="opacity-60" />
            <p className="text-xs text-neutral-500 mt-1">Domain cannot be changed after creation.</p>
          </div>
        </div>
      </div>

      {/* Tracking Script */}
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-white mb-1">Tracking Script</h3>
          <p className="text-sm text-neutral-400">Add this to your website to start tracking visitors.</p>
        </div>

        <div className="relative rounded-xl bg-neutral-950 border border-neutral-800 p-4 overflow-x-auto">
          <pre className="text-xs text-neutral-300 font-mono leading-relaxed whitespace-pre-wrap break-all pr-16">
            {trackingScript}{'\n'}{frustrationScript}
          </pre>
          <button
            onClick={copyScript}
            className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20 transition-colors"
          >
            {copied ? <CheckCircle weight="bold" className="w-3.5 h-3.5" /> : <Copy weight="bold" className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} variant="primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}
