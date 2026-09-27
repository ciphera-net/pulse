// ─── Skipped rows: counted by reason, never silent, never content ──────────
//
// §3.12: an importer that drops rows without saying so is the failure mode the
// category ships, and Pulse's no-silent-failure rule forbids it. Every row the
// browser does not send is counted here under a named reason, with up to five
// sample LINE NUMBERS per reason so the customer can find them in their own file.
//
// 🔴 Never the row's content. A sample is a file and a line number, nothing
// read from the line, so the report can be shown, logged or copied without
// carrying a single value out of the export. The counts (not the samples) go to
// the server with the create request (M2-r), and only for display and audit.

/**
 * The reasons this library produces. The server adds its own on the batches it
 * applies (`collection_off`, `invalid_path`, `page_rule_excluded`); those arrive
 * as plain strings and are reported as the server sent them.
 */
export type SkipReason =
  /** Before the site's history window (D3), or past its end when Pulse has not measured it. */
  | 'outside_history_window'
  /** A day Pulse has already measured itself (after the first counted pageview). */
  | 'pulse_measured'
  /** A region or city the source names only by code (M2-o, until M6's place-name index). */
  | 'needs_place_names'
  | 'bad_timestamp'
  | 'not_a_pageview'
  | 'bot_row'
  | 'missing_field'
  /** A count that is not a whole number between 0 and 1,000,000,000 (M2-k). */
  | 'bad_number'
  /**
   * A per-dimension row dated outside the range of the export's site-totals
   * file (M7-g, Fathom's separately downloaded files). Not wrong, but a day
   * with a breakdown and no total is not one Pulse creates.
   */
  | 'outside_totals_range'
  /**
   * A row naming a different website's export (M9-j, Simple Analytics' raw
   * datapoints, which carry their own `hostname` column per row).
   */
  | 'hostname_mismatch'

export const MAX_SAMPLES_PER_REASON = 5

export interface SkipSample {
  /** The entry the row came from, as named inside the archive. */
  file: string
  /** 1-based physical line where the row starts (the header is line 1). */
  line: number
}

export interface RowRef {
  file: string
  line: number
}

export class SkipLedger {
  private readonly counts = new Map<SkipReason, number>()
  private readonly samples = new Map<SkipReason, SkipSample[]>()

  /** Count `n` rows skipped for `reason`; `at` names where the first of them sits. */
  add(reason: SkipReason, at: RowRef | null, n = 1): void {
    if (n <= 0) return
    this.counts.set(reason, (this.counts.get(reason) ?? 0) + n)
    if (!at) return
    let list = this.samples.get(reason)
    if (!list) {
      list = []
      this.samples.set(reason, list)
    }
    if (list.length < MAX_SAMPLES_PER_REASON) list.push({ file: at.file, line: at.line })
  }

  total(): number {
    let sum = 0
    for (const n of this.counts.values()) sum += n
    return sum
  }

  /** Counts by reason, keys sorted so the object serialises the same way every time. */
  toCounts(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const reason of [...this.counts.keys()].sort()) out[reason] = this.counts.get(reason) as number
    return out
  }

  toSamples(): Record<string, SkipSample[]> {
    const out: Record<string, SkipSample[]> = {}
    for (const reason of [...this.samples.keys()].sort()) {
      out[reason] = (this.samples.get(reason) as SkipSample[]).map((s) => ({ ...s }))
    }
    return out
  }
}
