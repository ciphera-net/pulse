'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@ciphera-net/facet'
import { PanelRow, PanelRows } from '@/components/settings/panels'
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
import { ImportErrorBanner } from './ImportErrorBanner'
import { DeleteImportButton, DoneDetails, ProgressRow, SourceHeader, serverProgress } from './ImportRows'
import { hostsSummary, otherHostsCaption, rangeText, slotPhase, waitUntilText } from './importFormat'
import { formatLongDay } from '@/lib/view/view'
import { CACHE_NOTE } from './UploadFlow'

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
//      (SiteImportTab reads `?ga4=`).
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

const PULL_PROGRESS = 'You can close this page.'

/** Search Console's own sentence for a blocked popup (SiteIntegrationsTab), reused. */
export const POPUP_BLOCKED = 'Your browser blocked the sign-in popup. Allow popups for this site and try again.'

/** How long the kept hostnames must sit still before the plan is read again. */
export const PLAN_PREVIEW_DEBOUNCE_MS = 300

/** W-M5-10, each half only when it is true: where Pulse's own days start, and the window's cut. */
export function rangeCaption(plan: Pick<GA4PlanPreview, 'native_start' | 'history_clipped'>): string | undefined {
  const parts: string[] = []
  if (plan.native_start) {
    parts.push(`Pulse measures this site from ${formatLongDay(plan.native_start)}, so the import stops the day before.`)
  }
  if (plan.history_clipped) parts.push("Earlier days are outside this site's history window.")
  return parts.length > 0 ? parts.join(' ') : undefined
}

