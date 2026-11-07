'use client'

import { KitRow, KitStats } from '@/components/settings/kit/Kit'
import { formatLongDay } from '@/lib/view/view'
import { Lines } from './ImportRows'

// ─── The check before an import starts (R51, option B: "Figures and a table", 07-11-2026) ──────────────────────
//
// The three numbers that decide an import are figures (KitStats, as General's and Billing's), with the dates and the
// timezone under them; then what comes across and what doesn't, side by side; then what is worth knowing. Each part
// is one child of the step's KitRows, so the hairlines between them are the kit's.

const num = (n: number) => n.toLocaleString('en-US')

export interface Figures {
  days: number
  visitors: number
  pageviews: number
}

/** "18 Sep 2026 to 27 Sep 2026": the range's two days, as the line under the figures names them. */
export function daysText(start: string, end: string): string {
  return `${formatLongDay(start)} to ${formatLongDay(end)}`
}

/**
 * Days, Visitors and Pageviews over the line that says which days and in which timezone. `null` while the numbers
 * are being read: the labels stay, and each figure says so, so nothing moves when they land.
 */
export function CheckFigures({ figures, line }: { figures: Figures | null; line?: React.ReactNode }) {
  const value = (n: number | undefined) =>
    figures && n !== undefined ? num(n) : <span className="text-sm font-normal tracking-normal text-muted-foreground">Loading…</span>
  return (
    <div data-import-figures="" aria-busy={figures ? undefined : true}>
      <KitStats
        items={[
          { label: 'Days', value: value(figures?.days) },
          { label: 'Visitors', value: value(figures?.visitors) },
          { label: 'Pageviews', value: value(figures?.pageviews) },
        ]}
      />
      {figures && line && (
        <p data-import-figures-line="" className="max-w-[72ch] pb-4 text-xs text-muted-foreground">
          {line}
        </p>
      )}
    </div>
  )
}

/** What comes across and what doesn't, side by side (stacked on a phone). */
export function CheckLists({ imported, notImported }: { imported: readonly string[]; notImported: readonly string[] }) {
  return (
    <div data-import-lists="" className="grid grid-cols-1 gap-x-6 gap-y-4 py-4 md:grid-cols-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Imported</p>
        <Lines lines={imported} className="mt-1.5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Not imported</p>
        <Lines lines={notImported} muted className="mt-1.5" />
      </div>
    </div>
  )
}

/** How the imported numbers differ from Pulse's own, as a row of small lines. */
export function WorthKnowingRow({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null
  return (
    <KitRow label="Worth knowing">
      <span className="block text-xs text-muted-foreground">
        {lines.map((t) => (
          <span key={t} className="mb-1 block last:mb-0">
            {t}
          </span>
        ))}
      </span>
    </KitRow>
  )
}
