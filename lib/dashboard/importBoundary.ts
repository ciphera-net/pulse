// ─── Where imported history shows on the dashboard (PULSE-118, M11-h) ──────
//
// Dashboard option 2 (owner ruling Q-M11): a dashed line at the first measured
// day labelled "← imported from {Tool}", a word in the rail, a note beside the
// Filter button on a filtered view, and a footnote on a card whose dimension the
// import lacks.
//
// 🔴 SERVER-SAID ONLY. Every function here reads the response's own provenance
// (`imported`, `imported_cards`, lib/api/stats.ts). Nothing is inferred from the
// dates on the client: a site with no import, or a range that touches none,
// answers `included: false` with nulls, and every mark below is then absent.

import type { ImportedProvenance } from '@/lib/api/stats'
import { addDays, formatDay } from '@/lib/view/view'
import { sourceDisplay, sourceLabel, type ImportedDimension } from '@/lib/import/source-display'

/**
 * The first measured day, when the chart should mark it: the response includes
 * imported days, and the day after the last of them falls inside the chart's
 * range. A range that is all imported (the boundary past its end) or that the
 * response did not merge (`included: false`) draws nothing.
 */
export function importBoundaryDay(
  imported: ImportedProvenance | null | undefined,
  range: { start: string; end: string } | null | undefined,
): string | null {
  if (!imported?.included || !imported.through || !range) return null
  const day = addDays(imported.through, 1)
  return day >= range.start && day <= range.end ? day : null
}

/**
 * The boundary as the chart's x value. The deck plots the SITE's wall clock as
 * UTC fields (parseSiteWallClock), so a day is its UTC midnight.
 */
export function importBoundaryX(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** The line's label: what lies to its LEFT. */
export function importBoundaryLabel(imported: ImportedProvenance | null | undefined): string {
  return `← imported from ${sourceLabel(imported?.source)}`
}

/**
 * The rail's word: the current period, or the one it is compared with, includes
 * imported days (M11-h). Either side is enough, because a delta across the
 * boundary compares two instruments.
 */
export function railIncludesImported(
  current: ImportedProvenance | null | undefined,
  previous: ImportedProvenance | null | undefined,
): boolean {
  return Boolean(current?.included || previous?.included)
}

/** A filtered view leaves the imported days out (filters apply to Pulse-measured visits only). */
export function importLeftOutByFilter(imported: ImportedProvenance | null | undefined): boolean {
  return imported?.reason === 'filtered'
}

/** How a card's dimension reads at the start of a sentence. */
export const DIMENSION_WORDS: Readonly<Record<ImportedDimension, string>> = {
  page: 'Pages',
  entry_page: 'Entry pages',
  exit_page: 'Exit pages',
  referrer: 'Referrers',
  channel: 'Channels',
  campaign: 'Campaigns',
  country: 'Countries',
  region: 'Regions',
  city: 'Cities',
  device: 'Devices',
  browser: 'Browsers',
  os: 'Operating systems',
  language: 'Languages',
  screen_resolution: 'Screen sizes',
}

/**
 * The footnote for a card whose dimension the import holds no rows for while
 * the range overlaps it (`surface_unsupported`): "Languages before 15 Sep aren't
 * in the import." plus, when the source's metadata knows why, "Plausible
 * doesn't export them." Null for every other state, so the card says nothing.
 */
export function cardImportNote(
  card: ImportedProvenance | null | undefined,
  dimension: ImportedDimension | null,
  currentYear: number,
): string | null {
  if (!dimension || card?.reason !== 'surface_unsupported' || !card.through) return null
  const before = formatDay(addDays(card.through, 1), currentYear)
  const note = `${DIMENSION_WORDS[dimension]} before ${before} aren't in the import.`
  const display = sourceDisplay(card.source)
  return display?.lacks.includes(dimension) ? `${note} ${display.label} doesn't export them.` : note
}
