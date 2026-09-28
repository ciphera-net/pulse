'use client'

import { Button } from '@ciphera-net/facet'
import { StatusChip, type ChipTone } from '@/components/settings/StatusChip'
import { PanelRow } from '@/components/settings/panels'
import { LogoTile, ServiceHeaderRow, DetailRows, type DetailRow } from '@/components/settings/integrationRows'
import { RailBar } from '@/components/setup/RailBar'
import { DESTRUCTIVE_OUTLINE } from '@/components/settings/unified/DangerZone'
import { SOURCE_DISPLAY, isSourceId, sourceLabel, sourceLogoUrl, type SourceId } from '@/lib/import/source-display'
import { failedImportMessage, skipLines } from '@/lib/import/messages'
import { formatDateTime } from '@/lib/utils/formatDate'
import type { SiteImportStatus } from '@/lib/api/dataImports'
import { importTotals, pct, phaseChip, rangeText, slotPhase } from './importFormat'
import { ImportErrorBanner } from './ImportErrorBanner'

// ─── The rows every source's block is made of (M11-c…f) ───────────────────
//
// Built from the Integrations tab's own parts (integrationRows.tsx), so the
// Import tab speaks the same visual language: a 40px logo tile and the service
// header row, a status chip, ruled detail rows, and the setup rail's bar.

/**
 * A source's header row. The logo is in FULL COLOUR, always (owner, Q-M11: "on
 * the settings screen, use the colored logos"): an import source is a tool the
 * customer already uses, and its logo is how they find it. Never Integrations'
 * `grayscale opacity-60` idle treatment.
 */
export function SourceHeader({
  source,
  description,
  note,
  chip,
  action,
}: {
  source: SourceId
  description?: React.ReactNode
  note?: React.ReactNode
  chip?: { tone: ChipTone; label: string } | null
  action?: React.ReactNode
}) {
  const display = SOURCE_DISPLAY[source]
  const control =
    chip || action ? (
      <div className="flex items-center gap-2">
        {chip && (
          <StatusChip tone={chip.tone} dot>
            {chip.label}
          </StatusChip>
        )}
        {action}
      </div>
    ) : undefined
  return (
    <ServiceHeaderRow
      logo={
        <LogoTile colorize>
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed 20px CDN mark, like the /vs pages */}
          <img src={sourceLogoUrl(source)} alt="" className="h-5 w-5" data-testid={`import-logo-${source}`} />
        </LogoTile>
      }
      name={display.label}
      description={description ?? display.how}
      note={note}
      control={control}
    />
  )
}

/** "Delete imported data": the shared destructive outline, never a filled button (§6). */
export function DeleteImportButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="outline" size="sm" className={DESTRUCTIVE_OUTLINE} onClick={onClick} disabled={disabled}>
      Delete imported data
    </Button>
  )
}

/**
 * The setup rail's bar in a settings row: one progress device across the
 * product (SetupRail's hairline), never a second variant.
 */
export function ProgressRow({
  caption,
  left,
  done,
  total,
  label = 'Import progress',
}: {
  caption?: React.ReactNode
  left: string
  done: number
  total: number
  label?: string
}) {
  const value = pct(done, total)
  return (
    <PanelRow label="Progress" caption={caption}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={left}
        className="w-full"
      >
        <RailBar left={left} pct={value} fillTestId="import-progress-fill" />
      </div>
    </PanelRow>
  )
}

/** The skipped rows, as one muted line each (largest first). */
export function skippedText(status: Pick<SiteImportStatus, 'skipped'>): string[] {
  return skipLines([status.skipped?.browser, status.skipped?.server]).map((l) => l.text)
}

/** Done (shot A7): the range, when it finished, how many visitors, what was skipped. */
export function DoneDetails({ status }: { status: SiteImportStatus }) {
  const rows: DetailRow[] = []
  if (status.range_start && status.range_end) rows.push({ label: 'Range', value: rangeText(status.range_start, status.range_end) })
  if (status.finished_at) rows.push({ label: 'Imported', value: formatDateTime(new Date(status.finished_at)), kind: 'date' })
  const totals = importTotals(status.totals)
  if (totals) rows.push({ label: 'Visitors', value: <span className="tabular-nums">{totals.visitors.toLocaleString('en-US')}</span> })
  const skipped = skippedText(status)
  rows.push({
    label: 'Skipped',
    value: skipped.length > 0 ? skipped.map((t) => <span key={t} className="block">{t}</span>) : 'Nothing',
    kind: 'muted',
  })
  return <DetailRows rows={rows} />
}

/** An import that is moving: "Part n of total" from the server's cursor. */
export function serverProgress(status: {
  cursor: SiteImportStatus['cursor'] | null
  steps_total: number | null
}): { done: number; total: number } | null {
  if (!status.steps_total || status.steps_total <= 0) return null
  return { done: Math.min(status.cursor?.step ?? 0, status.steps_total), total: status.steps_total }
}

/**
 * The site's import when no row on this screen drives its source (a source this
 * build has no flow for, or one the server no longer lists): its state, its
 * details, and Delete, so the one-import slot is never held by something the
 * screen cannot show or remove.
 */
export function ImportRecordRow({
  status,
  canManage,
  onRequestDelete,
}: {
  status: SiteImportStatus
  canManage: boolean
  onRequestDelete: () => void
}) {
  const phase = slotPhase(status)
  const chip = phaseChip(phase)
  const range = status.range_start && status.range_end ? rangeText(status.range_start, status.range_end) : undefined
  const action = canManage ? <DeleteImportButton onClick={onRequestDelete} /> : null
  const message = phase === 'failed' || phase === 'stopped' ? failedImportMessage(status, status.source) : null
  const control = (
    <div className="flex items-center gap-2">
      <StatusChip tone={chip.tone} dot>
        {chip.label}
      </StatusChip>
      {action}
    </div>
  )
  return (
    <div data-testid="import-record">
      {isSourceId(status.source) ? (
        <SourceHeader source={status.source} description={range} chip={chip} action={action} />
      ) : (
        <ServiceHeaderRow logo={<LogoTile colorize>{null}</LogoTile>} name={sourceLabel(status.source)} description={range ?? ''} control={control} />
      )}
      {phase === 'completed' && <DoneDetails status={status} />}
      {message && (
        <div className="border-t border-border px-5 py-3.5">
          <ImportErrorBanner message={message} />
        </div>
      )}
    </div>
  )
}
