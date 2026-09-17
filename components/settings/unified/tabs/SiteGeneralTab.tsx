'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Input, Select, toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { useSite, useInstallStatus } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'
import { useCan } from '@/lib/auth/permissions'
import { DangerZone } from '@/components/settings/unified/DangerZone'
import DeleteSiteModal from '@/components/sites/DeleteSiteModal'
import ResetDataModal from '@/components/settings/unified/ResetDataModal'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'
import { displayDomain } from '@/lib/utils/displayDomain'

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
  const [showResetModal, setShowResetModal] = useState(false)

  const canEdit = useCan('sites.edit')

  // The tab's one status object, read straight off the server's install_status
  // enum (no client-side recency math) and shared with ScriptSetupBlock's own
  // read of the same SWR key, so the header chip and the block can never
  // report different things.
  //
  // Deliberately NOT the band's SiteStatusChip (deleted with the band): it gated
  // on `site.is_verified` first, which is exactly the signal this tab used to
  // show as a second, disagreeing row ("Active" in the block, "Not verified"
  // beside it) before the backend started auto-verifying on the first event.
  // install_status is the source of truth post-fix; see sharedRequests.
  const { data: installData } = useInstallStatus(siteId, { poll: true })
  const installStatus = installData?.install_status
  const installTone = installStatus === 'active' ? 'success' : installStatus === 'stalled' ? 'warning' : 'neutral'
  const installLabel =
    installStatus === 'active' ? 'Receiving data'
      : installStatus === 'stalled' ? 'No recent data'
        : 'No data yet'

  // Baseline snapshot is STATE, not a ref: committing it (after save/load)
  // must re-render so isDirty clears and the beforeunload guard disarms —
  // the old ref version kept the save bar dirty after a successful save.
  const [baseline, setBaseline] = useState('')
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
    setBaseline(JSON.stringify({ name: site.name || '', timezone: site.timezone || 'UTC', scriptFeatures: JSON.stringify(site.script_features || {}) }))
    hasInitialized.current = true
  }, [site])

  // Track dirty state
  const isDirty = baseline
    ? JSON.stringify({ name, timezone, scriptFeatures: JSON.stringify(scriptFeatures) }) !== baseline
    : false

  const handleDiscard = () => {
    if (!baseline) return
    const snap = JSON.parse(baseline)
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
      setBaseline(JSON.stringify({ name, timezone, scriptFeatures: JSON.stringify(scriptFeatures) }))
      await mutate()
      toast.success('Site updated')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || "Couldn't save your changes. Try again in a moment.")
    } finally {
      setSaving(false)
    }
  }, [site, saving, siteId, name, timezone, scriptFeatures, mutate])

  // A permanent fetch failure must not fall through to an infinite spinner —
  // surface it as a distinct, retryable error while there is no data to show.
  if (error && !site) {
    return (
      <SettingsErrorState
        title="Couldn't load this site"
        message="This is usually temporary. Try again in a moment."
        onRetry={() => mutate()}
        retrying={isValidating}
      />
    )
  }

  if (!site || !hasInitialized.current) {
    return <SettingsLoadingState rows={3} />
  }

  return (
    <div className="space-y-8">
      {/* ── Site details ─────────────────────────────────────────────────── */}
      <SettingsPanel
        title="Site"
        description="Core details for this site."
        action={
          <StatusChip tone={installTone} dot>
            {installLabel}
          </StatusChip>
        }
      >
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
            <Input id="site-domain" value={displayDomain(site)} disabled />
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
      {/* No action chip here: the Site panel above is the one place this tab
          reports the data state, so there is exactly one answer to "is this
          site receiving data" on the page, not a second one repeating it. */}
      <SettingsPanel
        title="Tracking script"
        description="Add this to your site to start collecting privacy-first analytics."
      >
        <div className="p-5">
          <ScriptSetupBlock
            site={{ domain: site.domain, name: site.name, script_features: scriptFeatures, detected_framework: site.detected_framework }}
            siteId={siteId}
            showFrameworkPicker
            embedded
            onFeaturesChange={(features) =>
              // Merge, never replace: the block emits only the keys it still
              // owns (scroll/outbound/downloads/sri), and a plain replace would
              // destroy legacy keys (storage/ttl) on the first save — the
              // stored-but-unread contract of the visitor-recognition removal.
              setScriptFeatures((prev) => ({ ...prev, ...features }))
            }
            onFrameworkPersisted={() => mutate()}
            disabled={!canEdit || saving}
          />
        </div>
      </SettingsPanel>

      {/* ── Danger zone ──────────────────────────────────────────────────── */}
      {canEdit && (
        <DangerZone
          items={[
            {
              title: 'Reset data',
              description: 'Delete all stats and events. This cannot be undone.',
              buttonLabel: 'Reset data',
              variant: 'outline',
              onClick: () => setShowResetModal(true),
            },
            {
              title: 'Delete site',
              description: 'Schedule this site for deletion with a 7-day grace period.',
              buttonLabel: 'Delete site',
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
