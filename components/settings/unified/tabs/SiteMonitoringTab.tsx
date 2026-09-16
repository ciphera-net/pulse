'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button, toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { Heartbeat } from '@phosphor-icons/react'
import { useSite, useUptimeStatus, useUptimeIncidents, useInstallStatus, useIngestHealth, useTrafficStatus } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'
import type { UptimeMonitor } from '@/lib/api/uptime'
import type { InstallStatusResponse, IngestHealthResponse, TrafficStatusResponse } from '@/lib/api/sites'
import { INGEST_CAUSE_LABEL, knownCauses } from '@/lib/ingest-causes'
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
 *                 Since Phase 2b (15-09-2026) the TRACKING panel also carries
 *                 "Rejected events", read from GET /sites/:id/ingest-health —
 *                 the redacted sibling of an operator-only ledger, publishing
 *                 three causes in customer words and nothing else.
 *
 * Not here yet, by measurement rather than omission: the whole TRAFFIC panel
 * (its types were retired 18-08-2026 and are unemittable at the database; they
 * return under NEW keys in Phases 4–5).
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
  // No polling, deliberately: the window is seven days wide, so nothing moves
  // while somebody reads a settings tab, and useInstallStatus already polls on
  // this same panel.
  const { data: ingest, error: ingestError } = useIngestHealth(siteId)
  // No polling either: the answer is about YESTERDAY on the site's own clock,
  // so it cannot move while somebody reads a settings tab.
  const { data: traffic, error: trafficError } = useTrafficStatus(siteId)

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
          <PanelRow label="Rejected events" caption="Events Pulse refused in the last 7 days.">
            <RejectedValue ingest={ingest} failed={Boolean(ingestError)} />
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

      {/* ── Traffic — is traffic behaving normally? ───────────────────── */}
      {/* Direction T1, the owner's pick of 16-09-2026: its OWN panel asking its
          own question, with ONE row whose value cell is a chip plus muted text —
          exactly Install health's grammar one panel up.

          The recommendation put to the owner was T3, a third row inside Tracking,
          which is tighter. They chose T1 because direction B was chosen in the
          first place BECAUSE it groups by question, and T3 is the one shape that
          breaks that: "is traffic normal" is not "is data arriving", and a site
          can be receiving data perfectly while having lost half its visitors.
          The empty chrome around one row is the price of the grouping. */}
      <SettingsPanel kicker="Traffic" description="Is traffic behaving normally?">
        <PanelRows>
          <PanelRow label="Traffic level" caption="Whether visits are close to this site&rsquo;s recent normal.">
            <TrafficValue traffic={traffic} failed={Boolean(trafficError)} />
          </PanelRow>
        </PanelRows>
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
  const month = waiting ? null : monthSummary(monthUptime, incidentCount)
  // W1 (owner's pick, 15-09-2026): TWO DELIBERATE LINES, not four inline spans
  // that happen to wrap. Before this, the cell was a `flex-wrap` row of four
  // children and at 1440px the fourth fell to a second line OPENING WITH AN
  // ORPHANED "·" — a separator with nothing on its left. The height is the same
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
 * ⚠️ "this month" is attached to whichever half survives. A cell that says only
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

/**
 * Rejected events — direction A ("mirror"), the owner's pick of 15-09-2026.
 *
 * A chip plus the causes as PLAIN MUTED TEXT: exactly the grammar of the
 * Install health row one line above, so the tab's vocabulary does not grow a
 * new device for a row that is quiet almost all the time. (Direction C gave
 * each cause its own chip and turned an incidental row into the loudest thing
 * on the panel; B spelled the first cause into a sentence and then had to
 * truncate to "and 1 more reason".)
 *
 * 🔴 THREE STATES, AND ONLY THE LAST IS A MEASUREMENT — the same contract
 * InstallValue follows. An unresolved read is an em dash and a failed one says
 * so, because rendering either as "All events counted" would report health that
 * has not been measured.
 *
 * ⚠️ The quiet chip is NEUTRAL, not green. The row reports an absence of
 * trouble, not an achievement, and the tab's own rule is that colour lives in a
 * small dot or a single word.
 */
