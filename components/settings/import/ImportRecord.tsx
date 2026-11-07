'use client'

import { useState } from 'react'
import { Button } from '@ciphera-net/facet'
import { KitBlock, KitRow, KitRows, KitStatus } from '@/components/settings/kit/Kit'
import { DESTRUCTIVE_OUTLINE } from '@/components/settings/unified/DangerZone'
import { dayText } from '@/components/settings/pages/data/words'
import { failedImportMessage } from '@/lib/import/messages'
import { MATOMO_GUIDE, isSourceId, sourceLabel } from '@/lib/import/source-display'
import type { SiteImportStatus } from '@/lib/api/dataImports'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { formatLongDay } from '@/lib/view/view'
import { importTotals, phaseChip, rangeText, slotPhase } from './importFormat'
import { SourceLogo, skippedText, statusTone } from './ImportRows'

/** W3 A (owner, Q-M11): the dashboard's cache can hold pre-import numbers for up to a minute. */
export const CACHE_NOTE = 'It can take a minute before the dashboard shows the imported days.'
/** How long after completion the cache note is still worth saying (the cache TTL is 60 s). */
export const CACHE_NOTE_FOR_MS = 10 * 60 * 1000

/** "1 Jan 2025 to 14 Sep 2026": the range as the row's caption says it (the days count is in Details). */
function shortRange(status: SiteImportStatus): string | null {
  return status.range_start && status.range_end ? `${formatLongDay(status.range_start)} to ${formatLongDay(status.range_end)}` : null
}

/**
 * The settled import, as the approved drawing has it (R24, R32): its mark and name; the status leading the caption
 * (Imported 3 Nov in orange, Failed in coral, a state this build does not know in grey) and the range; Details, and
 * Delete imported data for owners and admins. A failure's reason is the line under the caption, as a service's problem
 * line is. The flows draw a finished or failed import with it too, so the row never changes look when the page hands
 * the import from its flow to this record.
 */
export function ImportRecord({
  status,
  canManage,
  onRequestDelete,
  now = new Date(),
}: {
  status: SiteImportStatus
  canManage: boolean
  onRequestDelete: () => void
  now?: Date
}) {
  const [details, setDetails] = useState(false)
  const { zone } = useDisplayZone()
  const phase = slotPhase(status)
  const source = isSourceId(status.source) ? status.source : null
  const failure = phase === 'failed' ? failedImportMessage(status, status.source, now) : null
  const finished = status.finished_at ? new Date(status.finished_at).getTime() : null
  // Right after an import the dashboard can lag a minute behind (its cache), as the flows have always said.
  const fresh = phase === 'completed' && (finished === null || now.getTime() - finished < CACHE_NOTE_FOR_MS)
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
