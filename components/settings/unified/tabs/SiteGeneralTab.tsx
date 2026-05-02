'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Input, Button, toast, Spinner, CheckIcon, ZapIcon } from '@ciphera-net/ui'
import { useSite } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'
import { useAuth } from '@/lib/auth/context'
import { useUnifiedSettings } from '@/lib/unified-settings-context'
import { DangerZone } from '@/components/settings/unified/DangerZone'
import DeleteSiteModal from '@/components/sites/DeleteSiteModal'
import ResetDataModal from '@/components/settings/unified/ResetDataModal'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'
import VerificationModal from '@/components/sites/VerificationModal'

const ALL_TIMEZONES = (() => {
  try {
    const now = new Date()
    return Intl.supportedValuesOf('timeZone').map(tz => {
      const offset = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'shortOffset',
      }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value ?? ''
      return { value: tz, label: tz.replace(/_/g, ' '), offset }
    })
  } catch {
    // Fallback for older environments
    return [
      { value: 'UTC', label: 'UTC', offset: 'GMT' },
      { value: 'Europe/London', label: 'Europe/London', offset: 'GMT' },
      { value: 'Europe/Brussels', label: 'Europe/Brussels', offset: 'GMT+1' },
      { value: 'America/New_York', label: 'America/New York', offset: 'GMT-5' },
      { value: 'America/Los_Angeles', label: 'America/Los Angeles', offset: 'GMT-8' },
      { value: 'Asia/Tokyo', label: 'Asia/Tokyo', offset: 'GMT+9' },
    ]
  }
})()

function TimezoneCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = search
    ? ALL_TIMEZONES.filter(tz =>
        tz.label.toLowerCase().includes(search.toLowerCase()) ||
        tz.value.toLowerCase().includes(search.toLowerCase()) ||
        tz.offset.toLowerCase().includes(search.toLowerCase())
      )
    : ALL_TIMEZONES

  const selected = ALL_TIMEZONES.find(tz => tz.value === value)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        listRef.current && !listRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={open ? search : (selected ? `${selected.label} (${selected.offset})` : value)}
        onChange={e => { setSearch(e.target.value); if (!open) setOpen(true) }}
        onFocus={() => { setOpen(true); setSearch('') }}
        placeholder="Search timezone..."
        className="w-full h-10 px-4 bg-transparent border border-neutral-800 rounded-lg text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 transition-colors"
      />
      {open && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 shadow-xl shadow-black/30"
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-neutral-500">No timezones found</div>
          ) : (
            filtered.map(tz => (
              <button
                key={tz.value}
                type="button"
                onClick={() => { onChange(tz.value); setOpen(false); setSearch('') }}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-neutral-800 transition-colors flex justify-between items-center ${
                  tz.value === value ? 'text-brand-orange bg-brand-orange/5' : 'text-neutral-300'
                }`}
              >
                <span>{tz.label}</span>
                <span className="text-neutral-500 text-xs">{tz.offset}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function SiteGeneralTab({ siteId, onDirtyChange, onRegisterSave }: { siteId: string; onDirtyChange?: (dirty: boolean) => void; onRegisterSave?: (fn: () => Promise<void>) => void }) {
  const router = useRouter()
  const { user } = useAuth()
  const { closeUnifiedSettings: closeSettings } = useUnifiedSettings()
  const { data: site, mutate } = useSite(siteId)
  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [scriptFeatures, setScriptFeatures] = useState<Record<string, unknown>>({})
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showVerificationModal, setShowVerificationModal] = useState(false)

  const canEdit = user?.role === 'owner' || user?.role === 'admin'
  const initialRef = useRef('')
  const hasInitialized = useRef(false)

  useEffect(() => {
    if (!site || hasInitialized.current) return
    setName(site.name || '')
    setTimezone(site.timezone || 'UTC')
    setScriptFeatures(site.script_features || {})
    initialRef.current = JSON.stringify({ name: site.name || '', timezone: site.timezone || 'UTC', scriptFeatures: JSON.stringify(site.script_features || {}) })
    hasInitialized.current = true
  }, [site])

  // Track dirty state
  useEffect(() => {
    if (!initialRef.current) return
    const current = JSON.stringify({ name, timezone, scriptFeatures: JSON.stringify(scriptFeatures) })
    onDirtyChange?.(current !== initialRef.current)
  }, [name, timezone, scriptFeatures, onDirtyChange])

  const handleSave = useCallback(async () => {
    if (!site) return
    try {
      await updateSite(siteId, { name, timezone, script_features: scriptFeatures })
      await mutate()
      initialRef.current = JSON.stringify({ name, timezone, scriptFeatures: JSON.stringify(scriptFeatures) })
      onDirtyChange?.(false)
      toast.success('Site updated')
    } catch {
      toast.error('Failed to save')
    }
  }, [site, siteId, name, timezone, scriptFeatures, mutate, onDirtyChange])

  useEffect(() => {
    onRegisterSave?.(handleSave)
  }, [handleSave, onRegisterSave])

  const [showResetModal, setShowResetModal] = useState(false)

  if (!site || !hasInitialized.current) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="w-6 h-6 text-neutral-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Site details */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-white mb-1">General Configuration</h3>
          <p className="text-sm text-neutral-400">Update your site details and tracking script.</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">Site Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="My Website" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">Domain</label>
              <Input value={site.domain} disabled className="opacity-60" />
              <p className="text-xs text-neutral-500 mt-1">Cannot be changed.</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5">Timezone</label>
            <TimezoneCombobox value={timezone} onChange={setTimezone} />
          </div>
        </div>
      </div>

      {/* Tracking Script */}
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-white mb-1">Tracking Script</h3>
          <p className="text-sm text-neutral-400">Add this to your website to start tracking visitors. Choose your framework for setup instructions.</p>
        </div>

        <ScriptSetupBlock
          site={{ domain: site.domain, name: site.name, script_features: scriptFeatures }}
          showFrameworkPicker
          className="mb-4"
          onFeaturesChange={(features) => setScriptFeatures(features)}
        />

        {/* Verify Installation */}
        <button
          type="button"
          onClick={() => setShowVerificationModal(true)}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border transition-colors ${
            site.is_verified
              ? 'bg-green-900/10 border-green-900/30 text-green-400'
              : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
          } ease-apple`}
        >
          {site.is_verified ? (
            <>
              <CheckIcon className="w-4 h-4" />
              Verified
            </>
          ) : (
            <>
              <ZapIcon className="w-4 h-4" />
              Verify Installation
            </>
          )}
        </button>
        <p className="text-xs text-neutral-500">
          {site.is_verified ? 'Your site is sending data correctly.' : 'Check if your site is sending data correctly.'}
        </p>
      </div>

      {/* Danger Zone */}
      {canEdit && (
        <DangerZone
          items={[
            {
              title: 'Reset Data',
              description: 'Delete all stats and events. This cannot be undone.',
              buttonLabel: 'Reset Data',
              variant: 'outline',
              onClick: () => setShowResetModal(true),
            },
            {
              title: 'Delete Site',
              description: 'Schedule this site for deletion with a 7-day grace period.',
              buttonLabel: 'Delete Site...',
              variant: 'solid',
              onClick: () => setShowDeleteModal(true),
            },
          ]}
        />
      )}

      <ResetDataModal
        open={showResetModal}
        onClose={() => setShowResetModal(false)}
        onReset={() => mutate()}
        siteDomain={site?.domain || ''}
        siteId={siteId}
      />

      <DeleteSiteModal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onDeleted={() => { router.push('/'); closeSettings(); }}
        siteName={site?.name || ''}
        siteDomain={site?.domain || ''}
        siteId={siteId}
      />

      <VerificationModal
        isOpen={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
        site={site}
        onVerified={() => mutate()}
      />
    </div>
  )
}
