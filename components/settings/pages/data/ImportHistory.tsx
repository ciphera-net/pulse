'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button, toast } from '@ciphera-net/facet'
import { HoldDialog, useUndo } from '@ciphera-net/facet-hold'
import { ClockCounterClockwise, Trash } from '@phosphor-icons/react'
import { deleteImport } from '@/lib/import'
import { appTransport } from '@/lib/import/app-transport'
import { failedImportMessage, importErrorMessage, messageInputFromApiError, type ImportMessage } from '@/lib/import/messages'
import { SOURCE_DISPLAY, MATOMO_GUIDE, isSourceId, sourceLabel, sourceLogoUrl, type SourceId } from '@/lib/import/source-display'
import type { AvailableSource } from '@/lib/import/useImportSources'
import type { ImportSource } from '@/lib/import/source-meta'
import type { SiteImportStatus } from '@/lib/api/dataImports'
import type { Site } from '@/lib/api/sites'
import { usePendingKeys, whilePending } from '@/lib/hold/pending'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { formatLongDay } from '@/lib/view/view'
import { DESTRUCTIVE_OUTLINE } from '@/components/settings/unified/DangerZone'
import { KitBlock, KitDialogTitle, KitRow, KitRows, KitSection, KitStatus } from '@/components/settings/kit/Kit'
import { UploadFlow, CACHE_NOTE } from '@/components/settings/import/UploadFlow'
import { MatomoFlow } from '@/components/settings/import/MatomoFlow'
import { GA4Flow, RECONNECTABLE } from '@/components/settings/import/GA4Flow'
import { SourceHeaderRenderer, skippedText, type SourceHeaderProps } from '@/components/settings/import/ImportRows'
import type { ImportSlotState } from '@/components/settings/import/useImportSlot'
import { importTotals, phaseChip, rangeText, slotPhase } from '@/components/settings/import/importFormat'
import { dayText } from './words'

// ─── Data → Import history (copy deck §8.3, §8.5, §8.7; rulings R23, R24, R32) ─────────────────────────────────
//
// Shown only where the server lists a source this build can drive (lib/import/useImportSources), as the Import tab
// was. A site holds ONE import (the `data_imports_one_per_site` index): while one exists, its row is the section.
// Every member reads it (the import has no permission of its own); only integrations.manage gets the buttons that
// start, continue or delete one (R23: a member reads the import with Details).
//
// A settled import (imported, failed with nothing left to do but delete, a state this build does not know) is the
// approved drawing's row: its status and range in the caption, Details and Delete imported data. Anything a person
// acts on (a source to start, a file to read, a property or site to pick, an import moving or stopped) runs today's
// flow components, their header drawn as this page's row (SourceHeaderRenderer) so the status leads the caption.

export const SECTION_LINE_EMPTY =
  "Bring this site's history from another analytics tool. Imported days are marked as imported on the dashboard and in exports."
export const SECTION_LINE_HELD = 'One import per site. Delete this one to import from another tool.'
export const SECTION_LINE_HELD_MEMBER = 'One import per site.'
export const WHICH_DAYS = 'Pulse imports the days before it started measuring this site, back as far as this site keeps data (Privacy).'
export const IDLE_FOOTNOTE =
  'One import per site. An export you upload is read in your browser, and Pulse receives only its daily counts, never the file.'

/** The flows' chip, as R24 and R32 draw a status: orange while it moves or is done, coral when it failed, grey else. */
function statusTone(chip: NonNullable<SourceHeaderProps['chip']>): 'live' | 'off' | 'broken' {
  if (chip.label === 'Stopped') return 'off'
  if (chip.tone === 'danger') return 'broken'
  if (chip.tone === 'success' || chip.tone === 'info') return 'live'
  return 'off'
}

function SourceLogo({ source }: { source: SourceId }) {
  // eslint-disable-next-line @next/next/no-img-element -- a fixed 16 px CDN mark, as the import rows draw it
  return <img src={sourceLogoUrl(source)} alt="" className="h-4 w-4" data-testid={`import-logo-${source}`} />
}

