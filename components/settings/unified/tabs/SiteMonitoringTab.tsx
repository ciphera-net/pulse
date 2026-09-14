'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button, toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { Heartbeat } from '@phosphor-icons/react'
import { useSite, useUptimeStatus, useUptimeIncidents, useInstallStatus } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'
import type { UptimeMonitor } from '@/lib/api/uptime'
import type { InstallStatusResponse } from '@/lib/api/sites'
import { useCan } from '@/lib/auth/permissions'
import { zoneDayKey } from '@/lib/utils/siteTime'
import { formatRelativeTime } from '@/lib/utils/formatDate'
import { fmtMs, fmtUptimePct } from '@/components/uptime/uptimeMetrics'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { StatusChip, type ChipTone } from '@/components/settings/StatusChip'
import { SettingsPanel, PanelRow, PanelRows, EmptyRow } from '@/components/settings/panels'

/**
 * Site → Monitoring (design: Pulse/docs/plans/14-09-2026-site-watcher-design.md
 * §11a/§11b; owner chose direction B, "grouped by question", 14-09-2026).
 *
 * Phase 1a renders ONLY what has real data behind it, and the rule that shaped
 * it is worth stating where the next person will read it: A CONTROL THAT
 * CONTROLS NOTHING IS NOT RENDERED. Hence —
 *
 *   AVAILABILITY  the site's ONE uptime monitor (Pulse auto-creates exactly one
 *                 when uptime_enabled flips on — there is no "add a monitor"
 *                 anywhere in the API), its live status, this month's uptime
 *                 and incident count, and the enable/disable action.
 *   TRACKING      install health, read from GET /sites/:id/install-status. No
 *                 switch: no per-site setting exists for it yet, and the alarm
 *                 producer (Phase 1b) is gated estate-wide, so a toggle here
 *                 would look like a control and do nothing.
 *
 * Not here yet, by measurement rather than omission: "Rejected events" (the
 * drop ledger is operator-only by ruling until Phase 2's redacted endpoint) and
 * the whole TRAFFIC panel (its types were retired 18-08-2026 and are
 * unemittable; they return under new keys in Phases 3–5).
 *
 * Permissions: the tab is visible to every member (no SITE_TAB_PERMISSIONS
 * entry, like Bot & Spam). The one mutation is PUT /sites/:id {uptime_enabled},
 * whose route gate is sites.edit with an in-handler uptime.manage check — the
 * UI gates on uptime.manage and SHOWS a refusal rather than swallowing it.
 */
export default function SiteMonitoringTab({ siteId }: { siteId: string }) {
  const canManageUptime = useCan('uptime.manage')
  const { data: site, error: siteError, mutate: mutateSite } = useSite(siteId)
  const [toggling, setToggling] = useState(false)
  const [retrying, setRetrying] = useState(false)

  // "This month" is the SITE's calendar month, never the viewer's — the
  // estate's standing rule since the 22-08-2026 site-timezone alignment.
  // The hooks null-key on an empty range, which is how the two uptime reads
  // stay off while monitoring is disabled.
  const uptimeOn = site?.uptime_enabled === true
  const today = site ? zoneDayKey(new Date(), site.timezone) : ''
  const monthStart = today ? today.slice(0, 8) + '01' : ''
  const {
    data: uptime,
    error: uptimeError,
    mutate: mutateUptime,
  } = useUptimeStatus(siteId, uptimeOn ? monthStart : undefined, uptimeOn ? today : undefined)
  const { data: incidents } = useUptimeIncidents(siteId, uptimeOn ? monthStart : '', uptimeOn ? today : '')
  const { data: install, error: installError } = useInstallStatus(siteId)

  const toggleUptime = async (enabled: boolean) => {
    if (!site) return
    setToggling(true)
    try {
      // The same field set the uptime page sends: the route is a whole-site
      // PUT, and omitting `name` is a 400.
      await updateSite(site.id, {
        name: site.name,
        timezone: site.timezone,
        is_public: site.is_public,
        excluded_paths: site.excluded_paths,
        uptime_enabled: enabled,
      })
      await mutateSite()
      await mutateUptime()
      toast.success(enabled ? 'Uptime monitoring enabled' : 'Uptime monitoring disabled')
    } catch (err) {
      // A 403 here is real — sites.edit is the route gate even when
      // uptime.manage is held — and it is shown, not swallowed.
      toast.error(getAuthErrorMessage(err as Error) || "Couldn't update uptime monitoring")
    } finally {
      setToggling(false)
    }
  }

  const retry = async () => {
    setRetrying(true)
    await mutateSite()
    setRetrying(false)
  }

  if (siteError) {
    return (
      <SettingsErrorState
        title="Couldn't load this site"
        message={getAuthErrorMessage(siteError as Error) || undefined}
        onRetry={retry}
        retrying={retrying}
      />
    )
  }
  if (!site) return <SettingsLoadingState rows={3} />

  const monitor: UptimeMonitor | null = uptime?.monitors?.[0]?.monitor ?? null
  const monthUptime = uptime?.monitors?.[0]?.overall_uptime ?? null
  const incidentCount = incidents ? incidents.incidents.length : null

  return (
    <div className="space-y-8">
      {/* ── Availability — is the site reachable? ─────────────────────── */}
      <SettingsPanel
        kicker="Availability"
        description="Is the site reachable?"
        action={
          uptimeOn && canManageUptime ? (
            <Button variant="secondary" size="sm" onClick={() => toggleUptime(false)} disabled={toggling}>
              {toggling ? 'Disabling…' : 'Disable monitoring'}
            </Button>
          ) : undefined
        }
      >
        {!uptimeOn ? (
          <EmptyRow
            icon={<Heartbeat weight="regular" />}
            title="Uptime monitoring is off"
            caption={
              <>
                Check <span className="font-mono">https://{site.domain}</span> every 5 minutes — availability,
                response time and incident history, with alerts by email and in the dashboard.
              </>
            }
            action={
              canManageUptime ? (
                <Button variant="secondary" size="sm" onClick={() => toggleUptime(true)} disabled={toggling}>
                  {toggling ? 'Enabling…' : 'Enable uptime monitoring'}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">An owner or admin can enable it.</p>
              )
            }
          />
        ) : uptimeError ? (
          <div className="px-5 py-4">
            <SettingsErrorState
              variant="banner"
              message="Couldn't load the monitor's status. This is usually temporary — monitoring itself isn't affected."
              onRetry={() => { void mutateUptime() }}
            />
          </div>
        ) : !uptime ? (
          <SettingsLoadingState rows={1} />
        ) : !monitor ? (
          // Transient: the monitor is created inside the same PUT that enabled
          // monitoring, so this is a race with the status read, not a state.
          <PanelRows>
            <PanelRow label="Monitor" caption="Preparing the monitor…">
              <span className="text-sm text-muted-foreground">—</span>
            </PanelRow>
          </PanelRows>
        ) : (
          <PanelRows>
            <PanelRow
              label={<span className="font-mono">{monitor.url}</span>}
              caption={`${monitor.url.startsWith('https://') ? 'HTTPS' : 'HTTP'} · every ${Math.round(monitor.check_interval_seconds / 60)} min`}
              control={
                <Link href={`/sites/${siteId}/uptime`} className="text-sm font-medium text-primary">
                  View uptime →
                </Link>
              }
            >
              <MonitorValue monitor={monitor} monthUptime={monthUptime} incidentCount={incidentCount} />
            </PanelRow>
          </PanelRows>
        )}
      </SettingsPanel>

      {/* ── Tracking — is data arriving? ──────────────────────────────── */}
      <SettingsPanel kicker="Tracking" description="Is data arriving?">
        <PanelRows>
          <PanelRow label="Install health" caption="Whether the tracking script is still sending events.">
            <InstallValue install={install} failed={Boolean(installError)} />
          </PanelRow>
        </PanelRows>
        {/* The tab SHOWS the delivery route and links to it; it never edits
            it. Delivery is a person's choice, per category, and lives in
            Notifications — a second writer here would be a second source of
            truth. */}
        <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-3.5">
          <p className="text-xs text-muted-foreground">
            Uptime alerts arrive in-app and by email — the Monitoring category in your notification settings.
          </p>
          <Link href="/settings/account/notifications" className="shrink-0 text-sm font-medium text-primary">
            Notification settings →
          </Link>
        </div>
      </SettingsPanel>
    </div>
  )
}

