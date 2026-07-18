'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Toggle,
  Button,
  toast,
  Spinner,
  Select,
  RailGrid,
  RailGridTile,
  getAuthErrorMessage,
} from '@ciphera-net/facet'
import { ShieldCheck, Warning, MagnifyingGlass, ArrowsClockwise } from '@phosphor-icons/react'
import {
  getPrivacyScanConfig,
  updatePrivacyScanConfig,
  triggerPrivacyScan,
  getLatestPrivacyScan,
  type PrivacyScanResult,
  type SecurityHeaders,
} from '@/lib/api/privacy'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils/formatDate'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import { StatusChip, type ChipTone } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { SettingsPanel, PanelRows, PanelRow, EmptyRow } from '@/components/settings/panels'
import { useCan } from '@/lib/auth/permissions'

const SCAN_COOLDOWN_SECONDS = 300
const SCAN_POLL_INTERVAL_MS = 10_000
const SCAN_POLL_MAX_ATTEMPTS = 6

const HEADER_CHECKS: { key: keyof SecurityHeaders; label: string }[] = [
  { key: 'hsts', label: 'Strict-Transport-Security' },
  { key: 'x_content_type', label: 'X-Content-Type-Options' },
  { key: 'x_frame_options', label: 'X-Frame-Options' },
  { key: 'csp', label: 'Content-Security-Policy' },
  { key: 'referrer_policy', label: 'Referrer-Policy' },
  { key: 'permissions_policy', label: 'Permissions-Policy' },
]

function categoryTone(category: string): ChipTone {
  switch (category) {
    case 'analytics':
      return 'info'
    case 'advertising':
      return 'danger'
    case 'social':
      return 'purple'
    default:
      return 'neutral'
  }
}

// A privacy score is genuine signal (spec §2.3 permits success/danger for real
// signal, never decoration): green above 80, amber 50–79, coral below.
function scoreBand(score: number): { tone: ChipTone; color: string; grade: string } {
  if (score >= 80) return { tone: 'success', color: 'text-emerald-400', grade: 'Good' }
  if (score >= 50) return { tone: 'warning', color: 'text-amber-400', grade: 'Fair' }
  return { tone: 'danger', color: 'text-destructive', grade: 'Poor' }
}

/** A bare stat tile for the results RailGrid — mono numeral + micro-label caps. */
function StatTile({ label, value, valueClassName, chip }: {
  label: string
  value: React.ReactNode
  valueClassName?: string
  chip?: React.ReactNode
}) {
  return (
    <RailGridTile>
      <p className="font-mono text-micro-label uppercase text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={cn('font-mono text-3xl font-semibold tabular-nums text-foreground', valueClassName)}>
          {value}
        </span>
        {chip}
      </div>
    </RailGridTile>
  )
}

