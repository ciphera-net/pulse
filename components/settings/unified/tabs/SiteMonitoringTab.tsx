'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Toggle, toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { useSite, useUptimeStatus, useUptimeIncidents, useInstallStatus, useIngestHealth } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'
import type { UptimeMonitor } from '@/lib/api/uptime'
import type { InstallStatusResponse, IngestHealthResponse } from '@/lib/api/sites'
import { INGEST_CAUSE_LABEL, knownCauses } from '@/lib/ingest-causes'
import { useCan } from '@/lib/auth/permissions'
import { zoneDayKey } from '@/lib/utils/siteTime'
import { formatRelativeTime } from '@/lib/utils/formatDate'
import { fmtMs, fmtUptimePct } from '@/components/uptime/uptimeMetrics'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { StatusChip, type ChipTone } from '@/components/settings/StatusChip'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'

/**
 * Site → Monitoring (design: Pulse/docs/plans/14-09-2026-site-watcher-design.md
 * §11a/§11b; owner chose direction B, "grouped by question", 14-09-2026).
 *
 * Phase 1a renders ONLY what has real data behind it, and the rule that shaped
 * it is worth stating where the next person will read it: A CONTROL THAT
 * CONTROLS NOTHING IS NOT RENDERED. Hence -
 *
 *   AVAILABILITY  the site's ONE uptime monitor (Pulse auto-creates exactly one
 *                 when uptime_enabled flips on - there is no "add a monitor"
 *                 anywhere in the API), its live status, this month's uptime
 *                 and incident count, and the enable/disable action.
 *   TRACKING      install health, read from GET /sites/:id/install-status. No
 *                 switch: no per-site setting exists for it yet, and the alarm
 *                 producer (Phase 1b) is gated estate-wide, so a toggle here
 *                 would look like a control and do nothing.
 *
 *                 Since Phase 2b (15-09-2026) the TRACKING panel also carries
 *                 "Rejected events", read from GET /sites/:id/ingest-health -
 *                 the redacted sibling of an operator-only ledger, publishing
 *                 three causes in customer words and nothing else.
 *
 * Permissions: the tab is visible to every member (no SITE_TAB_PERMISSIONS
 * entry, like Bot & Spam). The one mutation is PUT /sites/:id {uptime_enabled},
 * whose route gate is sites.edit with an in-handler uptime.manage check - the
 * UI gates on uptime.manage and SHOWS a refusal rather than swallowing it.
 *
 * ── Vocabulary rebuild, 16-09-2026 ──────────────────────────────────────
 * The boolean used to be two Facet Buttons living in two different DOM
 * positions depending on state (an EmptyRow action when off, a panel action
 * when on) - one control in one place is a single Toggle in a PanelRow at the
 * top of Availability, present regardless of state, with the same enable and
 * disable calls underneath. The monitor's own status now renders as a second
 * row in the same PanelRows list, so the panel's shape stops changing shape
 * with the boolean it is describing. `incidentsError` also used to be
 * discarded entirely (a silent failure this month's clause could not report);
 * it now degrades the month clause instead of dropping the count with nothing
 * said.
 */
