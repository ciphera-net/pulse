import type { MetricType } from '@/lib/dashboard/metrics'

// ---------------------------------------------------------------------------
// The copy registry behind every InfoTip in the product (metric info layer,
// design record 22-08-2026). One entry per DEFINABLE TERM: the canonical
// sentence, an optional glossary anchor, and — for terms whose definition is
// easier to read as arithmetic — an example built from SERVER-supplied values.
//
// This module is the single source for those sentences: CommandDeck's rail
// reads them from here rather than carrying its own copies, so the rail's
// aria-describedby text and the InfoTip panels can never drift apart.
//
// Two rules the lint enforces (lib/dashboard/__tests__/glossary.test.ts):
//   * A glyph renders only from an entry here — no sentence, no glyph. The
//     component enforces it too (a nullish `definition` renders nothing), so
//     a missing entry is a silent absence, never a promise of copy that does
//     not exist.
//   * `learnMoreHref` is present only for terms the glossary actually
//     publishes — a footer link that 404s is worse than no footer.
// ---------------------------------------------------------------------------

const GLOSSARY_BASE = 'https://help.ciphera.net/glossary'

export interface GlossaryTerm {
  /** Title shown on a pinned panel. */
  title: string
  /** The canonical sentence. */
  definition: string
  /** Anchor slug on the glossary page; omitted while a term is unpublished. */
  anchor?: string
}

/**
 * Deck metrics. These six sentences are the product's canonical wording and
 * are duplicated nowhere else — CommandDeck imports them from here.
 */
export const METRIC_TERMS: Record<MetricType, GlossaryTerm> = {
  visitors: {
    title: 'Unique visitors',
    definition:
      'Distinct sessions, deduplicated across the range. A session lasts one UTC day, so a returning reader counts once per day they visit.',
    anchor: 'unique-visitors',
  },
  pageviews: {
    title: 'Total pageviews',
    definition: 'Every pageview in the range.',
    anchor: 'total-pageviews',
  },
  pages_per_visit: {
    title: 'Pages / visit',
    definition: 'Pageviews divided by unique visitors.',
    anchor: 'pages-per-visit',
  },
  bounce_rate: {
    title: 'Bounce rate',
    definition:
      'Share of sessions that saw exactly one page. Deltas are percentage points.',
    anchor: 'bounce-rate',
  },
  avg_duration: {
    title: 'Visit duration',
    definition:
      'Average session duration over sessions that carried a duration signal — unmeasured sessions are excluded, not counted as zero.',
    anchor: 'visit-duration',
  },
  engagement: {
    title: 'Engagement',
    definition:
      'Median daily percentile of scroll depth, time on page, visit depth and bounce rate, ranked against this site’s prior 90 days. 50 means a typical day for this site.',
    anchor: 'engagement',
  },
}

/**
 * Terms outside the deck: instrument metrics and the provenance caveats that
 * say how a number was recorded. Keyed by a stable slug, not a metric type.
 */
export const TERMS: Record<string, GlossaryTerm> = {
  availability: {
    title: 'Availability',
    definition:
      'The share of uptime checks that succeeded across the range. Days are your site’s calendar days.',
    anchor: 'availability',
  },
  response_time: {
    title: 'Response time',
    definition:
      'Average response time of successful checks. p50 and p95 come from raw checks, which are kept for 90 days — older periods show an em dash rather than an invented number.',
    anchor: 'response-time',
  },
  checks: {
    title: 'Checks',
    definition: 'Every uptime check run in the range.',
    anchor: 'checks',
  },
  incidents: {
    title: 'Incidents',
    definition:
      'Confirmed status changes — the durable downtime record. Raw checks are purged after 90 days; incidents are kept.',
    anchor: 'incidents',
  },
  recent_checks: {
    title: 'Recent checks',
    definition:
      'The most recent raw checks: when each ran, the status code it saw and how long it took.',
    anchor: 'checks',
  },
  site_timezone: {
    title: 'Site timezone',
    definition:
      'Days on this page are your site’s calendar days. Days at or before the labelled boundary were recorded as UTC days and their raw checks have been purged, so they can never be re-cut.',
    anchor: 'site-timezone',
  },
}

/** The glossary URL for a term, or undefined while the term is unpublished. */
export function glossaryHref(term: GlossaryTerm): string | undefined {
  return term.anchor ? `${GLOSSARY_BASE}#${term.anchor}` : undefined
}

/**
 * Uptime rail metrics → their registry key. Coverage here is ALL-OR-NONE: a
 * rail whose siblings carry no sentence would read as a bug, not as a gap.
 */
export const UPTIME_TERM: Record<string, string> = {
  availability: 'availability',
  response: 'response_time',
  checks: 'checks',
}