export default function SitePrivacyScanTab({ siteId }: { siteId: string }) {
  const canManage = useCan('privacy_scan.manage')
  const [enabled, setEnabled] = useState(false)
  const [frequency, setFrequency] = useState('weekly')
  const [configLoaded, setConfigLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [lastScan, setLastScan] = useState<PrivacyScanResult | null>(null)
  const [polling, setPolling] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const initialRef = useRef('')
  const hasInitialized = useRef(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)

  // Load config + latest scan result. Extracted so Retry can re-run it — the
  // previous inline effect's retry only cleared `error` and never re-fetched,
  // leaving the tab stuck on the spinner.
  const loadData = useCallback(async () => {
    try {
      const [config, scan] = await Promise.all([
        getPrivacyScanConfig(siteId),
        getLatestPrivacyScan(siteId),
      ])

      const resolvedEnabled = config?.enabled ?? false
      const resolvedFrequency = config?.frequency ?? 'weekly'

      setEnabled(resolvedEnabled)
      setFrequency(resolvedFrequency)
      setLastScan(scan)

      initialRef.current = JSON.stringify({ enabled: resolvedEnabled, frequency: resolvedFrequency })
      setError(null)
      setConfigLoaded(true)
    } catch (err) {
      setError(getAuthErrorMessage(err))
    }
  }, [siteId])

  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true
    loadData()
  }, [loadData])

  const handleRetry = useCallback(async () => {
    setRetrying(true)
    await loadData()
    setRetrying(false)
  }, [loadData])

  // Track dirty state
  const isDirty = initialRef.current
    ? JSON.stringify({ enabled, frequency }) !== initialRef.current
    : false

  const handleDiscard = () => {
    if (!initialRef.current) return
    const snap = JSON.parse(initialRef.current)
    setEnabled(snap.enabled)
    setFrequency(snap.frequency)
  }

  const handleSave = useCallback(async () => {
    try {
      await updatePrivacyScanConfig(siteId, enabled, frequency)
      initialRef.current = JSON.stringify({ enabled, frequency })
      toast.success('Privacy scan settings updated')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to save settings')
    }
  }, [siteId, enabled, frequency])

  // Cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return
    const interval = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [cooldown])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    pollCountRef.current = 0
    setPolling(false)
  }, [])

  const handleScan = useCallback(async () => {
    setScanning(true)
    try {
      await triggerPrivacyScan(siteId)
      toast.success('Privacy scan triggered — results will appear shortly')
      setCooldown(SCAN_COOLDOWN_SECONDS)

      // Scans run async on the backend, so the freshly-triggered result isn't
      // ready yet. Poll a bounded number of times (cleared on unmount / when a
      // new result lands) so it appears without leaving and returning.
      const baselineId = lastScan?.id ?? null
      stopPolling()
      pollCountRef.current = 0
      setPolling(true)
      pollRef.current = setInterval(async () => {
        pollCountRef.current += 1
        const scan = await getLatestPrivacyScan(siteId)
        if (scan && scan.id !== baselineId) {
          setLastScan(scan)
          toast.success('Scan results updated')
          stopPolling()
        } else if (pollCountRef.current >= SCAN_POLL_MAX_ATTEMPTS) {
          stopPolling()
        }
      }, SCAN_POLL_INTERVAL_MS)
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to trigger scan')
    } finally {
      setScanning(false)
    }
  }, [siteId, lastScan, stopPolling])

  // Manual "Refresh results" affordance — a plain re-fetch of the latest scan.
  const handleRefreshResults = useCallback(async () => {
    setRefreshing(true)
    try {
      const scan = await getLatestPrivacyScan(siteId)
      if (scan) setLastScan(scan)
    } finally {
      setRefreshing(false)
    }
  }, [siteId])

  // Clear any in-flight poll on unmount.
  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
  }, [])

  if (error) {
    return (
      <SettingsErrorState
        variant="card"
        message={error}
        onRetry={handleRetry}
        retrying={retrying}
      />
    )
  }

  if (!configLoaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="w-6 h-6 text-muted-foreground" />
      </div>
    )
  }

  const scripts = lastScan?.third_party_scripts ?? []
  const cookies = lastScan?.cookies ?? []
  const headers = lastScan?.security_headers ?? ({} as SecurityHeaders)
  const score = lastScan?.privacy_score ?? 0
  const band = scoreBand(score)
  const headersPassed = HEADER_CHECKS.filter(h => headers[h.key]).length

  // Scan controls (spec §6): "Scan Now" is an OUTLINE button with cooldown —
  // deliberately not the page's solid-orange, plus a ghost manual refresh.
  const scanControls = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleScan}
        disabled={!canManage || scanning || cooldown > 0}
        className="gap-1.5"
      >
        {scanning ? (
          <><Spinner className="h-4 w-4" /> Scanning…</>
        ) : cooldown > 0 ? (
          `Wait ${cooldown}s`
        ) : (
          <><MagnifyingGlass weight="bold" className="h-4 w-4" /> Scan now</>
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRefreshResults}
        disabled={polling || refreshing}
        className="gap-1.5"
      >
        {polling ? (
          <><Spinner className="h-4 w-4" /> Checking…</>
        ) : refreshing ? (
          <><Spinner className="h-4 w-4" /> Refreshing…</>
        ) : (
          <><ArrowsClockwise weight="bold" className="h-4 w-4" /> Refresh</>
        )}
      </Button>
    </div>
  )

  return (
    <div className="space-y-8">
      {/* Configuration — one panel of ruled property rows (spec §6). */}
      <SettingsPanel
        kicker="Privacy scanner"
        description="Scan your site for third-party trackers, cookies, and security headers."
        action={scanControls}
      >
        <PanelRows>
          <PanelRow
            label="Automatic scanning"
            caption="Automatically scan for trackers and security issues"
            control={
              <Toggle checked={enabled} onChange={() => setEnabled(v => !v)} disabled={!canManage} />
            }
          />
          {enabled && (
            <PanelRow
              label="Scan frequency"
              caption="How often to check for privacy issues"
              control={
                <Select
                  aria-label="Scan frequency"
                  value={frequency}
                  onChange={setFrequency}
                  disabled={!canManage}
                  size="sm"
                  className="w-40"
                  options={[
                    { value: 'daily', label: 'Daily' },
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'monthly', label: 'Monthly' },
                  ]}
                />
              }
            />
          )}
        </PanelRows>
      </SettingsPanel>

      {/* Results */}
      {lastScan ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <p className="font-mono text-micro-label uppercase text-muted-foreground">Latest results</p>
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              Scanned {formatRelativeTime(lastScan.scanned_at)}
            </p>
          </div>

          {/* Score + headline counts as stat tiles */}
          <RailGrid minTileWidth={150}>
            <StatTile
              label="Privacy score"
              value={score}
              valueClassName={band.color}
              chip={<StatusChip tone={band.tone}>{band.grade}</StatusChip>}
            />
            <StatTile label="Trackers" value={scripts.length} />
            <StatTile label="Cookies" value={cookies.length} />
            <StatTile label="Headers passed" value={`${headersPassed}/${HEADER_CHECKS.length}`} />
          </RailGrid>

          {/* Security headers — ruled checklist rows */}
          <SettingsPanel kicker="Security headers">
            <PanelRows>
              {HEADER_CHECKS.map(h => (
                <PanelRow
                  key={h.key}
                  label={<span className="font-mono text-xs text-foreground">{h.label}</span>}
                  control={
                    headers[h.key]
                      ? <StatusChip tone="success">Present</StatusChip>
                      : <StatusChip tone="danger">Missing</StatusChip>
                  }
                />
              ))}
            </PanelRows>
          </SettingsPanel>

          {/* Third-party scripts */}
          <SettingsPanel kicker="Third-party scripts" description={`${scripts.length} detected`}>
            {scripts.length === 0 ? (
              <EmptyRow
                icon={<ShieldCheck weight="regular" />}
                title="No third-party scripts detected"
                caption="This site loads no external tracking scripts."
              />
            ) : (
              <PanelRows>
                {scripts.map(s => (
                  <PanelRow
                    key={s.host}
                    label={<span className="break-all font-mono text-xs text-foreground">{s.host}</span>}
                    control={<StatusChip tone={categoryTone(s.category)}>{s.category}</StatusChip>}
                  />
                ))}
              </PanelRows>
            )}
          </SettingsPanel>

          {/* Cookies */}
          {cookies.length > 0 && (
            <SettingsPanel kicker="Cookies" description={`${cookies.length} set`}>
              <PanelRows>
                {cookies.map(c => (
                  <PanelRow
                    key={`${c.name}-${c.domain}`}
                    label={<span className="font-mono text-xs text-foreground">{c.name}</span>}
                    caption={c.domain}
                    control={
                      <div className="flex items-center gap-2">
                        {c.secure && <StatusChip tone="success">Secure</StatusChip>}
                        {c.http_only && <StatusChip tone="info">HttpOnly</StatusChip>}
                      </div>
                    }
                  />
                ))}
              </PanelRows>
            </SettingsPanel>
          )}

          {/* Issues */}
          {lastScan.issues && lastScan.issues.length > 0 && (
            <SettingsPanel kicker="Issues" description={`${lastScan.issues.length} to review`}>
              <PanelRows>
                {lastScan.issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                    <Warning weight="fill" className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    <span className="text-sm text-muted-foreground">{issue}</span>
                  </div>
                ))}
              </PanelRows>
            </SettingsPanel>
          )}
        </div>
      ) : (
        <SettingsPanel kicker="Results">
          <EmptyRow
            icon={<ShieldCheck weight="regular" />}
            title="No scan results yet"
            caption="Run a scan to check this site for trackers, cookies and security headers."
            action={
              canManage ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleScan}
                  disabled={scanning || cooldown > 0}
                  className="gap-1.5"
                >
                  {scanning ? (
                    <><Spinner className="h-4 w-4" /> Scanning…</>
                  ) : cooldown > 0 ? (
                    `Wait ${cooldown}s`
                  ) : (
                    <><MagnifyingGlass weight="bold" className="h-4 w-4" /> Scan now</>
                  )}
                </Button>
              ) : undefined
            }
          />
        </SettingsPanel>
      )}

      {canManage && (
        <SettingsSaveBar
          isDirty={isDirty}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      )}
    </div>
  )
}
