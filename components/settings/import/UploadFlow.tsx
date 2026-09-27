'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, Select } from '@ciphera-net/facet'
import { PanelRow, PanelRows } from '@/components/settings/panels'
import { SetupReveal } from '@/components/settings/integrationRows'
import { prepareImport, type ImportEvent, type PreparedImport, type SkipSample } from '@/lib/import'
import { ImportError } from '@/lib/import/errors'
import { appTransport } from '@/lib/import/app-transport'
import { SOURCE_META, type ImportSource } from '@/lib/import/source-meta'
import {
  NOT_IMPORTED_ANYWHERE,
  UPLOAD_GUIDE,
  dailyVisitorsCaveat,
  sourceLabel,
} from '@/lib/import/source-display'
import {
  importErrorMessage,
  isRetryableUploadError,
  skipLines,
  stoppedUploadMessage,
  failedImportMessage,
  type ImportMessage,
} from '@/lib/import/messages'
import { timezoneGroupsFor } from '@/lib/utils/timezones'
import type { SiteImportStatus } from '@/lib/api/dataImports'
import { RailBar } from '@/components/setup/RailBar'
import { Dropzone } from './Dropzone'
import { ImportErrorBanner } from './ImportErrorBanner'
import { DeleteImportButton, DoneDetails, ProgressRow, SourceHeader, serverProgress } from './ImportRows'
import { acceptFor, dayAfterText, fileNounFor, pct, rangeText, slotPhase } from './importFormat'

// ─── One upload source's block: choose → confirm → upload → the record (M11-d…f) ─
//
// The browser runs an upload (D9): the file is read and folded in a Worker and
// only per-day aggregates are sent. So the progress text says the tab must stay
// open (W4 A, §3.10a constraint 1), and a stopped upload carries on from the SAME
// file (M2-j): choosing it again resumes at the server's cursor, and a different
// file is `plan_mismatch`.
//
// 🔴 The confirm screen renders PreparedImport.plan and nothing else: the plan is
// final before the first write (M2-c), so the screen shows exactly what will be
// imported. `dispose()` runs on Back, Cancel, unmount, and when the parent closes
// this row by opening another (one open at a time, M11-d): nothing holds the
// slot before the first write, so another row CAN open while this one reads or
// confirms, and closing must stop the Worker, not merely hide it.

/** W4 A (owner, Q-M11): the upload runs in this tab. */
export const KEEP_OPEN =
  'Keep this tab open until it finishes. If it closes, choose the same file again and it carries on where it stopped.'
/** W3 A (owner, Q-M11): the dashboard's cache can hold pre-import numbers for up to a minute. */
export const CACHE_NOTE = 'It can take a minute before the dashboard shows the imported days.'
/** How long after completion the cache note is still worth saying (the cache TTL is 60 s). */
const CACHE_NOTE_FOR_MS = 10 * 60 * 1000

type Step =
  | { name: 'choose' }
  | { name: 'reading'; bytesRead: number; bytesTotal: number; planning: boolean }
  | { name: 'confirm'; prepared: PreparedImport }
  | { name: 'uploading'; partsDone: number; partsTotal: number }

interface UploadFlowProps {
  siteId: string
  source: ImportSource
  /** The site's one import, when it is THIS source's (the record). */
  existing: SiteImportStatus | null
  /** Another source's import holds the slot: this row is locked. */
  locked: boolean
  /** This row's flow is the open one (at most one at a time). */
  open: boolean
  onOpen: () => void
  onClose: () => void
  canManage: boolean
  siteTimezone: string | null
  onRequestDelete: () => void
  /** The upload is being sent from this tab (so the slot is not polled and the other rows lock). */
  onLocalChange: (active: boolean) => void
  /** The finished import, as the last batch's answer reported it. */
  onFinished: (status: SiteImportStatus) => void
  /** Something may have changed on the server (a create, a failure): read the slot again. */
  onServerChanged: () => void
  now?: () => Date
}