/** Failures a new Google sign-in fixes: the row offers "Connect again" (state 7). */
const RECONNECTABLE: ReadonlySet<string> = new Set(['reconnect_required', 'connector_erased'])

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
  const [error, setError] = useState<ImportMessage | null>(notice)
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
    if (notice) setError(notice)
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
      text: 'Something unexpected came back from Pulse. Nothing more was saved. Try again.',
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
  const connect = async (importId?: string) => {
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
        setError({ text: POPUP_BLOCKED, details: null })
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
      setError(messageFor(e))
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
      setError(messageFor(e))
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
          setError(messageFor(e))
          return
        }
      }
      onClose()
    } finally {
      cancelingRef.current = false
      setCanceling(false)
    }
  }

  const errorBlock = error ? (
    <div className="border-b border-border px-5 py-3.5">
      <ImportErrorBanner message={error} />
    </div>
  ) : null

  const waitingRow = (
    <PanelRow
      label={GA4_GUIDE.waitingLabel}
      caption={GA4_GUIDE.waitingCaption}
      control={
        <Button variant="outline" size="sm" onClick={() => void connect(lastImportId.current)} disabled={connecting}>
          {GA4_GUIDE.waitingButton}
        </Button>
      }
    />
  )

  const list = (lines: readonly string[]) =>
    lines.map((t) => (
      <span key={t} className="block">
        {t}
      </span>
    ))

  // ── choosing what to import (states 2–5) ─────────────────────────────────
  if (awaiting) {
    const stop = property?.state === 'error' ? property.message : null
    let hostRows: React.ReactNode = null
    if (hosts?.state === 'loading') {
      hostRows = (
        <PanelRow label="Hostnames">
          <span className="text-sm text-muted-foreground">{GA4_GUIDE.hostnamesLoading}</span>
        </PanelRow>
      )
    } else if (hostList && hostList.length === 0) {
      hostRows = (
        <PanelRow label="Hostnames">
          <span className="text-sm text-muted-foreground">{importErrorMessage({ code: 'no_data_in_range' }, 'ga4')?.text}</span>
        </PanelRow>
      )
    } else if (hostList) {
      // Layout B (owner, 30-09-2026): one line, the same whether or not other websites share the property.
      hostRows = (
        <PanelRow label="Hostnames" caption={otherHostsCaption(otherHosts)}>
          {keptHosts.length > 0 ? (
            <span className="text-sm text-foreground" data-testid="ga4-hosts-kept">
              {hostsSummary(keptHosts)}
            </span>
          ) : (
            // Only other websites in the range: nothing of this site to import.
            <span className="text-sm text-muted-foreground">{importErrorMessage({ code: 'no_data_in_range' }, 'ga4')?.text}</span>
          )}
        </PanelRow>
      )
    }

    return (
      <div>
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
            {errorBlock}
            {stop && (
              <div className="border-b border-border px-5 py-3.5">
                <ImportErrorBanner message={stop} />
              </div>
            )}
            <PanelRows>
              <PanelRow
                label="Google account"
                caption={GA4_GUIDE.accountCaption}
                control={
                  <Button variant="outline" size="sm" onClick={() => void connect(awaiting.id)} disabled={connecting || canceling}>
                    Use another account
                  </Button>
                }
              >
                {email ? <span className="text-sm text-foreground">{email}</span> : null}
              </PanelRow>
              {waiting && waitingRow}
              {property?.state === 'loading' && (
                <PanelRow label="Property">
                  {/* Owner, 29-09-2026 ("ship as written"): the property is being resolved from the site's domain. */}
                  <span className="text-sm text-muted-foreground">{"Finding this site's property…"}</span>
                </PanelRow>
              )}
              {property?.state === 'ready' && (
                <PanelRow label="Property">
                  <span className="text-sm text-foreground">{`${property.value.name} · web stream ${property.value.stream_host}`}</span>
                </PanelRow>
              )}
              {hostRows}
              {planNow?.state === 'loading' && (
                <>
                  {['Range', 'In the property', 'Timezone'].map((label) => (
                    <PanelRow key={label} label={label}>
                      {/* Unruled: the rows wait for the plan. */}
                      <span className="text-sm text-muted-foreground">Loading…</span>
                    </PanelRow>
                  ))}
                </>
              )}
              {planNow?.state === 'ready' && (
                <>
                  <PanelRow label="Range" caption={rangeCaption(planNow.value)}>
                    <span className="text-sm text-foreground">
                      {`${formatLongDay(planNow.value.range_start)} to ${formatLongDay(planNow.value.range_end)} · ${planNow.value.days.toLocaleString('en-US')} ${planNow.value.days === 1 ? 'day' : 'days'}`}
                    </span>
                  </PanelRow>
                  <PanelRow label="In the property">
                    <span className="text-sm tabular-nums text-foreground">
                      {`${planNow.value.totals.visitors.toLocaleString('en-US')} visitors · ${planNow.value.totals.visits.toLocaleString('en-US')} visits · ${planNow.value.totals.pageviews.toLocaleString('en-US')} pageviews · ${planNow.value.totals.events.toLocaleString('en-US')} events`}
                    </span>
                  </PanelRow>
                  <PanelRow label="Timezone">
                    <span className="text-sm text-foreground">
                      {planNow.value.source_timezone === planNow.value.site_timezone
                        ? `${planNow.value.source_timezone}, the same as this site`
                        : planNow.value.source_timezone}
                    </span>
                  </PanelRow>
                </>
              )}
              {property?.state === 'ready' && (
                <>
                  <PanelRow label="Imported">
                    <span className="text-sm text-foreground">
                      {list([...GA4_GUIDE.imported, ...((previewed?.events.length ?? 0) > 0 ? [EVENTS_IMPORTED_LINE] : [])])}
                    </span>
                  </PanelRow>
                  <PanelRow label="Not imported">
                    <span className="text-sm text-muted-foreground">{list([...GA4_GUIDE.notImported, ...NOT_IMPORTED_ANYWHERE])}</span>
                  </PanelRow>
                  <PanelRow label="Worth knowing">
                    <span className="text-sm text-muted-foreground">
                      {list([dailyVisitorsCaveat('Google Analytics'), ...GA4_GUIDE.worthKnowing])}
                    </span>
                  </PanelRow>
                  {!previewed && !previewError && (
                    <PanelRow label="Events">
                      {/* Owner, 29-09-2026 ("ship as written"): Matomo's "Loading this site's events…", for a property. */}
                      <span className="text-sm text-muted-foreground">{"Loading this property's events…"}</span>
                    </PanelRow>
                  )}
                </>
              )}
            </PanelRows>
            {planNow?.state === 'error' && (
              <div className="border-t border-border px-5 py-3.5">
                <ImportErrorBanner message={planNow.message} onRetry={() => setPlanTry((n) => n + 1)} />
              </div>
            )}
            {hosts?.state === 'error' && (
              <div className="border-t border-border px-5 py-3.5">
                <ImportErrorBanner message={hosts.message} onRetry={() => setHostsTry((n) => n + 1)} />
              </div>
            )}
            {previewError && (
              <div className="border-t border-border px-5 py-3.5">
                <ImportErrorBanner message={previewError} onRetry={() => setPreviewTry((n) => n + 1)} />
              </div>
            )}
            {property?.state === 'ready' && (
              <>
                <EventMapping state={mapping} known={knownNames.known} />
                <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
                  <Button size="sm" onClick={() => void start()} disabled={starting || canceling || !ready}>
                    {starting ? 'Starting…' : 'Start the import'}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  const range = existing?.range_start && existing?.range_end ? rangeText(existing.range_start, existing.range_end) : undefined

  // ── moving; a quota pause is a caption, never a state (state 6 A) ────────
  if (existing && phase === 'active') {
    const progress = serverProgress(existing)
    const pausedAt =
      existing.status === 'waiting' && existing.error_code === 'quota_waiting'
        ? waitUntilText(existing.wait_until, now(), zone)
        : null
    return (
      <div>
        <SourceHeader
          source="ga4"
          description={range}
          chip={{ tone: 'info', label: 'Importing' }}
          action={canManage ? <DeleteImportButton onClick={onRequestDelete} /> : null}
        />
        <div className="border-t border-border">
          <ProgressRow
            caption={pausedAt ? GA4_GUIDE.pausedUntil(pausedAt) : PULL_PROGRESS}
            left={progress ? `Part ${progress.done.toLocaleString('en-US')} of ${progress.total.toLocaleString('en-US')}` : 'Starting'}
            done={progress?.done ?? 0}
            total={progress?.total ?? 1}
          />
        </div>
      </div>
    )
  }

  if (existing && phase === 'completed') {
    const finished = existing.finished_at ? new Date(existing.finished_at).getTime() : null
    const fresh = finished === null || now().getTime() - finished < 10 * 60 * 1000
    return (
      <div>
        <SourceHeader
          source="ga4"
          description={range}
          note={fresh ? CACHE_NOTE : undefined}
          chip={{ tone: 'success', label: 'Imported' }}
          action={canManage ? <DeleteImportButton onClick={onRequestDelete} /> : null}
        />
        <DoneDetails status={existing} />
      </div>
    )
  }

  if (existing) {
    // Failed (or a state this build does not know). A grant Google stopped
    // accepting is replaced by signing in again; the import carries on (state 7 A).
    const failed = phase === 'failed' || phase === 'stopped'
    const msg = failed ? failedImportMessage(existing, 'ga4', now()) : null
    const reconnect = failed && RECONNECTABLE.has(existing.error_code ?? '')
    const progress = serverProgress(existing)
    return (
      <div>
        <SourceHeader
          source="ga4"
          description={range}
          chip={failed ? { tone: 'danger', label: 'Failed' } : { tone: 'neutral', label: 'In progress' }}
          action={canManage ? <DeleteImportButton onClick={onRequestDelete} /> : null}
        />
        {msg && (
          <div className="border-t border-border px-5 py-3.5">
            <ImportErrorBanner message={msg} />
          </div>
        )}
        {reconnect && canManage && (
          <div className="border-t border-border">
            {errorBlock}
            <PanelRows>
              <PanelRow
                label="Google account"
                caption={GA4_GUIDE.reconnectCaption(email)}
                control={
                  <Button variant="outline" size="sm" onClick={() => void connect(existing.id)} disabled={connecting}>
                    Connect again
                  </Button>
                }
              />
              {waiting && waitingRow}
              {progress && (
                <ProgressRow left={GA4_GUIDE.stoppedAt(progress.done, progress.total)} done={progress.done} total={progress.total} />
              )}
            </PanelRows>
          </div>
        )}
      </div>
    )
  }

  // ── idle, or waiting for the Google window (state 1 A) ───────────────────
  const showWaiting = waiting && open && canManage && !locked
  return (
    <div>
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
          {errorBlock}
          {showWaiting && <PanelRows>{waitingRow}</PanelRows>}
        </div>
      )}
    </div>
  )
}
