'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Input, Button, Select, toast, Spinner, CheckIcon, ZapIcon, getAuthErrorMessage } from '@ciphera-net/facet'
import { useSite } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'
import { useCan } from '@/lib/auth/permissions'
import { DangerZone } from '@/components/settings/unified/DangerZone'
import DeleteSiteModal from '@/components/sites/DeleteSiteModal'
import ResetDataModal from '@/components/settings/unified/ResetDataModal'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'
import VerificationModal from '@/components/sites/VerificationModal'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'

// Full IANA zone list with each zone's live short-offset, resolved once. Feeds
// the timezone Select; the hand-rolled combobox it replaces is retired (spec §3
// — Facet Select supersedes the bespoke comboboxes across settings).
const TIMEZONE_OPTIONS: { value: string; label: string }[] = (() => {
  const build = (tz: string, offset: string) => ({
    value: tz,
    label: offset ? `${tz.replace(/_/g, ' ')} (${offset})` : tz.replace(/_/g, ' '),
  })
  try {
    const now = new Date()
    return Intl.supportedValuesOf('timeZone').map(tz => {
      const offset = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'shortOffset',
      }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value ?? ''
      return build(tz, offset)
    })
  } catch {
    // Fallback for older environments
    return [
      build('UTC', 'GMT'),
      build('Europe/London', 'GMT'),
      build('Europe/Brussels', 'GMT+1'),
      build('America/New_York', 'GMT-5'),
      build('America/Los_Angeles', 'GMT-8'),
      build('Asia/Tokyo', 'GMT+9'),
    ]
  }
})()

export default function SiteGeneralTab({ siteId }: { siteId: string }) {
  const router = useRouter()
  const { data: site, error, isValidating, mutate } = useSite(siteId)
  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [scriptFeatures, setScriptFeatures] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showVerificationModal, setShowVerificationModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)

  const canEdit = useCan('sites.edit')
  const initialRef = useRef('')
  const hasInitialized = useRef(false)

  // A zone whose value isn't in the resolved list (rare — a backend zone the
  // browser's ICU doesn't know) still needs a legible option so the Select can
  // render its current value rather than falling back to the placeholder.
  const timezoneOptions = useMemo(() => {
    if (timezone && !TIMEZONE_OPTIONS.some(o => o.value === timezone)) {
      return [{ value: timezone, label: timezone.replace(/_/g, ' ') }, ...TIMEZONE_OPTIONS]
    }
    return TIMEZONE_OPTIONS
  }, [timezone])

  useEffect(() => {
    if (!site || hasInitialized.current) return
    setName(site.name || '')
    setTimezone(site.timezone || 'UTC')
    setScriptFeatures(site.script_features || {})
    initialRef.current = JSON.stringify({ name: site.name || '', timezone: site.timezone || 'UTC', scriptFeatures: JSON.stringify(site.script_features || {}) })
    hasInitialized.current = true
  }, [site])

  // Track dirty state
  const isDirty = initialRef.current
    ? JSON.stringify({ name, timezone, scriptFeatures: JSON.stringify(scriptFeatures) }) !== initialRef.current
    : false

  const handleDiscard = () => {
    if (!initialRef.current) return
    const snap = JSON.parse(initialRef.current)
    setName(snap.name)
    setTimezone(snap.timezone)
    setScriptFeatures(JSON.parse(snap.scriptFeatures))
  }

  const handleSave = useCallback(async () => {
    if (!site || saving) return
    setSaving(true)
    try {
      // Partial PUT (B1): only the fields this tab owns — never a full-object
      // resurrection that would clobber server-owned columns.
      await updateSite(siteId, { name, timezone, script_features: scriptFeatures })
      initialRef.current = JSON.stringify({ name, timezone, scriptFeatures: JSON.stringify(scriptFeatures) })
      await mutate()
      toast.success('Site updated')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }, [site, saving, siteId, name, timezone, scriptFeatures, mutate])

  // A permanent fetch failure must not fall through to an infinite spinner —
  // surface it as a distinct, retryable error while there is no data to show.
  if (error && !site) {
    return (
      <SettingsErrorState
        message="We couldn't load this site's settings. It may be a temporary problem."
        onRetry={() => mutate()}
        retrying={isValidating}
      />
    )
  }

  if (!site || !hasInitialized.current) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="w-6 h-6 text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── Site details ─────────────────────────────────────────────────── */}
      <SettingsPanel kicker="Site" description="Core details for this site.">
        <PanelRows>
          <PanelRow label="Name" caption="Shown across Pulse and in reports." htmlFor="site-name">
            <Input
              id="site-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Website"
              disabled={!canEdit || saving}
            />
          </PanelRow>
          <PanelRow label="Domain" caption="Set at creation and can't be changed." htmlFor="site-domain">
            <Input id="site-domain" value={site.domain} disabled className="opacity-60" />
          </PanelRow>
          <PanelRow label="Timezone" caption="Used to bucket stats into local days." htmlFor="site-timezone">
            <Select
              id="site-timezone"
              value={timezone}
              onChange={setTimezone}
              options={timezoneOptions}
              placeholder="Select a timezone…"
              disabled={!canEdit || saving}
              className="w-full"
              aria-label="Timezone"
            />
          </PanelRow>
        </PanelRows>
      </SettingsPanel>

      {/* ── Tracking script ──────────────────────────────────────────────── */}
      <SettingsPanel
        kicker="Tracking script"
        description="Add this to your site to start collecting privacy-first analytics."
      >
        <div className="space-y-5 p-5">
          <ScriptSetupBlock
            site={{ domain: site.domain, name: site.name, script_features: scriptFeatures, detected_framework: site.detected_framework }}
            siteId={siteId}
            showFrameworkPicker
            onFeaturesChange={(features) => setScriptFeatures(features)}
            disabled={!canEdit || saving}
          />

          {/* Verification status + action */}
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
            <StatusChip
              tone={site.is_verified ? 'success' : 'neutral'}
              icon={site.is_verified ? <CheckIcon className="w-3 h-3" /> : undefined}
            >
              {site.is_verified ? 'Verified' : 'Not verified'}
            </StatusChip>
            <span className="text-xs text-muted-foreground">
              {site.is_verified ? 'Your site is sending data correctly.' : 'Check if your site is sending data correctly.'}
            </span>
            <Button variant="secondary" size="sm" className="ml-auto" onClick={() => setShowVerificationModal(true)}>
              <ZapIcon className="w-4 h-4" />
              {site.is_verified ? 'Re-verify' : 'Verify installation'}
            </Button>
          </div>
        </div>
      </SettingsPanel>

      {/* ── Danger zone ──────────────────────────────────────────────────── */}
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
        onDeleted={() => router.push('/')}
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

      {canEdit && (
        <SettingsSaveBar
          isDirty={isDirty}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      )}
    </div>
  )
}
