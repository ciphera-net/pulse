// ─── The Import tab's small, pure helpers (PULSE-118, M11) ─────────────────
//
// Formatting only: every value here is one the server or the plan already
// decided (a range, a status, a count). Nothing is computed that the import
// itself did not say.

import type { InputKind } from '@/lib/import/core/zip'
import { addDays, formatLongDay, spanDays } from '@/lib/view/view'
import type { SiteImportStatus } from '@/lib/api/dataImports'
import type { ChipTone } from '@/components/settings/StatusChip'
import { formatDateTime, formatTime } from '@/lib/utils/formatDate'

/** "1 Jan 2025 to 14 Sep 2026 · 622 days", from a range the plan or the server named. */
export function rangeText(start: string, end: string): string {
  const days = spanDays({ start, end })
  return `${formatLongDay(start)} to ${formatLongDay(end)} · ${days.toLocaleString('en-US')} ${days === 1 ? 'day' : 'days'}`
}

/** The day after a YYYY-MM-DD day, in words ("15 Sep 2026"). */
export function dayAfterText(ymd: string): string {
  return formatLongDay(addDays(ymd, 1))
}

const ACCEPT: Record<InputKind, string> = {
  zip: '.zip,application/zip,application/x-zip-compressed',
  gzip: '.gz,application/gzip',
  plain: '.csv,text/csv',
}

/** The file input's `accept`, from the shapes a source's export arrives in (SOURCE_META.accepts). */
export function acceptFor(kinds: readonly InputKind[]): string {
  return kinds.map((k) => ACCEPT[k]).join(',')
}

/** What the dropzone asks for, from the same shapes: "ZIP file", "CSV file". */
export function fileNounFor(kinds: readonly InputKind[]): string {
  return kinds.includes('zip') ? 'ZIP file' : 'CSV file'
}

/**
 * The totals the browser sent at create (`status.totals`, M2-r). The status object
 * does not re-type them, so they are read defensively: a shape this build does
 * not recognise shows no number rather than a wrong one.
 */
export function importTotals(totals: unknown): { visitors: number; pageviews: number } | null {
  if (!totals || typeof totals !== 'object') return null
  const t = totals as { visitors?: unknown; pageviews?: unknown }
  if (!Number.isInteger(t.visitors) || !Number.isInteger(t.pageviews)) return null
  return { visitors: t.visitors as number, pageviews: t.pageviews as number }
}

/** How the screen treats an import in the site's one slot. */
export type SlotPhase =
  /** A pull import waiting for its site to be chosen (Matomo, M10-c). */
  | 'awaiting_property'
  /** Accepted and moving (pending, running, waiting). */
  | 'active'
  | 'completed'
  /** An upload that went quiet (upload_abandoned): resumable from the same file (M2-j). */
  | 'stopped'
  | 'failed'
  /** A status this build does not know: shown plainly, never guessed at. */
  | 'unknown'

export function slotPhase(s: Pick<SiteImportStatus, 'status' | 'error_code'>): SlotPhase {
  switch (s.status) {
    case 'awaiting_property':
      return 'awaiting_property'
    case 'pending':
    case 'running':
    case 'waiting':
      return 'active'
    case 'completed':
      return 'completed'
    case 'failed':
      return s.error_code === 'upload_abandoned' ? 'stopped' : 'failed'
    default:
      return 'unknown'
  }
}

/** The one chip each phase shows (StatusChip: colour lives in the dot and the word). */
export function phaseChip(phase: SlotPhase, source?: string): { tone: ChipTone; label: string } {
  switch (phase) {
    case 'awaiting_property':
      // §3.12m5a constraint 4: the word is per source. Matomo has sites, GA4 properties.
      return { tone: 'neutral', label: source === 'ga4' ? 'Choose a property' : 'Choose a site' }
    case 'active':
      return { tone: 'info', label: 'Importing' }
    case 'completed':
      return { tone: 'success', label: 'Imported' }
    case 'stopped':
      return { tone: 'danger', label: 'Stopped' }
    case 'failed':
      return { tone: 'danger', label: 'Failed' }
    case 'unknown':
      return { tone: 'neutral', label: 'In progress' }
  }
}

/** Percent done, rounded, for the rail's right-hand number. */
export function pct(done: number, total: number): number {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)))
}

/** The calendar day (y, m, d) an instant falls on in a zone. */
function dayIn(d: Date, zone: string): string {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/**
 * When a GA4 quota wait lifts (W-M5-15): "14:00" today, "tomorrow at 09:00" on
 * the next calendar day, both in the viewer's display zone. A wait further out
 * (none is expected: the daily quota lifts at Pacific midnight) names the full
 * date and time. Null for a value that is not an instant.
 */
export function waitUntilText(iso: string | null | undefined, now: Date, zone: string): string | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const day = dayIn(at, zone)
  if (day === dayIn(now, zone)) return formatTime(at, zone)
  const [y, m, d] = dayIn(now, zone).split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  if (day === next) return `tomorrow at ${formatTime(at, zone)}`
  return formatDateTime(at, zone)
}

/** A share of pageviews (0 to 1) as a percent with one decimal, and no trailing ".0" (W-M5-9). */
export function shareText(share: number): string {
  const v = Number.isFinite(share) ? Math.max(0, Math.min(1, share)) * 100 : 0
  return `${v.toFixed(1).replace(/\.0$/, '')}%`
}

/** "a and b, 99.3% of pageviews" (W-M5-11): the kept hostnames and their share together. */
export function hostsSummary(kept: readonly { host: string; share: number }[]): string {
  const names = kept.map((k) => k.host)
  const list = names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  const total = kept.reduce((a, k) => a + (Number.isFinite(k.share) ? k.share : 0), 0)
  return `${list}, ${shareText(total)} of pageviews`
}
