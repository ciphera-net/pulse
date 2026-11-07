'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Select } from '@ciphera-net/facet'
import { KitRow, KitRows } from '@/components/settings/kit/Kit'
import { EVENTS_IMPORTED_LINE, MATOMO_GUIDE, NOT_IMPORTED_ANYWHERE, dailyVisitorsCaveat } from '@/lib/import/source-display'
import type { SourceEvent } from '@/lib/import/core/events'
import { failedImportMessage, importErrorMessage, messageInputFromApiError, type ImportMessage } from '@/lib/import/messages'
import {
  confirmDataImport,
  connectMatomo,
  getMatomoProperties,
  previewDataImportEvents,
  type MatomoProperty,
  type SiteImportStatus,
} from '@/lib/api/dataImports'
import { EventMapping, useEventMapping, useKnownEventNames } from './EventMapping'
import { ImportErrorLine } from './ImportErrorLine'
import { ImportRecord } from './ImportRecord'
import { CheckLists, WorthKnowingRow } from './CheckParts'
import { DeleteImportButton, SourceHeader, StepActions, partText, serverProgress } from './ImportRows'
import { rangeText, slotPhase } from './importFormat'

// ─── Matomo: an address and a token, then the site (M11-j, §3.12m10) ───────
//
// Built against M10's route contract, and invisible until GET …/sources lists
// `matomo`. A pull source: Pulse's worker fetches the history, so the page can
// be closed (M11-e), and the status is polled every five seconds while it moves.
//
// 🔴 Connect IS the test (M10-b), and it creates the import in
// `awaiting_property` holding the sealed token. So a Cancel after "Load sites"
// deletes that import rather than leaving a credential behind. The token lives in
// this component's state for the one request and is dropped after it.
//
// 🔴 Pulse can't revoke a Matomo token (M10-j), so the finished and failed states
// say where the customer deletes it.
//
// Drawn in the settings kit as option B (R51, 07-11-2026): the address and the token under the row, then the site,
// the two lists and the events as one table; the progress lives in the source's own row, and a failure is said where
// it happened.

const PULL_PROGRESS = 'You can close this page.'

/**
 * Where a failure is said (R51: under what caused it): under the source's row (its Cancel), under the token (Load
 * sites, Connect again), under the Matomo site (the list of sites), or over the step's buttons (Start the import).
 * A state without that place says it under the source's row.
 */
type ErrorPlace = 'row' | 'connect' | 'site' | 'start'

interface MatomoFlowProps {
  siteId: string
  existing: SiteImportStatus | null
  locked: boolean
  open: boolean
  onOpen: () => void
  onClose: () => void
  canManage: boolean
  onRequestDelete: () => void
  /** Deletes an unconfirmed import (Cancel after Load sites); resolves once it is gone. */
  onDiscard: (importId: string) => Promise<void>
  /** The server's newest word on the import; with no argument, read the slot again. */
  onChanged: (status?: SiteImportStatus) => void
  now?: () => Date
}