// ─── Value cells ───────────────────────────────────────────────────────

const MONITOR_STATE: Record<UptimeMonitor['last_status'], { label: string; tone: ChipTone }> = {
  up: { label: 'Up', tone: 'success' },
  degraded: { label: 'Degraded', tone: 'warning' },
  down: { label: 'Down', tone: 'danger' },
  // A monitor exists but no check has run — a fourth state, never "Up".
  unknown: { label: 'Waiting for the first check', tone: 'neutral' },
}

function MonitorValue({
  monitor,
  monthUptime,
  incidentCount,
}: {
  monitor: UptimeMonitor
  monthUptime: number | null
  incidentCount: number | null
}) {
  const s = MONITOR_STATE[monitor.last_status] ?? MONITOR_STATE.unknown
  const waiting = monitor.last_status === 'unknown'
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <StatusChip tone={s.tone} dot>{s.label}</StatusChip>
      {!waiting && monitor.last_response_time_ms != null && monitor.last_checked_at && (
        <span className="text-sm text-muted-foreground tabular-nums">
          last check {fmtMs(monitor.last_response_time_ms)}, {formatRelativeTime(monitor.last_checked_at)}
        </span>
      )}
      {!waiting && monthUptime != null && (
        <span className="text-sm text-muted-foreground tabular-nums">· {fmtUptimePct(monthUptime)} this month</span>
      )}
      {!waiting && incidentCount != null && (
        <span className="text-sm text-muted-foreground">
          · {incidentCount === 0 ? 'no incidents' : `${incidentCount} incident${incidentCount === 1 ? '' : 's'}`} this month
        </span>
      )}
    </div>
  )
}

const INSTALL_STATE: Record<InstallStatusResponse['install_status'], { label: string; tone: ChipTone }> = {
  active: { label: 'Receiving data', tone: 'success' },
  stalled: { label: 'No recent data', tone: 'neutral' },
  never_installed: { label: 'No data yet', tone: 'neutral' },
}

function InstallValue({ install, failed }: { install: InstallStatusResponse | undefined; failed: boolean }) {
  // Three states, and only the last is a measurement: not loaded (—), failed
  // to load (said so), loaded (the chip). An unresolved read is never drawn as
  // "No data yet".
  if (failed) return <span className="text-sm text-muted-foreground">Couldn't load install health.</span>
  if (!install) return <span className="text-sm text-muted-foreground">—</span>
  const s = INSTALL_STATE[install.install_status] ?? INSTALL_STATE.never_installed
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <StatusChip tone={s.tone} dot>{s.label}</StatusChip>
      {install.last_event_at ? (
        <span className="text-sm text-muted-foreground">last event {formatRelativeTime(install.last_event_at)}</span>
      ) : (
        <span className="text-sm text-muted-foreground">The script has not sent an event yet.</span>
      )}
    </div>
  )
}
