'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@ciphera-net/facet'
import { KitRow, KitRows } from '@/components/settings/kit/Kit'
import { EVENTS_IMPORTED_LINE, GA4_GUIDE, NOT_IMPORTED_ANYWHERE, dailyVisitorsCaveat } from '@/lib/import/source-display'
import type { SourceEvent } from '@/lib/import/core/events'
import {
  failedImportMessage,
  ga4StreamsDetails,
  importErrorMessage,
  messageInputFromApiError,
  type ImportMessage,
} from '@/lib/import/messages'
import {
  confirmGA4Import,
  getGA4AuthURL,
  getGA4Hostnames,
  getGA4PlanPreview,
  previewDataImportEvents,
  resolveGA4Property,
  type GA4Hostname,
  type GA4PlanPreview,
  type GA4Property,
  type SiteImportStatus,
} from '@/lib/api/dataImports'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { EventMapping, useEventMapping, useKnownEventNames } from './EventMapping'
import { ImportErrorLine } from './ImportErrorLine'
import { ImportRecord } from './ImportRecord'
import { CheckFigures, CheckLists, WorthKnowingRow, daysText } from './CheckParts'
import { DeleteImportButton, SourceHeader, StepActions, partText, serverProgress } from './ImportRows'
import { hostsSummary, otherHostsCaption, rangeText, slotPhase, waitUntilText } from './importFormat'
import { formatLongDay } from '@/lib/view/view'

// ─── Google Analytics: sign in with Google, then what to import (M5-k) ────
//
// PULSE-140, design §3.12m5 and the owner's rulings of 29-09-2026 (§3.12m5a and
// its Log). A pull source, like MatomoFlow, whose structure this mirrors:
//
//   1. Connect opens Google in a POPUP (Search Console's precedent: window.open,
//      then `opener` severed), and the row waits for it. Nothing exists on the
//      server until the callback, so the waiting row is client state only, and
//      it ends when the person comes back to this tab (visibilitychange), which
//      reads the slot again. The callback's own sentence shows IN THE POPUP
//      (the Data page reads `?ga4=`).
//   2. NO PICKER (owner): the server resolves the property from the site's
//      domain and this row shows it as a fact. None, or several, stop with the
//      owner's two sentences; "Use another account" is the way out.
//   3. The Google account row, with "Use another account" (a reconnect of the
//      same import with another sign-in).
//   4. Hostnames: ONE line, the site's own (the server's `suggested`: its
//      domain and www.). Owner, 30-09-2026: another website measured by the
//      same property is never imported and has no switch; the caption counts
//      it. The server refuses any other hostname at confirm too.
//   5. The three lists, the M12 mapping, and "Start the import": the flow's ONE
//      orange button.
//   6. A quota pause keeps the chip on "Importing"; the progress caption says
//      until when, in the viewer's display timezone.
//   7. `reconnect_required` (and `connector_erased`) show a "Google account" row
//      with "Connect again", which opens Google for the same import.
//
// Drawn in the settings kit as option B (R51, 07-11-2026): the plan opens with the figures and the two lists, the
// events are one table, the progress lives in the source's own row, and a failure is said where it happened.

const PULL_PROGRESS = 'You can close this page.'

/** A blocked Google window, in Search Console's words (copy deck §8.2, §8.3). */
export const POPUP_BLOCKED = 'Your browser blocked the Google window. Allow pop-ups for Pulse and try again.'

/**
 * Where a failure is said (R51: under what caused it): under the source's row (its Connect or Cancel, and what the
 * Google window's landing page said), under the Google account row (its Use another account or Connect again), or
 * over the step's buttons (Start the import). A state without that place says it under the source's row.
 */
type ErrorPlace = 'row' | 'account' | 'start'

/** How long the kept hostnames must sit still before the plan is read again. */
export const PLAN_PREVIEW_DEBOUNCE_MS = 300

/** W-M5-10, each half only when it is true: where Pulse's own days start, and the window's cut. */
export function rangeCaption(plan: Pick<GA4PlanPreview, 'native_start' | 'history_clipped'>): string | undefined {
  const parts: string[] = []
  if (plan.native_start) {
    parts.push(`Pulse measures this site from ${formatLongDay(plan.native_start)}, so the import stops the day before.`)
  }
  if (plan.history_clipped) parts.push('Earlier days are older than this site keeps data (Privacy).')
  return parts.length > 0 ? parts.join(' ') : undefined
}