export function MatomoFlow({
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
  now = () => new Date(),
}: MatomoFlowProps) {
  const [baseUrl, setBaseUrl] = useState('')
  const [token, setToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [starting, setStarting] = useState(false)
  const [canceling, setCanceling] = useState(false)
  // A second press lands before the re-render that disables the button: the refs hold.
  const cancelingRef = useRef(false)
  const connectingRef = useRef(false)
  const startingRef = useRef(false)
  const [properties, setProperties] = useState<MatomoProperty[] | null>(null)
  const [propertyId, setPropertyId] = useState('')
  const [error, setError] = useState<{ message: ImportMessage; at: ErrorPlace } | null>(null)
  // M12 (contract §3.12m12b-5): the chosen site's events, read before Start so
  // the confirm step can map them. Held with the site they belong to, so a
  // preview that answers after the choice changed is never mapped to another.
  const [preview, setPreview] = useState<{ propertyId: string; events: SourceEvent[] } | null>(null)
  const [previewError, setPreviewError] = useState<ImportMessage | null>(null)
  const [previewTry, setPreviewTry] = useState(0)

  const phase = existing ? slotPhase(existing) : null
  const awaiting = phase === 'awaiting_property' ? existing : null

  // A connection waiting for its site (this tab's, or one found on reload): list the sites.
  const awaitingId = awaiting?.id ?? null
  useEffect(() => {
    if (!awaitingId) {
      setProperties(null)
      return
    }
    let live = true
    getMatomoProperties(siteId, awaitingId)
      .then((r) => {
        if (!live) return
        setProperties(r.properties)
        setPropertyId((prev) => prev || r.suggested_id || r.properties[0]?.id || '')
      })
      .catch((e) => {
        if (!live) return
        const message = importErrorMessage(messageInputFromApiError(e), 'matomo')
        setError(message ? { message, at: 'site' } : null)
      })
    return () => {
      live = false
    }
  }, [siteId, awaitingId])

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
        if (live) setPreviewError(importErrorMessage(messageInputFromApiError(e), 'matomo'))
      })
    return () => {
      live = false
    }
  }, [siteId, awaitingId, propertyId, previewTry])

  const previewed = preview && preview.propertyId === propertyId ? preview : null
  const knownNames = useKnownEventNames(siteId, (previewed?.events.length ?? 0) > 0)
  const mapping = useEventMapping(
    previewed?.events ?? null,
    'matomo',
    knownNames.goalNames,
    previewed && awaitingId ? `${awaitingId}:${previewed.propertyId}` : null,
  )

  const fail = (e: unknown, at: ErrorPlace) => {
    const input = messageInputFromApiError(e)
    const message = importErrorMessage(input, 'matomo')
    setError(message ? { message, at } : null)
    // Someone else's import took the slot, or this one changed under us: read it again.
    if (['import_exists', 'import_not_active', 'not_found', 'expired'].includes(input.code)) onChanged()
  }

  // One connect per press: a second would race the first for the site's one slot.
  const connect = async (importId?: string) => {
    if (connectingRef.current) return
    connectingRef.current = true
    setError(null)
    setConnecting(true)
    try {
      const status = await connectMatomo(siteId, { base_url: baseUrl.trim(), token: token.trim(), import_id: importId })
      setToken('')
      onChanged(status)
    } catch (e) {
      fail(e, 'connect')
    } finally {
      connectingRef.current = false
      setConnecting(false)
    }
  }

  const start = async () => {
    if (!awaiting || !propertyId || !previewed || !mapping.valid || startingRef.current) return
    startingRef.current = true
    setError(null)
    setStarting(true)
    try {
      const status = await confirmDataImport(siteId, awaiting.id, propertyId, mapping.map)
      onChanged(status)
      onClose()
    } catch (e) {
      fail(e, 'start')
    } finally {
      startingRef.current = false
      setStarting(false)
    }
  }

  // One delete per Cancel: a second press would delete an import that is already
  // gone and answer "This import no longer exists", after a cancel that worked.
  const cancel = async () => {
    if (cancelingRef.current) return
    cancelingRef.current = true
    setCanceling(true)
    setError(null)
    setToken('')
    try {
      if (awaiting) {
        try {
          await onDiscard(awaiting.id)
        } catch (e) {
          fail(e, 'row')
          return
        }
      }
      setProperties(null)
      setPropertyId('')
      onClose()
    } finally {
      cancelingRef.current = false
      setCanceling(false)
    }
  }

  // The parent closed this row (another row opened): drop the typed token and any
  // refusal with it, as Cancel does. Nothing server-side exists yet: a connection
  // that did reach the server holds the slot and locks every other row.
  const wasOpen = useRef(open)
  useLayoutEffect(() => {
    const closed = wasOpen.current && !open
    wasOpen.current = open
    if (!closed) return
    setToken('')
    setError(null)
  }, [open])

  const siteOptions = useMemo(
    () =>
      (properties ?? []).map((p) => ({
        value: p.id,
        label: `${p.name} (site ${p.id})`,
      })),
    [properties],
  )

  /** The failure, when it belongs at one of these places. */
  const errorAt = (...places: ErrorPlace[]) =>
    error && places.includes(error.at) ? <ImportErrorLine message={error.message} /> : null

  const credentialRows = (reconnectId?: string) => (
    <>
      <KitRow label="Matomo address" caption={MATOMO_GUIDE.urlCaption} htmlFor="matomo-url">
        <Input
          id="matomo-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://analytics.example.com"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          disabled={connecting}
        />
      </KitRow>
      <KitRow
        label="Token"
        caption={MATOMO_GUIDE.tokenCaption}
        htmlFor="matomo-token"
        control={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void connect(reconnectId)}
            disabled={connecting || !baseUrl.trim() || !token.trim()}
          >
            {connecting ? 'Checking…' : reconnectId ? 'Connect again' : 'Load sites'}
          </Button>
        }
      >
        <Input
          id="matomo-token"
          type="password"
          autoComplete="off"
          placeholder="Paste the token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={connecting}
        />
      </KitRow>
      {errorAt('connect')}
    </>
  )

  // ── Waiting for its site (A4, after Load sites; or found on reload) ──────
  if (awaiting) {
    return (
      <div data-import-source="matomo" data-import-step="choose">
        <SourceHeader
          source="matomo"
          chip={{ tone: 'neutral', label: 'Choose a site' }}
          action={
            canManage ? (
              <Button variant="outline" size="sm" onClick={() => void cancel()} disabled={canceling}>
                Cancel
              </Button>
            ) : null
          }
        />
        {canManage && (
          <div className="border-t border-border" data-testid="matomo-site">
            <KitRows>
              {errorAt('row', 'connect')}
              <KitRow label="Matomo site" htmlFor="matomo-site-select">
                {properties === null ? (
                  // A failed list is said under this row; this line only waits.
                  error?.at === 'site' ? null : <span className="text-sm text-muted-foreground">Loading the sites this token can see…</span>
                ) : properties.length === 0 ? (
                  <span className="text-sm text-muted-foreground">{importErrorMessage({ code: 'no_properties' }, 'matomo')?.text}</span>
                ) : (
                  <Select
                    id="matomo-site-select"
                    value={propertyId}
                    onChange={setPropertyId}
                    options={siteOptions}
                    placeholder="Choose a site…"
                    className="w-full"
                    aria-label="Matomo site"
                  />
                )}
              </KitRow>
              {errorAt('site')}
              <CheckLists
                imported={[...MATOMO_GUIDE.imported, ...((previewed?.events.length ?? 0) > 0 ? [EVENTS_IMPORTED_LINE] : [])]}
                notImported={NOT_IMPORTED_ANYWHERE}
              />
              <WorthKnowingRow lines={[dailyVisitorsCaveat('Matomo'), ...MATOMO_GUIDE.worthKnowing]} />
              {propertyId && !previewed && !previewError && (
                <KitRow label="Events">
                  <span className="text-sm text-muted-foreground">{"Loading this site's events…"}</span>
                </KitRow>
              )}
              {previewError && <ImportErrorLine message={previewError} onRetry={() => setPreviewTry((n) => n + 1)} />}
              <EventMapping state={mapping} known={knownNames.known} tool="Matomo" />
              {errorAt('start')}
              <StepActions>
                <Button size="sm" onClick={() => void start()} disabled={starting || canceling || !propertyId || !previewed || !mapping.valid}>
                  {starting ? 'Starting…' : 'Start the import'}
                </Button>
              </StepActions>
            </KitRows>
          </div>
        )}
      </div>
    )
  }

  // ── Moving: the server's worker steps it; this page can close (M11-e). The progress in the source's own row ──
  if (existing && phase === 'active') {
    const progress = serverProgress(existing)
    return (
      <div data-import-source="matomo" data-import-step="importing">
        <SourceHeader
          source="matomo"
          description={existing.range_start && existing.range_end ? rangeText(existing.range_start, existing.range_end) : undefined}
          chip={{ tone: 'info', label: 'Importing' }}
          action={canManage ? <DeleteImportButton onClick={onRequestDelete} /> : null}
          progress={{
            done: progress?.done ?? 0,
            total: progress?.total ?? 1,
            line: `${progress ? partText(progress.done, progress.total) : 'Starting'} · ${PULL_PROGRESS}`,
          }}
        />
      </div>
    )
  }

  if (existing && phase === 'completed') {
    return <ImportRecord status={existing} canManage={canManage} onRequestDelete={onRequestDelete} now={now()} />
  }

  if (existing) {
    // Failed (or a state this build does not know). A token Matomo stopped accepting
    // can be replaced, and the import carries on where it stopped (M10 "Routes").
    const failed = phase === 'failed' || phase === 'stopped'
    const reconnect = existing.error_code === 'reconnect_required'
    if (!reconnect) return <ImportRecord status={existing} canManage={canManage} onRequestDelete={onRequestDelete} now={now()} />
    const msg = failed ? failedImportMessage(existing, 'matomo', now()) : null
    return (
      <div data-import-source="matomo" data-import-step="reconnect">
        <SourceHeader
          source="matomo"
          description={MATOMO_GUIDE.revokeNote}
          note={msg?.text}
          chip={failed ? { tone: 'danger', label: 'Failed' } : { tone: 'neutral', label: 'In progress' }}
          action={canManage ? <DeleteImportButton onClick={onRequestDelete} /> : null}
        />
        {canManage && (
          <div className="border-t border-border">
            <KitRows>
              {errorAt('row', 'site', 'start')}
              {credentialRows(existing.id)}
            </KitRows>
          </div>
        )}
      </div>
    )
  }

  // ── Idle, or the address and token (A4) ──────────────────────────────────
  const showStep = open && canManage && !locked
  return (
    <div data-import-source="matomo" data-import-step={showStep ? 'connect' : 'idle'}>
      <SourceHeader
        source="matomo"
        action={
          canManage ? (
            open ? (
              <Button variant="outline" size="sm" onClick={() => void cancel()} disabled={canceling} aria-expanded>
                Cancel
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={onOpen} disabled={locked} aria-expanded={false}>
                Connect
              </Button>
            )
          ) : null
        }
      />
      {showStep && (
        <div className="border-t border-border" data-testid="matomo-connect">
          <KitRows>
            {errorAt('row', 'site', 'start')}
            {credentialRows()}
          </KitRows>
        </div>
      )}
    </div>
  )
}