/** A flow's header, drawn as the kit's row: the mark and name, the status leading the caption, the flow's button. */
function KitSourceHeader({ source, description, note, chip, action }: SourceHeaderProps) {
  const line = description ?? SOURCE_DISPLAY[source].how
  return (
    <KitRow
      icon={<SourceLogo source={source} />}
      logo
      label={SOURCE_DISPLAY[source].label}
      caption={
        <>
          <span className="block">
            {chip && <KitStatus tone={statusTone(chip)}>{chip.label}</KitStatus>}
            {chip && line ? ' · ' : null}
            {line}
          </span>
          {note && <span className="mt-1 block">{note}</span>}
        </>
      }
      control={action ?? undefined}
    />
  )
}

const renderSourceHeader = (props: SourceHeaderProps) => <KitSourceHeader {...props} />

/** Whether the site's import is drawn as the settled row (Details, Delete) rather than run by its flow. */
function settled(status: SiteImportStatus): boolean {
  const phase = slotPhase(status)
  if (phase === 'completed' || phase === 'unknown') return true
  if (phase !== 'failed') return false
  // A failure a new sign-in or token fixes carries on in its flow (Connect again there).
  if (status.source === 'ga4') return !RECONNECTABLE.has(status.error_code ?? '')
  if (status.source === 'matomo') return status.error_code !== 'reconnect_required'
  return true
}

