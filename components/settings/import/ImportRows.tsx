'use client'

import { Button } from '@ciphera-net/facet'
import { KitRow, KitStatus } from '@/components/settings/kit/Kit'
import type { ChipTone } from '@/components/settings/StatusChip'
import { DESTRUCTIVE_OUTLINE } from '@/components/settings/unified/DangerZone'
import { SOURCE_DISPLAY, sourceLogoUrl, type SourceId } from '@/lib/import/source-display'
import { skipLines } from '@/lib/import/messages'
import type { SiteImportStatus } from '@/lib/api/dataImports'
import { cn } from '@/lib/utils'
import { pct } from './importFormat'

// ─── The rows every source's block is made of, in the settings kit (R51: option B, 07-11-2026) ─────────────────
//
// An import is one kit row, as a connected service is (R24, R32): the tool's own mark and name, its state leading
// the caption as a dot and words, its button on the row's right edge. While an import moves, its progress lives in
// that same row: a line under the caption, and the row's hairline filling orange as the parts land. Everything a
// step asks or says sits under the row as kit rows, with no boxes and no strips.

export interface SourceHeaderProps {
  source: SourceId
  /** The caption's line after the state; the source's own "how" when not given. */
  description?: React.ReactNode
  /** A second caption line: a failure's reason, a note that matters now. */
  note?: React.ReactNode
  chip?: { tone: ChipTone; label: string } | null
  action?: React.ReactNode
  /** An import that is moving: its line under the caption, and the fill of the row's hairline. */
  progress?: { done: number; total: number; line: string } | null
}

/** The flows' chip as R24 and R32 draw a state: orange while it moves or is done, coral when it failed, grey else. */
export function statusTone(chip: { tone: ChipTone; label: string }): 'live' | 'off' | 'broken' {
  if (chip.label === 'Stopped') return 'off'
  if (chip.tone === 'danger') return 'broken'
  if (chip.tone === 'success' || chip.tone === 'info') return 'live'
  return 'off'
}

/** The tool's own mark, in full colour (R9; owner, Q-M11: "on the settings screen, use the colored logos"). */
export function SourceLogo({ source }: { source: SourceId }) {
  // eslint-disable-next-line @next/next/no-img-element -- a fixed 16 px CDN mark
  return <img src={sourceLogoUrl(source)} alt="" className="h-4 w-4" data-testid={`import-logo-${source}`} />
}

/** "Part 5 of 12": an import's place, from the parts it has sent. */
export function partText(done: number, total: number): string {
  return `Part ${done.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`
}

/** A source's own row: the mark and name, the state leading the caption, and, while it moves, its progress. */
export function SourceHeader({ source, description, note, chip, action, progress }: SourceHeaderProps) {
  const line = description ?? SOURCE_DISPLAY[source].how
  const row = (
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
          {progress && (
            <span data-import-progress="line" className="mt-1 block tabular-nums">
              {progress.line}
            </span>
          )}
        </>
      }
      control={action ?? undefined}
    />
  )
  if (!progress) return row
  const value = pct(progress.done, progress.total)
  return (
    <div className="relative">
      {row}
      {/* Over the row's own hairline, edge to edge: 2 px, filling orange as the parts land. */}
      <div
        role="progressbar"
        aria-label="Import progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={progress.line}
        data-import-progress="hairline"
        className="absolute inset-x-0 -bottom-px z-10 h-0.5 bg-border"
      >
        <div
          className="h-0.5 bg-primary transition-[width] duration-base ease-apple motion-reduce:transition-none"
          style={{ width: `${value}%` }}
          data-testid="import-progress-fill"
        />
      </div>
    </div>
  )
}

/** "Delete imported data": the shared destructive outline, never a filled button. */
export function DeleteImportButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="outline" size="sm" className={DESTRUCTIVE_OUTLINE} onClick={onClick} disabled={disabled} aria-haspopup="dialog">
      Delete imported data
    </Button>
  )
}

/** A step's buttons: a row of their own, 16 px top and bottom, ending on the section's right edge. */
export function StepActions({ children }: { children: React.ReactNode }) {
  return (
    <div data-import-actions="" className="flex items-center justify-end gap-2 py-4">
      {children}
    </div>
  )
}

/** The lines of a list value, one per line (Imported, Not imported, Skipped). */
export function Lines({ lines, muted = false, className }: { lines: readonly string[]; muted?: boolean; className?: string }) {
  return (
    <span className={cn('block text-sm', muted ? 'text-muted-foreground' : 'text-foreground', className)}>
      {lines.map((t) => (
        <span key={t} className="block">
          {t}
        </span>
      ))}
    </span>
  )
}

/** The skipped rows, as one muted line each (largest first). */
export function skippedText(status: Pick<SiteImportStatus, 'skipped'>): string[] {
  return skipLines([status.skipped?.browser, status.skipped?.server]).map((l) => l.text)
}

/** An import that is moving: "Part n of total" from the server's cursor. */
export function serverProgress(status: {
  cursor: SiteImportStatus['cursor'] | null
  steps_total: number | null
}): { done: number; total: number } | null {
  if (!status.steps_total || status.steps_total <= 0) return null
  return { done: Math.min(status.cursor?.step ?? 0, status.steps_total), total: status.steps_total }
}