function RejectedValue({ ingest, failed }: { ingest: IngestHealthResponse | undefined; failed: boolean }) {
  if (failed) return <span className="text-sm text-muted-foreground">Couldn&apos;t load rejected events.</span>
  if (!ingest) return <span className="text-sm text-muted-foreground">—</span>
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

/**
 * Traffic level — direction T1, the owner's pick of 16-09-2026.
 *
 * 🔴 FOUR STATES, AND ONLY THE LAST TWO ARE MEASUREMENTS — the same contract
 * InstallValue and RejectedValue follow one panel up: an unresolved read is an
 * em dash, a failed one says so, and the rest is the answer.
 *
 * 🔴 `Not watched yet` IS AN ANSWER, NOT A SPINNER, and it is what MOST sites
 * show MOST of the time — production measured eight of ten on the day this
 * shipped, and every new site does for its first five weeks. §5 of the design
 * says in as many words that it must not look like a loading state, which is why
 * it is a neutral chip with a date beside it rather than a skeleton.
 *
 * ⚠️ The chip for a RISE is neutral, not green. A spike is not an achievement —
 * it is often a bot wave, which is why the copy sends the reader to look rather
 * than congratulating them.
 */
function TrafficValue({ traffic, failed }: { traffic: TrafficStatusResponse | undefined; failed: boolean }) {
  if (failed) return <span className="text-sm text-muted-foreground">Couldn&apos;t load traffic.</span>
  if (!traffic) return <span className="text-sm text-muted-foreground">&mdash;</span>

  if (traffic.state === 'unwatched') {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusChip tone="neutral" dot>Not watched yet</StatusChip>
        <span className="text-sm text-muted-foreground">{unwatchedCaption(traffic)}</span>
      </div>
    )
  }

  // 🔴 A judged day with null figures cannot be rendered as numbers. The API
  // sends null precisely so a zero is never mistaken for a measurement, and
  // this is the half of that contract that lives on the client.
  const figures =
    traffic.observed != null && traffic.expected != null && traffic.day
      ? `${fmtVisitors(traffic.observed)} on ${prettyDay(traffic.day)}, about ${fmtVisitors(traffic.expected)} expected`
      : null

  // 🔴 BELOW THE FLOOR IS "CANNOT TELL", NOT "NORMAL". A site whose expectation
  // is under the detector's minimum can never produce a direction, so calling it
  // Normal claims a judgement that was never made. On production every one of
  // the four Europe/* sites is in exactly that position — best case 17 visitors
  // a day, worst case 1 — so without this they would have read "Normal" forever
  // the moment the session boundary cleared.
  //
  // It is checked BEFORE the direction, because a below-floor verdict is always
  // `steady` and the two would otherwise be indistinguishable.
  if (traffic.below_floor) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusChip tone="neutral" dot>Not enough traffic to judge</StatusChip>
        {figures && <span className="text-sm text-muted-foreground tabular-nums">{figures}</span>}
      </div>
    )
  }

  const s = TRAFFIC_STATE[traffic.direction ?? 'steady'] ?? TRAFFIC_STATE.steady
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <StatusChip tone={s.tone} dot>{s.label}</StatusChip>
      {figures && <span className="text-sm text-muted-foreground tabular-nums">{figures}</span>}
    </div>
  )
}

const TRAFFIC_STATE: Record<'steady' | 'fell' | 'rose', { label: string; tone: ChipTone }> = {
  steady: { label: 'Normal', tone: 'neutral' },
  fell: { label: 'Traffic fell', tone: 'warning' },
  // Neutral, not success: a rise is as often a bot wave as good news.
  rose: { label: 'Traffic rose', tone: 'neutral' },
}

/**
 * Why a site is not being watched, in words rather than a slug.
 *
 * ⚠️ Every branch names a REASON, and the two that have a knowable end date name
 * it. "Watching from 30 September" is an answer; "not enough data" is a shrug,
 * and a shrug is what makes a state read as a spinner.
 */
export function unwatchedCaption(t: TrafficStatusResponse): string {
  const from = t.watching_from ? `Watching from ${prettyDay(t.watching_from)}` : ''
  switch (t.reason) {
    case 'new_site':
      return from || 'Not enough history yet'
    case 'session_boundary':
      // The 26-08-2026 visitor-identity rebuild moved when a session's day is
      // cut, for every site not on UTC. Days either side are not comparable, so
      // the site waits it out — and saying so is better than implying its data
      // is missing.
      return from || 'Waiting for comparable history'
    case 'timezone_changed':
      return from || 'Waiting after a timezone change'
    case 'gap':
      return 'No data for the last full day'
    default:
      return from || 'Not enough history yet'
  }
}

/** A date a person reads, in the site's own terms. */
function prettyDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  if (!y || !m || !d) return day
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', timeZone: 'UTC',
  })
}

/** Visitors, rounded — the figures are medians and counts, never fractions on
 *  screen. `tabular-nums` does the alignment; font-mono would be wrong, because
 *  a visitor count is not something you would type into a terminal. */
function fmtVisitors(n: number): string {
  const r = Math.round(n)
  return `${r.toLocaleString('en-GB')} visitor${r === 1 ? '' : 's'}`
}