export function ImportHistory({
  siteId,
  site,
  canManage,
  sources,
  slot,
  localUpload,
  onLocalUpload,
  ga4Notice,
}: {
  siteId: string
  site: Site | undefined
  canManage: boolean
  sources: AvailableSource[]
  slot: Extract<ImportSlotState, { status: 'ready' }>
  localUpload: SourceId | null
  onLocalUpload: (update: (cur: SourceId | null) => SourceId | null) => void
  ga4Notice: ImportMessage | null
}) {
  const [open, setOpen] = useState<SourceId | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Hand-rolled on useUndo: a failed delete reads through the import's own error words, which must survive the hold.
  const { defer } = useUndo()
  const pendingKeys = usePendingKeys()

  // While its delete waits behind the Undo bar the import reads as gone, but the server still holds it (one per
  // site), so starting another would be refused: every source stays locked until the delete is sent or undone.
  const slotExisting = slot.existing
  const deletePending = slotExisting !== null && pendingKeys.has(`import:${slotExisting.id}`)
  const existing = deletePending ? null : slotExisting
  const holder: string | null = existing?.source ?? localUpload

  // A source another import locked is never left open (two presses in one batch both land before the lock renders).
  useLayoutEffect(() => {
    if (open !== null && holder !== null && holder !== open) setOpen(null)
  }, [open, holder])

  // An answer that lands after the page has gone (an upload rejecting after the site switched) must not read the
  // slot again: its SWR hook is unmounted.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // One delete per confirm: a second press lands before the dialog's own guard renders.
  const deletingRef = useRef(false)

  const replace = useCallback(
    (status?: SiteImportStatus | null) => {
      if (!mountedRef.current) return
      if (status === undefined) void slot.refresh()
      else slot.set(status)
    },
    [slot],
  )

  const doDelete = () => {
    if (!existing || deletingRef.current) return
    deletingRef.current = true
    const importId = existing.id
    const source = existing.source
    const tool = sourceLabel(source)
    defer(
      whilePending(`import:${importId}`, {
        message: `Imported data from ${tool} deleted`,
        commit: ({ keepalive }: { keepalive: boolean }) => deleteImport({ siteId, importId, transport: appTransport, keepalive }),
        onUndo: () => {
          deletingRef.current = false
        },
        onCommitted: async () => {
          try {
            if (mountedRef.current) await slot.refresh()
          } finally {
            deletingRef.current = false
          }
        },
        onError: (err: unknown) => {
          deletingRef.current = false
          const m = importErrorMessage(messageInputFromApiError(err), source)
          toast.error(m?.text ?? "Couldn't delete the imported data. Try again.")
        },
      }),
    )
    setOpen(null)
  }

  const discard = async (importId: string) => {
    await deleteImport({ siteId, importId, transport: appTransport })
    if (mountedRef.current) await slot.refresh()
  }

  const requestDelete = () => setConfirmDelete(true)

  const flowFor = (s: AvailableSource) => {
    const mine = existing?.source === s.id ? existing : null
    const locked = deletePending || (holder !== null && holder !== s.id)
    const common = {
      siteId,
      existing: mine,
      locked,
      open: open === s.id,
      onOpen: () => setOpen(s.id),
      onClose: () => setOpen((cur) => (cur === s.id ? null : cur)),
      canManage,
      onRequestDelete: requestDelete,
    }
    if (s.flow === 'upload') {
      return (
        <UploadFlow
          {...common}
          source={s.id as ImportSource}
          siteTimezone={site?.timezone ?? null}
          onLocalChange={(active) => onLocalUpload((cur) => (active ? s.id : cur === s.id ? null : cur))}
          onFinished={(status) => replace(status)}
          onServerChanged={() => replace()}
        />
      )
    }
    if (s.flow === 'ga4') {
      return (
        <GA4Flow
          {...common}
          onDiscard={discard}
          onChanged={(status) => replace(status)}
          siteDomain={site?.domain ?? null}
          siteTimezone={site?.timezone ?? null}
          notice={ga4Notice}
        />
      )
    }
    return <MatomoFlow {...common} onDiscard={discard} onChanged={(status) => replace(status)} />
  }

  // The site's import, when one exists, is the section's one row; otherwise every source the server lists.
  const holderSource = sources.find((s) => s.id === holder) ?? null
  let body: React.ReactNode
  if (existing && settled(existing) && localUpload === null) {
    body = <ImportRecord status={existing} canManage={canManage} onRequestDelete={requestDelete} />
  } else if (existing && !holderSource) {
    // A source this build has no flow for, or one the server no longer lists: still shown, still deletable, so the
    // one slot is never held by something the page cannot show or remove.
    body = <ImportRecord status={existing} canManage={canManage} onRequestDelete={requestDelete} />
  } else if (holderSource) {
    body = <div key={holderSource.id}>{flowFor(holderSource)}</div>
  } else {
    body = sources.map((s) => <div key={s.id}>{flowFor(s)}</div>)
  }

  const held = holder !== null
  return (
    <>
      <KitSection
        title="Import history"
        description={held ? (canManage ? SECTION_LINE_HELD : SECTION_LINE_HELD_MEMBER) : SECTION_LINE_EMPTY}
        icon={<ClockCounterClockwise />}
      >
        <KitRows>
          <SourceHeaderRenderer.Provider value={renderSourceHeader}>
            {/* The flows' own rows and banners are inset 20 px for today's panels; the kit's rows have no side
                inset, so it is taken back here and every edge lines up with the section's. */}
            <div className="divide-y divide-border [&_.px-5]:px-0">{body}</div>
          </SourceHeaderRenderer.Provider>
          <KitBlock>
            <p data-data-import-note="" className="text-xs text-muted-foreground">
              {WHICH_DAYS}
              {!held && canManage && ` ${IDLE_FOOTNOTE}`}
            </p>
          </KitBlock>
        </KitRows>
      </KitSection>

      <HoldDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={
          <KitDialogTitle icon={<Trash weight="bold" />}>
            {`Delete the data imported from ${existing ? sourceLabel(existing.source) : 'the other tool'}?`}
          </KitDialogTitle>
        }
        description={`Everything imported from ${existing ? sourceLabel(existing.source) : 'the other tool'} leaves every chart, card, export and API answer. What Pulse measured itself stays. You can import again afterwards. After 6 seconds this can't be undone.`}
        holdLabel="Hold to delete"
        icon={<Trash weight="bold" className="h-4 w-4" aria-hidden="true" />}
        onConfirm={doDelete}
      />
    </>
  )
}

/** "1 Jan 2025 to 14 Sep 2026": the range as the row's caption says it (the days count is in Details). */
function shortRange(status: SiteImportStatus): string | null {
  return status.range_start && status.range_end ? `${formatLongDay(status.range_start)} to ${formatLongDay(status.range_end)}` : null
}

