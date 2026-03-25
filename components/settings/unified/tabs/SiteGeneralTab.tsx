'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Input, Button, Select, toast, Spinner, getAuthErrorMessage, CheckIcon, ZapIcon } from '@ciphera-net/ui'
import { useSite } from '@/lib/swr/dashboard'
import { updateSite, resetSiteData } from '@/lib/api/sites'
import { useAuth } from '@/lib/auth/context'
import { useUnifiedSettings } from '@/lib/unified-settings-context'
import { DangerZone } from '@/components/settings/unified/DangerZone'
import DeleteSiteModal from '@/components/sites/DeleteSiteModal'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'
import VerificationModal from '@/components/sites/VerificationModal'

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

  const handleResetData = async () => {
    if (!confirm('Are you sure you want to delete ALL data for this site? This action cannot be undone.')) return
    try {
      await resetSiteData(siteId)
      toast.success('All site data has been reset')
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || 'Failed to reset site data')
    }
  }

  if (!site) {
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
              ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700'
          }`}
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
              onClick: handleResetData,
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