export function UploadFlow({
  siteId,
  source,
  existing,
  locked,
  open,
  onOpen,
  onClose,
  canManage,
  siteTimezone,
  onRequestDelete,
  onLocalChange,
  onFinished,
  onServerChanged,
  now = () => new Date(),
}: UploadFlowProps) {
  const meta = SOURCE_META[source]
  const guide = UPLOAD_GUIDE[source]
  const tool = sourceLabel(source)
  const aggregate = meta.kind === 'upload_aggregate'

  const [step, setStep] = useState<Step>({ name: 'choose' })
  const [file, setFile] = useState<File | null>(null)
  const [timezone, setTimezone] = useState<string>(siteTimezone ?? '')
  const [error, setError] = useState<ImportMessage | null>(null)
  const [retryable, setRetryable] = useState(false)
  const [showLines, setShowLines] = useState(false)

  const preparedRef = useRef<PreparedImport | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // The site's zone arrives after the first render; default the question to it once.
  useEffect(() => {
    if (!timezone && siteTimezone) setTimezone(siteTimezone)
  }, [siteTimezone, timezone])

  const release = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    preparedRef.current?.dispose()
    preparedRef.current = null
  }, [])

  // Unmount (leaving the tab, switching site) stops the Worker and any request in flight.
  useEffect(() => release, [release])

  const phase = existing ? slotPhase(existing) : null
  const uploadingHere = step.name === 'uploading'
  const busy = step.name === 'reading' || uploadingHere

  // Reported on change only; the parent's callback is read through a ref so a new
  // function identity on each of its renders does not re-fire this.
  const onLocalChangeRef = useRef(onLocalChange)
  onLocalChangeRef.current = onLocalChange
  useEffect(() => {
    onLocalChangeRef.current(uploadingHere)
  }, [uploadingHere])
  // A flow unmounted mid-upload (the tab left) no longer holds the slot.
  useEffect(() => () => onLocalChangeRef.current(false), [])

  const reset = () => {
    release()
    setStep({ name: 'choose' })
    setError(null)
    setRetryable(false)
    setShowLines(false)
  }

  const cancel = () => {
    reset()
    setFile(null)
    onClose()
  }

  // The parent closed this row (another row opened, or the import was deleted):
  // the same as Cancel, minus telling the parent. A layout effect, so a closed
  // row never paints its confirm screen for a frame. An upload in flight is left
  // alone: it holds the slot, so the other rows are locked and cannot open.
  const wasOpen = useRef(open)
  const stepRef = useRef(step)
  stepRef.current = step
  useLayoutEffect(() => {
    const closed = wasOpen.current && !open
    wasOpen.current = open
    if (!closed || stepRef.current.name === 'uploading') return
    release()
    setStep({ name: 'choose' })
    setError(null)
    setRetryable(false)
    setShowLines(false)
    setFile(null)
  }, [open, release])

  const onEvent = (e: ImportEvent) => {
    if (e.type !== 'progress') return
    if (e.stage === 'reading') setStep({ name: 'reading', bytesRead: e.bytesRead, bytesTotal: e.bytesTotal, planning: false })
    else if (e.stage === 'planning') setStep((s) => (s.name === 'reading' ? { ...s, planning: true } : s))
    else if (e.stage === 'uploading') setStep({ name: 'uploading', partsDone: e.partsDone, partsTotal: e.partsTotal })
  }

  const fail = (e: unknown) => {
    const err = e instanceof ImportError ? e : new ImportError('worker_failed', String(e))
    if (err.code === 'aborted') return
    setError(importErrorMessage({ code: err.code, detail: err.detail }, source))
    setRetryable(isRetryableUploadError(err.code))
  }

  /** Sends the prepared plan (a new import) or carries on (a resumed one). */
  const upload = async (prepared: PreparedImport) => {
    setError(null)
    setRetryable(false)
    setStep({ name: 'uploading', partsDone: 0, partsTotal: prepared.plan.parts_total })
    try {
      const status = await prepared.upload()
      release()
      setStep({ name: 'choose' })
      setFile(null)
      onFinished(status)
      onClose()
    } catch (e) {
      fail(e)
      // The same prepared upload can be sent again after a blip; anything else
      // starts over from the file, and the server's word on the import is re-read.
      if (!(e instanceof ImportError && isRetryableUploadError(e.code))) {
        release()
        setStep({ name: 'choose' })
      }
      onServerChanged()
    }
  }

  /** Reads and plans the chosen file. A resume goes straight on to the upload. */
  const prepare = async () => {
    if (!file) return
    release()
    setError(null)
    setRetryable(false)
    setShowLines(false)
    const controller = new AbortController()
    abortRef.current = controller
    setStep({ name: 'reading', bytesRead: 0, bytesTotal: file.size, planning: false })
    const resuming = phase === 'stopped' || phase === 'active'
    try {
      const prepared = await prepareImport({
        siteId,
        source,
        file,
        transport: appTransport,
        sourceTimezone: aggregate && !resuming ? timezone || null : null,
        signal: controller.signal,
        onEvent,
      })
      // Its row closed (or a newer read replaced it) while this one was reading:
      // let the plan go rather than spring a confirm screen back open.
      if (controller.signal.aborted) {
        prepared.dispose()
        return
      }
      preparedRef.current = prepared
      if (prepared.resume) await upload(prepared)
      else setStep({ name: 'confirm', prepared })
    } catch (e) {
      if (controller.signal.aborted) return
      preparedRef.current = null
      setStep({ name: 'choose' })
      fail(e)
    }
  }

  const tzGroups = useMemo(() => timezoneGroupsFor(timezone || siteTimezone), [timezone, siteTimezone])
  const accept = acceptFor(meta.accepts)
  const noun = guide.fileNoun || fileNounFor(meta.accepts)

  const verbButton = canManage ? (
    open ? (
      <Button variant="outline" size="sm" onClick={cancel} aria-expanded>
        Cancel
      </Button>
    ) : (
      <Button variant="outline" size="sm" onClick={onOpen} disabled={locked} aria-expanded={false}>
        Upload
      </Button>
    )
  ) : null

  const errorRow = error ? (
    <div className="border-t border-border px-5 py-3.5">
      <ImportErrorBanner message={error} onRetry={retryable && preparedRef.current ? () => void upload(preparedRef.current!) : undefined} />
    </div>
  ) : null

  // ── Uploading from this tab (A6) ────────────────────────────────────────
  if (step.name === 'uploading') {
    const prepared = preparedRef.current
    const range = prepared ? rangeText(prepared.plan.range_start, prepared.plan.range_end) : undefined
    return (
      <div>
        <SourceHeader source={source} description={range} chip={{ tone: 'info', label: 'Importing' }} />
        <div className="border-t border-border">
          <ProgressRow
            caption={KEEP_OPEN}
            left={`Part ${step.partsDone.toLocaleString('en-US')} of ${step.partsTotal.toLocaleString('en-US')}`}
            done={step.partsDone}
            total={step.partsTotal}
          />
        </div>
        {errorRow}
      </div>
    )
  }

  // ── The record: this source's import, when no flow here is driving it ───
  if (existing && step.name === 'choose' && !error && phase === 'completed') {
    const finished = existing.finished_at ? new Date(existing.finished_at).getTime() : null
    const fresh = finished === null || now().getTime() - finished < CACHE_NOTE_FOR_MS
    return (
      <div>
        <SourceHeader
          source={source}
          description="Your export file never left your browser."
          note={fresh ? CACHE_NOTE : undefined}
          chip={{ tone: 'success', label: 'Imported' }}
          action={canManage ? <DeleteImportButton onClick={onRequestDelete} /> : null}
        />
        <DoneDetails status={existing} />
      </div>
    )
  }

  if (existing && (phase === 'failed' || phase === 'unknown') && step.name === 'choose') {
    const msg = phase === 'failed' ? failedImportMessage(existing, source, now()) : null
    return (
      <div>
        <SourceHeader
          source={source}
          description={existing.range_start && existing.range_end ? rangeText(existing.range_start, existing.range_end) : undefined}
          chip={phase === 'failed' ? { tone: 'danger', label: 'Failed' } : { tone: 'neutral', label: 'In progress' }}
          action={canManage ? <DeleteImportButton onClick={onRequestDelete} /> : null}
        />
        {msg && (
          <div className="border-t border-border px-5 py-3.5">
            <ImportErrorBanner message={msg} />
          </div>
        )}
      </div>
    )
  }

  // A stopped upload (A8), or one moving without this tab (another tab, or a tab
  // that closed less than a day ago): both carry on from the same file.
  if (existing && (phase === 'stopped' || phase === 'active')) {
    const stopped = phase === 'stopped'
    const progress = serverProgress(existing)
    const range = existing.range_start && existing.range_end ? rangeText(existing.range_start, existing.range_end) : undefined
    return (
      <div>
        <SourceHeader
          source={source}
          description={range}
          chip={stopped ? { tone: 'danger', label: 'Stopped' } : { tone: 'info', label: 'Importing' }}
          action={canManage ? <DeleteImportButton onClick={onRequestDelete} disabled={busy} /> : null}
        />
        {stopped ? (
          <div className="border-t border-border px-5 py-3.5">
            <ImportErrorBanner message={{ text: stoppedUploadMessage(existing, now()), details: null }} />
          </div>
        ) : (
          progress && (
            <div className="border-t border-border">
              <ProgressRow
                caption={
                  error
                    ? 'The upload paused here. Choose the same file and it carries on where it stopped.'
                    : 'This import is uploading from another tab or window. If that tab closed, choose the same file here and it carries on where it stopped.'
                }
                left={`Part ${progress.done.toLocaleString('en-US')} of ${progress.total.toLocaleString('en-US')}`}
                done={progress.done}
                total={progress.total}
              />
            </div>
          )
        )}
        {errorRow}
        {canManage && (
          <div className="border-t border-border">
            <PanelRows>
              {step.name === 'reading' ? (
                <ReadingRow step={step} file={file} />
              ) : (
                <PanelRow label="Export file">
                  <Dropzone
                    lead={file ? file.name : `Choose the same ${noun}`}
                    sub={file ? 'Choose another file' : 'or drop it here'}
                    accept={accept}
                    onFiles={(files) => {
                      setError(null)
                      setFile(files[0] ?? null)
                    }}
                  />
                </PanelRow>
              )}
            </PanelRows>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <Button size="sm" onClick={() => void prepare()} disabled={!file || busy}>
                {step.name === 'reading' ? 'Reading…' : 'Continue the import'}
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Confirm (A5) ────────────────────────────────────────────────────────
  if (step.name === 'confirm') {
    const { prepared } = step
    const plan = prepared.plan
    const lines = skipLines([plan.skipped], plan.skipped_samples)
    const samples: SkipSample[] = lines.flatMap((l) => l.samples)
    const measuredFrom =
      (plan.skipped.pulse_measured ?? 0) > 0 && prepared.window.allowed_through
        ? dayAfterText(prepared.window.allowed_through)
        : null
    const days = rangeText(plan.range_start, plan.range_end)
    const dayCount = days.split(' · ')[1]
    const zone = prepared.sourceTimezone
    const notImported = [...guide.notImported, ...NOT_IMPORTED_ANYWHERE]
    if (plan.ignored_files.length > 0) notImported.push(`Files it doesn't read: ${plan.ignored_files.join(', ')}`)
    const worthKnowing = [...(aggregate ? [dailyVisitorsCaveat(tool)] : []), ...guide.worthKnowing]
    return (
      <div>
        <SourceHeader
          source={source}
          description={`${file?.name ?? 'Your export'} · read in your browser`}
          chip={{ tone: 'neutral', label: 'Ready to import' }}
          action={
            <Button variant="outline" size="sm" onClick={cancel}>
              Cancel
            </Button>
          }
        />
        <div className="border-t border-border" data-testid="import-confirm">
          <PanelRows>
            <PanelRow
              label="Range"
              caption={measuredFrom ? `Pulse measures this site from ${measuredFrom}, so the import stops the day before.` : undefined}
            >
              <span className="text-sm text-foreground">{days}</span>
            </PanelRow>
            <PanelRow label="In the file">
              <span className="text-sm tabular-nums text-foreground">
                {plan.totals.visitors.toLocaleString('en-US')} visitors · {plan.totals.pageviews.toLocaleString('en-US')} pageviews
              </span>
            </PanelRow>
            <PanelRow label="Timezone">
              <span className="text-sm text-foreground">
                {zone === prepared.window.site_timezone ? `${zone}, the same as this site` : zone}
              </span>
            </PanelRow>
            <PanelRow label="Imported">
              <span className="text-sm text-foreground">
                {guide.imported.map((t) => (
                  <span key={t} className="block">
                    {t}
                  </span>
                ))}
              </span>
            </PanelRow>
            <PanelRow label="Not imported">
              <span className="text-sm text-muted-foreground">
                {notImported.map((t) => (
                  <span key={t} className="block">
                    {t}
                  </span>
                ))}
              </span>
            </PanelRow>
            {worthKnowing.length > 0 && (
              <PanelRow label="Worth knowing">
                <span className="text-sm text-muted-foreground">
                  {worthKnowing.map((t) => (
                    <span key={t} className="block">
                      {t}
                    </span>
                  ))}
                </span>
              </PanelRow>
            )}
            <PanelRow
              label="Skipped"
              control={
                samples.length > 0 ? (
                  <Button variant="outline" size="sm" onClick={() => setShowLines((v) => !v)} aria-expanded={showLines}>
                    {showLines ? 'Hide lines' : 'Show lines'}
                  </Button>
                ) : undefined
              }
            >
              <span className="text-sm text-muted-foreground">
                {lines.length === 0
                  ? 'Nothing'
                  : lines.map((l) => (
                      <span key={l.text} className="block">
                        {l.text}
                      </span>
                    ))}
              </span>
            </PanelRow>
            {showLines && samples.length > 0 && (
              <PanelRow label="Where they are" caption="File and line only. Nothing from the rows is shown or sent.">
                <ul className="text-sm text-muted-foreground" data-testid="import-skip-samples">
                  {samples.map((s) => (
                    <li key={`${s.file}:${s.line}`}>
                      <span className="font-mono">{s.file}</span>
                      <span className="tabular-nums">, line {s.line}</span>
                    </li>
                  ))}
                </ul>
              </PanelRow>
            )}
          </PanelRows>
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <Button variant="outline" size="sm" onClick={reset}>
              Back
            </Button>
            <Button size="sm" onClick={() => void upload(prepared)}>
              Import {dayCount}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Idle, or choose / reading (A1, A2) ──────────────────────────────────
  return (
    <div>
      <SourceHeader source={source} action={verbButton} />
      <SetupReveal show={open && canManage && !locked}>
        <div className="border-t border-border" data-testid="import-choose">
          {error && (
            <div className="border-b border-border px-5 py-3.5">
              <ImportErrorBanner message={error} />
            </div>
          )}
          <PanelRows>
            {step.name === 'reading' ? (
              <ReadingRow step={step} file={file} />
            ) : (
              <PanelRow label="Export file" caption={guide.exportHelp}>
                <Dropzone
                  lead={file ? file.name : `Choose the ${noun}`}
                  sub={file ? 'Choose another file' : 'or drop it here'}
                  accept={accept}
                  onFiles={(files) => {
                    setError(null)
                    setFile(files[0] ?? null)
                  }}
                />
              </PanelRow>
            )}
            {aggregate && (
              <PanelRow
                label={`${tool} timezone`}
                caption={`The timezone your ${tool} site reports in. The export doesn't say, and imported days keep ${tool}'s calendar.`}
                htmlFor={`import-tz-${source}`}
              >
                <Select
                  id={`import-tz-${source}`}
                  value={timezone}
                  onChange={setTimezone}
                  groups={tzGroups}
                  placeholder="Select a timezone…"
                  disabled={busy}
                  className="w-full"
                  aria-label={`${tool} timezone`}
                />
              </PanelRow>
            )}
          </PanelRows>
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <Button size="sm" onClick={() => void prepare()} disabled={!file || busy || (aggregate && !timezone)}>
              {step.name === 'reading' ? 'Reading…' : 'Review import'}
            </Button>
          </div>
        </div>
      </SetupReveal>
    </div>
  )
}

/** Reading and planning the file in the browser (the `reading` / `planning` events). */
function ReadingRow({ step, file }: { step: Extract<Step, { name: 'reading' }>; file: File | null }) {
  const left = step.planning ? 'Planning the import' : `Reading ${file?.name ?? 'the file'}`
  return (
    <PanelRow label="Export file" caption="Read here, in your browser. Nothing is sent until you confirm.">
      <div
        role="progressbar"
        aria-label="Reading the export"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={step.planning ? 100 : pct(step.bytesRead, step.bytesTotal)}
        aria-valuetext={left}
        className="w-full"
      >
        <RailBar left={left} pct={step.planning ? 100 : pct(step.bytesRead, step.bytesTotal)} />
      </div>
    </PanelRow>
  )
}