/**
 * The settled import, as the approved drawing has it (R24, R32): its mark and name; the status leading the caption
 * (Imported 3 Nov in orange, Failed in coral, a state this build does not know in grey) and the range; Details, and
 * Delete imported data for owners and admins. A failure's reason is the line under the caption, as a service's problem
 * line is.
 */
function ImportRecord({
  status,
  canManage,
  onRequestDelete,
}: {
  status: SiteImportStatus
  canManage: boolean
  onRequestDelete: () => void
}) {
  const [details, setDetails] = useState(false)
  const { zone } = useDisplayZone()
  const now = new Date()
  const phase = slotPhase(status)
  const source = isSourceId(status.source) ? status.source : null
  const failure = phase === 'failed' ? failedImportMessage(status, status.source, now) : null
  const finished = status.finished_at ? new Date(status.finished_at).getTime() : null
  // Right after an import the dashboard can lag a minute behind (its cache), as the flows have always said.
  const fresh = phase === 'completed' && (finished === null || now.getTime() - finished < 10 * 60 * 1000)
  const chip = phaseChip(phase, status.source)
  const word =
    phase === 'completed' ? (
      <KitStatus tone="live">{status.finished_at ? `Imported ${dayText(status.finished_at, now, zone)}` : 'Imported'}</KitStatus>
    ) : (
      <KitStatus tone={statusTone(chip)}>{chip.label}</KitStatus>
    )
  const range = shortRange(status)

  const rows: { label: string; value: React.ReactNode }[] = []
  if (status.range_start && status.range_end) rows.push({ label: 'Range', value: rangeText(status.range_start, status.range_end) })
  if (phase === 'completed' && status.finished_at) rows.push({ label: 'Imported', value: dayText(status.finished_at, now, zone) })
  const totals = importTotals(status.totals)
  if (totals) rows.push({ label: 'Visitors', value: <span className="tabular-nums">{totals.visitors.toLocaleString('en-US')}</span> })
  if (phase === 'completed') {
    const skipped = skippedText(status)
    rows.push({ label: 'Skipped', value: skipped.length > 0 ? skipped.map((t) => <span key={t} className="block">{t}</span>) : 'Nothing' })
  }
  // The server's own code for support, when the failure has one (a code reads in mono; a sentence never does).
  if (failure?.details) {
    rows.push({
      label: 'Code',
      value: /^[a-z0-9_.:-]+$/.test(failure.details) ? <code className="font-mono break-all">{failure.details}</code> : failure.details,
    })
  }
  const afterNote =
    phase !== 'completed' ? null
      : source === 'matomo' ? MATOMO_GUIDE.revokeNote
        : source && source !== 'ga4' ? 'Your export file never left your browser.'
          : null

  return (
    <div data-testid="import-record" data-data-import={status.source}>
      <KitRow
        icon={source ? <SourceLogo source={source} /> : undefined}
        logo={source !== null}
        label={sourceLabel(status.source)}
        caption={
          <>
            <span className="block">
              {word}
              {range && ` · ${range}`}
            </span>
            {failure && (
              <span data-data-problem="" className="mt-1 block">
                {failure.text}
              </span>
            )}
            {fresh && <span className="mt-1 block">{CACHE_NOTE}</span>}
          </>
        }
        control={
          <>
            <Button variant="outline" size="sm" aria-expanded={details} onClick={() => setDetails((v) => !v)}>
              Details
            </Button>
            {canManage && (
              <Button variant="outline" size="sm" className={DESTRUCTIVE_OUTLINE} onClick={onRequestDelete} aria-haspopup="dialog">
                Delete imported data
              </Button>
            )}
          </>
        }
      />
      {details && (
        <div data-data-import-details="" className="border-t border-border">
          <KitRows>
            {rows.map((r) => (
              <KitRow key={r.label} label={r.label}>
                <span className="text-sm text-muted-foreground">{r.value}</span>
              </KitRow>
            ))}
            {afterNote && (
              <KitBlock>
                <p className="text-xs text-muted-foreground">{afterNote}</p>
              </KitBlock>
            )}
          </KitRows>
        </div>
      )}
    </div>
  )
}