/** Failures a new Google sign-in fixes: the row offers "Connect again" (state 7). */
export const RECONNECTABLE: ReadonlySet<string> = new Set(['reconnect_required', 'connector_erased'])

interface GA4FlowProps {
  siteId: string
  existing: SiteImportStatus | null
  locked: boolean
  open: boolean
  onOpen: () => void
  onClose: () => void
  canManage: boolean
  onRequestDelete: () => void
  /** Deletes an unconfirmed import (Cancel while choosing); resolves once it is gone. */
  onDiscard: (importId: string) => Promise<void>
  /** The server's newest word on the import; with no argument, read the slot again. */
  onChanged: (status?: SiteImportStatus) => void
  /** The Pulse site's domain, which the property stops name. */
  siteDomain: string | null
  /** The site's timezone, for the viewer's display zone when they chose "Site's timezone". */
  siteTimezone: string | null
  /** What the Google popup's landing page says (`?ga4=`), read by the tab. */
  notice?: ImportMessage | null
  now?: () => Date
}

type Load<T> = { state: 'loading' } | { state: 'ready'; value: T } | { state: 'error'; message: ImportMessage }

export function GA4Flow({
  siteId,
  existing,
  locked,
  open,
  onOpen,
  onClose,
  canManage,
  onRequestDelete,
  onDiscard,
  onChanged,
  siteDomain,
  siteTimezone,
  notice = null,
  now = () => new Date(),
}: GA4FlowProps) {
  const { zone } = useDisplayZone(siteTimezone)
  const [error, setError] = useState<{ message: ImportMessage; at: ErrorPlace } | null>(notice ? { message: notice, at: 'row' } : null)
  const [waiting, setWaiting] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [starting, setStarting] = useState(false)
  const [canceling, setCanceling] = useState(false)
  // A second press lands before the re-render that disables the button: the refs hold.
  const connectingRef = useRef(false)
  const startingRef = useRef(false)
  const cancelingRef = useRef(false)
  // Which import the last Google window was for ("Open Google again" reopens the same).
  const lastImportId = useRef<string | undefined>(undefined)
  const visibilityRef = useRef<(() => void) | null>(null)
  // Bumped when the person comes back from Google: the property is resolved again
  // (a reconnect with the SAME account changes nothing the effects key on).
  const [returned, setReturned] = useState(0)

  const [property, setProperty] = useState<Load<GA4Property> | null>(null)
  const [hosts, setHosts] = useState<Load<GA4Hostname[]> | null>(null)
  const [hostsTry, setHostsTry] = useState(0)
  const [preview, setPreview] = useState<{ propertyId: string; events: SourceEvent[] } | null>(null)
  const [previewError, setPreviewError] = useState<ImportMessage | null>(null)
  const [previewTry, setPreviewTry] = useState(0)

  useEffect(() => {
    if (notice) setError({ message: notice, at: 'row' })
  }, [notice])

  const phase = existing ? slotPhase(existing) : null
  const awaiting = phase === 'awaiting_property' ? existing : null
  const awaitingId = awaiting?.id ?? null
  const email = existing?.google_email ?? null

  /** A GA4 route's refusal, in the error map's words, with GA4's own details where the server gave them. */
  const messageFor = (e: unknown): ImportMessage => {
    const input = messageInputFromApiError(e)
    const data = (e as { data?: unknown } | null)?.data
    const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    if (input.code === 'quota_waiting') {
      const t = waitUntilText(typeof body.wait_until === 'string' ? body.wait_until : null, now(), zone)
      // Owner, 29-09-2026 ("ship as written"): the ruled pause words, for a confirm Google asked to wait.
      if (t) return { text: `Pulse has to wait until ${t} so your Google Analytics stays usable. Start the import then.`, details: null }
    }
    const m = importErrorMessage({ ...input, detail: { ...input.detail, domain: siteDomain ?? undefined } }, 'ga4') ?? {
      text: "Pulse sent an answer this page can't read. Nothing more was saved. Try again.",
      details: null,
    }
    if (input.code === 'no_matching_property' || input.code === 'several_matching_properties') {
      return { text: m.text, details: ga4StreamsDetails(input.code, body.detail) }
    }
    if (input.code === 'report_incompatible') {
      return { text: m.text, details: typeof body.detail === 'string' && body.detail ? body.detail : input.code }
    }
    return m
  }

  // ── the Google window ────────────────────────────────────────────────────
  const stopListening = () => {
    if (visibilityRef.current) document.removeEventListener('visibilitychange', visibilityRef.current)
    visibilityRef.current = null
  }
  useEffect(() => stopListening, [])

  // One window per press: a second would race the first for the site's one slot.
  const connect = async (importId?: string, at: ErrorPlace = 'row') => {
    if (connectingRef.current || !canManage) return
    connectingRef.current = true
    lastImportId.current = importId
    setError(null)
    setConnecting(true)
    try {
      const { url } = await getGA4AuthURL(siteId, importId)
      // Opened without `noopener` so a blocked window is detectable (null), then
      // cut off from this page: the same protection `noopener` gives.
      const popup = window.open(url, '_blank')
      if (!popup) {
        setError({ message: { text: POPUP_BLOCKED, details: null }, at })
        return
      }
      popup.opener = null
      if (!importId) onOpen()
      setWaiting(true)
      stopListening()
      const onVisible = () => {
        if (document.visibilityState !== 'visible') return
        stopListening()
        setWaiting(false)
        setReturned((n) => n + 1)
        onChanged()
      }
      visibilityRef.current = onVisible
      document.addEventListener('visibilitychange', onVisible)
    } catch (e) {
      const input = messageInputFromApiError(e)
      setError({ message: messageFor(e), at })
      if (['import_exists', 'import_not_active', 'not_found'].includes(input.code)) onChanged()
    } finally {
      connectingRef.current = false
      setConnecting(false)
    }
  }

  // The parent closed this row (another row opened): stop waiting, as Cancel does.
  const wasOpen = useRef(open)
  useLayoutEffect(() => {
    const closed = wasOpen.current && !open
    wasOpen.current = open
    if (!closed || existing) return
    stopListening()
    setWaiting(false)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ── the property, the hostnames and the events (awaiting_property) ────────
  useEffect(() => {
    setProperty(null)
    if (!awaitingId || !canManage) return
    let live = true
    setProperty({ state: 'loading' })
    resolveGA4Property(siteId, awaitingId)
      .then((p) => {
        if (live) setProperty({ state: 'ready', value: p })
      })
      .catch((e) => {
        if (live) setProperty({ state: 'error', message: messageFor(e) })
      })
    return () => {
      live = false
    }
    // messageFor reads only the domain, the zone and the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, awaitingId, canManage, email, returned])

  const propertyId = property?.state === 'ready' ? property.value.property_id : null

  useEffect(() => {
    setHosts(null)
    if (!awaitingId || !propertyId) return
    let live = true
    setHosts({ state: 'loading' })
    getGA4Hostnames(siteId, awaitingId, propertyId)
      .then((r) => {
        if (!live) return
        const list = Array.isArray(r?.hostnames) ? r.hostnames : []
        setHosts({ state: 'ready', value: list })
      })
      .catch((e) => {
        if (live) setHosts({ state: 'error', message: messageFor(e) })
      })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, awaitingId, propertyId, hostsTry])

  useEffect(() => {
    setPreview(null)
    setPreviewError(null)
    if (!awaitingId || !propertyId) return
    let live = true
    previewDataImportEvents(siteId, awaitingId, propertyId)
      .then((r) => {
        if (live) setPreview({ propertyId, events: Array.isArray(r?.events) ? r.events : [] })
      })
      .catch((e) => {
        if (live) setPreviewError(messageFor(e))
      })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, awaitingId, propertyId, previewTry])

  const previewed = preview && preview.propertyId === propertyId ? preview : null
  const knownNames = useKnownEventNames(siteId, (previewed?.events.length ?? 0) > 0)
  const mapping = useEventMapping(
    previewed?.events ?? null,
    'ga4',
    knownNames.goalNames,
    previewed && awaitingId ? `${awaitingId}:${previewed.propertyId}` : null,
  )

  const hostList = hosts?.state === 'ready' ? hosts.value : null
  // Only the site's own hostnames are imported (owner, 30-09-2026): the server's `suggested`.
  const keptHosts = hostList ? hostList.filter((x) => x.suggested === true) : []
  const otherHosts = hostList ? hostList.filter((x) => x.suggested !== true) : []
  // 🔴 The web streams come from the server's property answer, never from this page.
  const streamIds = property?.state === 'ready' ? property.value.stream_ids : null
  // The plan is keyed by exactly what it was read for: a stale answer never shows as current.
  const planKey = propertyId && streamIds && keptHosts.length > 0 ? JSON.stringify([propertyId, streamIds, keptHosts.map((x) => x.host)]) : null

  // ── the plan (state 5 A): read again whenever the kept hostnames change ──
  const [plan, setPlan] = useState<{ key: string; load: Load<GA4PlanPreview> } | null>(null)
  const [planTry, setPlanTry] = useState(0)
  const planSeq = useRef(0)
  useEffect(() => {
    const seq = ++planSeq.current
    if (!awaitingId || !planKey) {
      setPlan(null)
      return
    }
    setPlan({ key: planKey, load: { state: 'loading' } })
    const [pid, sids, hostnames] = JSON.parse(planKey) as [string, string[], string[]]
    // Debounced: a run of switches reads once, for the final set.
    const timer = setTimeout(() => {
      getGA4PlanPreview(siteId, awaitingId, { property_id: pid, stream_ids: sids, hostnames })
        .then((value) => {
          // The last request wins: an answer for an older set is dropped.
          if (planSeq.current === seq) setPlan({ key: planKey, load: { state: 'ready', value } })
        })
        .catch((e) => {
          if (planSeq.current === seq) setPlan({ key: planKey, load: { state: 'error', message: messageFor(e) } })
        })
    }, PLAN_PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, awaitingId, planKey, planTry])
  const planNow = plan && plan.key === planKey ? plan.load : null

  const ready =
    !!awaiting &&
    !!propertyId &&
    !!streamIds &&
    keptHosts.length > 0 &&
    planNow?.state === 'ready' &&
    !!previewed &&
    mapping.valid

  const start = async () => {
    if (!awaiting || !propertyId || !streamIds || !ready || startingRef.current) return
    startingRef.current = true
    setError(null)
    setStarting(true)
    try {
      const status = await confirmGA4Import(siteId, awaiting.id, {
        property_id: propertyId,
        stream_ids: streamIds ?? [],
        hostnames: keptHosts.map((x) => x.host),
        event_map: mapping.map,
      })
      onChanged(status)
      onClose()
    } catch (e) {
      const input = messageInputFromApiError(e)
      setError({ message: messageFor(e), at: 'start' })
      if (['import_exists', 'import_not_active', 'not_found', 'expired', 'reconnect_required'].includes(input.code)) onChanged()
    } finally {
      startingRef.current = false
      setStarting(false)
    }
  }

  // One delete per Cancel: a second press would delete an import that is already gone.
  const cancel = async () => {
    if (cancelingRef.current) return
    cancelingRef.current = true
    setCanceling(true)
    setError(null)
    stopListening()
    setWaiting(false)
    try {
      if (awaiting) {
        try {
          await onDiscard(awaiting.id)
        } catch (e) {
          setError({ message: messageFor(e), at: 'row' })
          return
        }
      }
      onClose()
    } finally {
      cancelingRef.current = false
      setCanceling(false)
    }
  }

  /** The failure, when it belongs at one of these places. */
  const errorAt = (...places: ErrorPlace[]) =>
    error && places.includes(error.at) ? <ImportErrorLine message={error.message} /> : null

  const waitingRow = (at: ErrorPlace) => (
    <KitRow
      label={GA4_GUIDE.waitingLabel}
      caption={GA4_GUIDE.waitingCaption}
      control={
        <Button variant="outline" size="sm" onClick={() => void connect(lastImportId.current, at)} disabled={connecting}>
          {GA4_GUIDE.waitingButton}
        </Button>
      }
    />
  )

  // ── choosing what to import (states 2–5) ─────────────────────────────────
  if (awaiting) {
    const stop = property?.state === 'error' ? property.message : null
    let hostRow: React.ReactNode = null
    if (hosts?.state === 'loading') {
      hostRow = (
        <KitRow label="Hostnames">
          <span className="text-sm text-muted-foreground">{GA4_GUIDE.hostnamesLoading}</span>
        </KitRow>
      )
    } else if (hostList && hostList.length === 0) {
      hostRow = (
        <KitRow label="Hostnames">
          <span className="text-sm text-muted-foreground">{importErrorMessage({ code: 'no_data_in_range' }, 'ga4')?.text}</span>
        </KitRow>
      )
    } else if (hostList) {
      // Layout B (owner, 30-09-2026): one line, the same whether or not other websites share the property.
      hostRow = (
        <KitRow label="Hostnames" caption={otherHostsCaption(otherHosts)}>
          {keptHosts.length > 0 ? (
            <span className="text-sm text-foreground" data-testid="ga4-hosts-kept">
              {hostsSummary(keptHosts)}
            </span>
          ) : (
            // Only other websites in the range: nothing of this site to import.
            <span className="text-sm text-muted-foreground">{importErrorMessage({ code: 'no_data_in_range' }, 'ga4')?.text}</span>
          )}
        </KitRow>
      )
    }

    let figures: React.ReactNode = null
    if (planNow?.state === 'loading') {
      figures = <CheckFigures figures={null} />
    } else if (planNow?.state === 'ready') {
      const p = planNow.value
      const zoneText = p.source_timezone === p.site_timezone ? `${p.source_timezone}, the same as this site` : p.source_timezone
      const caption = rangeCaption(p)
      // The figures carry the three numbers B draws; the property's visits and events stay in the line under them.
      const line = `${daysText(p.range_start, p.range_end)} · ${zoneText} · ${p.totals.visits.toLocaleString('en-US')} visits · ${p.totals.events.toLocaleString('en-US')} events${caption ? `. ${caption}` : ''}`
      figures = <CheckFigures figures={{ days: p.days, visitors: p.totals.visitors, pageviews: p.totals.pageviews }} line={line} />
    } else if (planNow?.state === 'error') {
      figures = <ImportErrorLine message={planNow.message} onRetry={() => setPlanTry((n) => n + 1)} />
    }

    return (
      <div data-import-source="ga4" data-import-step="choose">
        <SourceHeader
          source="ga4"
          chip={{ tone: 'neutral', label: GA4_GUIDE.awaitingChip }}
          action={
            canManage ? (
              <Button variant="outline" size="sm" onClick={() => void cancel()} disabled={canceling}>
                Cancel
              </Button>
            ) : null
          }
        />
        {canManage && (
          <div className="border-t border-border" data-testid="ga4-setup">
            <KitRows>
              {errorAt('row')}
              <KitRow
                label="Google account"
                caption={GA4_GUIDE.accountCaption}
                control={
                  <Button variant="outline" size="sm" onClick={() => void connect(awaiting.id, 'account')} disabled={connecting || canceling}>
                    Use another account
                  </Button>
                }
              >
                {email ? <span className="text-sm text-foreground">{email}</span> : null}
              </KitRow>
              {errorAt('account')}
              {waiting && waitingRow('account')}
              {property?.state === 'loading' && (
                <KitRow label="Property">
                  {/* Owner, 29-09-2026 ("ship as written"): the property is being resolved from the site's domain. */}
                  <span className="text-sm text-muted-foreground">{"Finding this site's property…"}</span>
                </KitRow>
              )}
              {stop && <ImportErrorLine message={stop} />}
              {property?.state === 'ready' && (
                <KitRow label="Property">
                  <span className="text-sm text-foreground">{`${property.value.name} · web stream ${property.value.stream_host}`}</span>
                </KitRow>
              )}
              {hostRow}
              {hosts?.state === 'error' && <ImportErrorLine message={hosts.message} onRetry={() => setHostsTry((n) => n + 1)} />}
              {figures}
              {property?.state === 'ready' && (
                <CheckLists
                  imported={[...GA4_GUIDE.imported, ...((previewed?.events.length ?? 0) > 0 ? [EVENTS_IMPORTED_LINE] : [])]}
                  notImported={[...GA4_GUIDE.notImported, ...NOT_IMPORTED_ANYWHERE]}
                />
              )}
              {property?.state === 'ready' && <WorthKnowingRow lines={[dailyVisitorsCaveat('Google Analytics'), ...GA4_GUIDE.worthKnowing]} />}
              {property?.state === 'ready' && !previewed && !previewError && (
                <KitRow label="Events">
                  {/* Owner, 29-09-2026 ("ship as written"): Matomo's "Loading this site's events…", for a property. */}
                  <span className="text-sm text-muted-foreground">{"Loading this property's events…"}</span>
                </KitRow>
              )}
              {previewError && <ImportErrorLine message={previewError} onRetry={() => setPreviewTry((n) => n + 1)} />}
              {property?.state === 'ready' && <EventMapping state={mapping} known={knownNames.known} tool="Google Analytics" />}
              {errorAt('start')}
              {property?.state === 'ready' && (
                <StepActions>
                  <Button size="sm" onClick={() => void start()} disabled={starting || canceling || !ready}>
                    {starting ? 'Starting…' : 'Start the import'}
                  </Button>
                </StepActions>
              )}
            </KitRows>
          </div>
        )}
      </div>
    )
  }

  const range = existing?.range_start && existing?.range_end ? rangeText(existing.range_start, existing.range_end) : undefined

  // ── moving: the progress in the source's own row; a quota pause is its line, never a state (state 6 A) ──
  if (existing && phase === 'active') {
    const progress = serverProgress(existing)
    const pausedAt =
      existing.status === 'waiting' && existing.error_code === 'quota_waiting'
        ? waitUntilText(existing.wait_until, now(), zone)
        : null
    const caption = pausedAt ? GA4_GUIDE.pausedUntil(pausedAt) : PULL_PROGRESS
    return (
      <div data-import-source="ga4" data-import-step="importing">
        <SourceHeader
          source="ga4"
          description={range}
          chip={{ tone: 'info', label: 'Importing' }}
          action={canManage ? <DeleteImportButton onClick={onRequestDelete} /> : null}
          progress={{
            done: progress?.done ?? 0,
            total: progress?.total ?? 1,
            line: `${progress ? partText(progress.done, progress.total) : 'Starting'} · ${caption}`,
          }}
        />
      </div>
    )
  }

  if (existing && phase === 'completed') {
    return <ImportRecord status={existing} canManage={canManage} onRequestDelete={onRequestDelete} now={now()} />
  }

  if (existing) {
    // Failed (or a state this build does not know). A grant Google stopped
    // accepting is replaced by signing in again; the import carries on (state 7 A).
    const failed = phase === 'failed' || phase === 'stopped'
    const reconnect = failed && RECONNECTABLE.has(existing.error_code ?? '')
    if (!reconnect) return <ImportRecord status={existing} canManage={canManage} onRequestDelete={onRequestDelete} now={now()} />
    const msg = failedImportMessage(existing, 'ga4', now())
    const progress = serverProgress(existing)
    return (
      <div data-import-source="ga4" data-import-step="reconnect">
        <SourceHeader
          source="ga4"
          description={range}
          chip={{ tone: 'danger', label: 'Failed' }}
          // Where it stopped is said in words: the row's hairline fills only while an import moves.
          note={
            <>
              <span className="block">{msg.text}</span>
              {progress && <span className="mt-1 block tabular-nums">{GA4_GUIDE.stoppedAt(progress.done, progress.total)}</span>}
            </>
          }
          action={canManage ? <DeleteImportButton onClick={onRequestDelete} /> : null}
        />
        {canManage && (
          <div className="border-t border-border">
            <KitRows>
              {errorAt('row', 'start')}
              <KitRow
                label="Google account"
                caption={GA4_GUIDE.reconnectCaption(email)}
                control={
                  <Button variant="outline" size="sm" onClick={() => void connect(existing.id, 'account')} disabled={connecting}>
                    Connect again
                  </Button>
                }
              />
              {errorAt('account')}
              {waiting && waitingRow('account')}
            </KitRows>
          </div>
        )}
      </div>
    )
  }

  // ── idle, or waiting for the Google window (state 1 A) ───────────────────
  const showWaiting = waiting && open && canManage && !locked
  return (
    <div data-import-source="ga4" data-import-step={showWaiting ? 'waiting' : 'idle'}>
      <SourceHeader
        source="ga4"
        note={GA4_GUIDE.connectNote}
        chip={showWaiting ? { tone: 'neutral', label: GA4_GUIDE.waitingChip } : null}
        action={
          canManage ? (
            showWaiting ? (
              <Button variant="outline" size="sm" onClick={() => void cancel()} disabled={canceling}>
                Cancel
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => void connect()} disabled={locked || connecting}>
                Connect
              </Button>
            )
          ) : null
        }
      />
      {(showWaiting || (error && canManage)) && (
        <div className="border-t border-border" data-testid="ga4-connect">
          <KitRows>
            {errorAt('row', 'account', 'start')}
            {showWaiting && waitingRow('row')}
          </KitRows>
        </div>
      )}
    </div>
  )
}