export default function SiteMonitoringTab({ siteId }: { siteId: string }) {
  const canManageUptime = useCan('uptime.manage')
  const { data: site, error: siteError, mutate: mutateSite } = useSite(siteId)
  const [toggling, setToggling] = useState(false)
  const [retrying, setRetrying] = useState(false)

  // "This month" is the SITE's calendar month, never the viewer's - the
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
  const { data: incidents, error: incidentsError } = useUptimeIncidents(siteId, uptimeOn ? monthStart : '', uptimeOn ? today : '')
  const { data: install, error: installError } = useInstallStatus(siteId)
  // No polling, deliberately: the window is seven days wide, so nothing moves
  // while somebody reads a settings tab, and useInstallStatus already polls on
  // this same panel.
  const { data: ingest, error: ingestError } = useIngestHealth(siteId)

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
      // A 403 here is real - sites.edit is the route gate even when
      // uptime.manage is held - and it is shown, not swallowed.
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
  // A failed incidents read is not the same as a zero read: dropping it to
  // `null` here would make it indistinguishable from "not measured yet", and
  // `incidentsFailed` carries the difference into the clause below.
  const incidentsFailed = Boolean(incidentsError)
  const incidentCount = !incidentsFailed && incidents ? incidents.incidents.length : null

  return (
    <div className="space-y-8">
      {/* Availability - is the site reachable? */}
      <SettingsPanel title="Availability" description="Is the site reachable?">
        <PanelRows>
          <PanelRow
            label="Uptime monitoring"
            caption={
              <>
                Checks <span className="font-mono">{site.domain}</span> every 5 minutes for availability,
                response time and incident history, with alerts by email.
                {!canManageUptime && ' Only an owner or admin can turn this on or off.'}
              </>
            }
            control={
              <Toggle
                checked={uptimeOn}
                onChange={() => toggleUptime(!uptimeOn)}
                disabled={toggling || !canManageUptime}
              />
            }
          />
          {uptimeOn &&
            (uptimeError ? (
              <div className="px-5 py-4">
                <SettingsErrorState
                  variant="banner"
                  message="Couldn't load the monitor's status. This is usually temporary and monitoring itself isn't affected."
                  onRetry={() => {
                    void mutateUptime()
                  }}
                />
              </div>
            ) : !uptime ? (
              <PanelRow label="Monitor" caption="Checking its current status…" />
            ) : !monitor ? (
              // Transient: the monitor is created inside the same PUT that
              // enabled monitoring, so this is a race with the status read,
              // not a state.
              <PanelRow label="Monitor" caption="Preparing the monitor…" />
            ) : (
              <PanelRow
                label={<span className="font-mono">{monitor.url}</span>}
                caption={`${monitor.url.startsWith('https://') ? 'HTTPS' : 'HTTP'} · every ${Math.round(monitor.check_interval_seconds / 60)} min`}
                control={
                  <Link
                    href={`/sites/${siteId}/uptime`}
                    className="text-sm font-medium text-foreground underline underline-offset-4 decoration-border transition-colors duration-fast ease-apple hover:decoration-foreground motion-reduce:transition-none"
                  >
                    View uptime
                  </Link>
                }
              >
                <MonitorValue
                  monitor={monitor}
                  monthUptime={monthUptime}
                  incidentCount={incidentCount}
                  incidentsFailed={incidentsFailed}
                />
              </PanelRow>
            ))}
        </PanelRows>
      </SettingsPanel>

      {/* Tracking - is data arriving? */}
      <SettingsPanel title="Tracking" description="Is data arriving?">
        <PanelRows>
          <PanelRow label="Install health" caption="Whether the tracking script is still sending events.">
            <InstallValue install={install} failed={Boolean(installError)} />
          </PanelRow>
          <PanelRow label="Rejected events" caption="Events Pulse refused in the last 7 days.">
            <RejectedValue ingest={ingest} failed={Boolean(ingestError)} />
          </PanelRow>
        </PanelRows>
        {/* The tab SHOWS the delivery route and links to it; it never edits
            it. Delivery is a person's choice, per category, and lives in
            Notifications - a second writer here would be a second source of
            truth. */}
        <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-3.5">
          <p className="text-xs text-muted-foreground">
            Uptime alerts arrive by email, through the Monitoring category in your notification settings.
          </p>
          {/* The house link: foreground with an underline (Organization →
              Notifications draws the same link the same way). Orange is for
              data and the active state, not for a link, and the arrow glyph
              was the only one on the surface. */}
          <Link
            href="/settings/account/notifications"
            className="shrink-0 text-sm font-medium text-foreground underline underline-offset-4 decoration-border transition-colors duration-fast ease-apple hover:decoration-foreground motion-reduce:transition-none"
          >
            Notification settings
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
  // A monitor exists but no check has run - a fourth state, never "Up".
  unknown: { label: 'Waiting for the first check', tone: 'neutral' },
}

function MonitorValue({
  monitor,
  monthUptime,
  incidentCount,
  incidentsFailed,
}: {
  monitor: UptimeMonitor
  monthUptime: number | null
  incidentCount: number | null
  incidentsFailed: boolean
}) {
  const s = MONITOR_STATE[monitor.last_status] ?? MONITOR_STATE.unknown
  const waiting = monitor.last_status === 'unknown'
  const month = waiting
    ? null
    : incidentsFailed
      ? monthUptime != null
        ? `${fmtUptimePct(monthUptime)} this month. Couldn't load incident count.`
        : "Couldn't load incident count."
      : monthSummary(monthUptime, incidentCount)
  // W1 (owner's pick, 15-09-2026): TWO DELIBERATE LINES, not four inline spans
  // that happen to wrap. Before this, the cell was a `flex-wrap` row of four
  // children and at 1440px the fourth fell to a second line OPENING WITH AN
  // ORPHANED "·" - a separator with nothing on its left. The height is the same
  // 44px either way; what changes is that the break is now chosen, the second
  // line is a whole clause, and "this month" is said once instead of twice.
  return (
    <div className="flex flex-col gap-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusChip tone={s.tone} dot>{s.label}</StatusChip>
        {!waiting && monitor.last_response_time_ms != null && monitor.last_checked_at && (
          <span className="text-sm text-muted-foreground tabular-nums">
            last check {fmtMs(monitor.last_response_time_ms)}, {formatRelativeTime(monitor.last_checked_at)}
          </span>
        )}
      </div>
      {month && <span className="text-sm text-muted-foreground tabular-nums">{month}</span>}
    </div>
  )
}

/**
 * The second line of the Availability cell: this month's uptime and incidents
 * as ONE clause, or null when neither has been measured.
 *
 * "this month" is attached to whichever half survives. A cell that says only
 * "no incidents" has stopped saying over what period, which is the objection
 * that lost direction W2 ("100%" no longer says what it is 100% of).
 */
export function monthSummary(monthUptime: number | null, incidentCount: number | null): string | null {
  const incidents =
    incidentCount == null
      ? null
      : incidentCount === 0
        ? 'no incidents'
        : `${incidentCount} incident${incidentCount === 1 ? '' : 's'}`
  if (monthUptime != null && incidents) return `${fmtUptimePct(monthUptime)} this month, ${incidents}`
  if (monthUptime != null) return `${fmtUptimePct(monthUptime)} this month`
  if (incidents) return `${incidents} this month`
  return null
}

const INSTALL_STATE: Record<InstallStatusResponse['install_status'], { label: string; tone: ChipTone }> = {
  active: { label: 'Receiving data', tone: 'success' },
  stalled: { label: 'No recent data', tone: 'neutral' },
  never_installed: { label: 'No data yet', tone: 'neutral' },
}

function InstallValue({ install, failed }: { install: InstallStatusResponse | undefined; failed: boolean }) {
  // Three states, and only the last is a measurement: not loaded (Loading…),
  // failed to load (said so), loaded (the chip). An unresolved read is never
  // drawn as "No data yet".
  if (failed) return <span className="text-sm text-muted-foreground">Couldn&apos;t load install health.</span>
  if (!install) return <span className="text-sm text-muted-foreground">Loading…</span>
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

/**
 * Rejected events - direction A ("mirror"), the owner's pick of 15-09-2026.
 *
 * A chip plus the causes as PLAIN MUTED TEXT: exactly the grammar of the
 * Install health row one line above, so the tab's vocabulary does not grow a
 * new device for a row that is quiet almost all the time. (Direction C gave
 * each cause its own chip and turned an incidental row into the loudest thing
 * on the panel; B spelled the first cause into a sentence and then had to
 * truncate to "and 1 more reason".)
 *
 * THREE STATES, AND ONLY THE LAST IS A MEASUREMENT - the same contract
 * InstallValue follows. An unresolved read says so plainly and a failed one
 * says so too, because rendering either as "All events counted" would report
 * health that has not been measured.
 *
 * The quiet chip is NEUTRAL, not green. The row reports an absence of
 * trouble, not an achievement, and the tab's own rule is that colour lives in
 * a small dot or a single word.
 */
function RejectedValue({ ingest, failed }: { ingest: IngestHealthResponse | undefined; failed: boolean }) {
  if (failed) return <span className="text-sm text-muted-foreground">Couldn&apos;t load rejected events.</span>
  if (!ingest) return <span className="text-sm text-muted-foreground">Loading…</span>
  // Unrecognised strings are dropped, never printed: the drop-reason taxonomy is
  // operator-only, and this is the client-side half of the two gates that keep
  // it that way (the Iris payload schema's enum is the other).
  const causes = knownCauses(ingest.causes)
  if (!ingest.rejected_last_7d) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusChip tone="neutral" dot>All events counted</StatusChip>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <StatusChip tone="warning" dot>Some events rejected</StatusChip>
      {causes.length > 0 && (
        <span className="text-sm text-muted-foreground">
          {causes.map((c) => INGEST_CAUSE_LABEL[c]).join(', ')}
        </span>
      )}
    </div>
  )
}
