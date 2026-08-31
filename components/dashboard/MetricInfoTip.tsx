'use client'

import { InfoTip } from '@ciphera-net/facet'
import { DIMENSION_TERM, METRIC_TERMS, TERMS, docsHref, type GlossaryTerm } from '@/lib/dashboard/terms'
import type { MetricType } from '@/lib/dashboard/metrics'
import type { Stats } from '@/lib/api/stats'
import { formatNumber } from '@/lib/utils/format'

// ---------------------------------------------------------------------------
// The product's InfoTip call site (metric info layer, design record
// 22-08-2026). Two thin wrappers over facet's primitive so every glyph in the
// product is placed the same way and reads from the one copy registry.
//
// PLACEMENT: a glyph belongs where a metric's NAME labels a whole surface —
// the chart toolbar's active-metric label, a card's unit label, a panel
// header, a provenance term. Never on repeated value rows: rail rows carry
// their sentence via aria-describedby (the row is already a button, and a
// glyph inside it would be a control inside a control).
//
// EXAMPLES: the worked-example inset exists to supply the denominator a rate
// never shows. Every number in it comes from the API — buildExample returns
// undefined when the server did not send the count, so an inset is never
// arithmetic invented in the browser.
// ---------------------------------------------------------------------------

interface MetricInfoTipProps {
  metric: MetricType
  example?: React.ReactNode
  className?: string
}

/** The InfoTip for one of the deck's six metrics. */
export function MetricInfoTip({ metric, example, className }: MetricInfoTipProps) {
  const term = METRIC_TERMS[metric]
  if (!term) return null
  return (
    <InfoTip
      title={term.title}
      definition={term.definition}
      example={example}
      learnMoreHref={docsHref(term)}
      glyphClassName={className}
    />
  )
}

/**
 * The InfoTip for a dimension card — it explains WHAT THE CARD SHOWS, keyed on
 * the card's active tab, not on the rail's selected metric.
 *
 * This is the whole point of the fix: a glyph must say something the reader
 * cannot already read off the label beside it, and no two glyphs on a screen
 * may resolve to the same sentence. Keying these on the rail metric produced
 * six identical "unique visitors" panels across the dashboard.
 *
 * No registry entry for a tab means NO glyph for that tab — a card whose tabs
 * are only partly covered simply shows the glyph where it has something to
 * say. (Silence is honest; a glyph that opens the wrong sentence is not.)
 *
 * 🔴 The tab id a card holds in state is NOT the registry key (`source` vs
 * `utm_source`, `top_pages` vs `pages`, `scroll` vs `scroll_depth`), so the
 * resolution goes through DIMENSION_TERM. Skipping it does not error — it
 * renders no glyph at all, which is how Campaigns and Content shipped bare.
 */
export function DimensionInfoTip({ tab, className }: { tab: string; className?: string }) {
  return <TermInfoTip term={DIMENSION_TERM[tab] ?? tab} className={className} />
}

/**
 * The InfoTip for a non-deck term (instrument metric, provenance caveat).
 *
 * Deliberately takes NO size prop: the glyph is one identity estate-wide
 * (14px bold, facet's default), and the round-2 size decision reached only
 * the dashboard precisely because instrument call sites had pinned their own
 * 12px override hours earlier. `className` stays for PLACEMENT (margins),
 * never identity — size, weight and colour belong to the component.
 */
export function TermInfoTip({
  term: key,
  example,
  className,
}: {
  term: keyof typeof TERMS | string
  example?: React.ReactNode
  className?: string
}) {
  const term: GlossaryTerm | undefined = TERMS[key]
  // No entry, no glyph — the registry gate, enforced before render.
  if (!term) return null
  return (
    <InfoTip
      title={term.title}
      definition={term.definition}
      example={example}
      learnMoreHref={docsHref(term)}
      glyphClassName={className}
    />
  )
}

/**
 * The worked example for a metric, built ONLY from values the server sent.
 *
 * Returns undefined when the inputs are missing — a rate whose numerator did
 * not arrive gets no inset rather than a numerator multiplied out in the
 * browser, which would mint a count the server never produced.
 */
export function buildExample(
  metric: MetricType,
  stats: Stats | undefined,
): React.ReactNode | undefined {
  if (!stats) return undefined

  // * Both examples divide by VISITS, never by `visitors`. Since migration 163
  // * `visitors` counts PEOPLE (deduplicated monthly), while both rates describe
  // * one visit — a 30-minute-inactivity run since the 26-08 visits split.
  // * Dividing a visit numerator by people printed a fraction that could not
  // * produce the rate beside it, so the denominator comes from the server's own
  // * `visits` field or the example is omitted entirely.
  if (metric === 'bounce_rate') {
    const bounced = stats.bounce_visits
    const visits = stats.visits
    if (bounced == null || visits == null || stats.bounce_rate == null || visits <= 0) return undefined
    return (
      <>
        <b>{Math.round(stats.bounce_rate)}%</b> — {formatNumber(bounced)} of{' '}
        {formatNumber(visits)} visits recorded exactly one pageview
      </>
    )
  }

  if (metric === 'avg_duration') {
    const measured = stats.duration_measured_visits
    const visits = stats.visits
    if (measured == null || visits == null || visits <= 0) return undefined
    const excluded = Math.max(0, visits - measured)
    return (
      <>
        Measured over <b>{formatNumber(measured)}</b> visits that carried a duration signal
        {excluded > 0 ? (
          <> — {formatNumber(excluded)} had none and are excluded, not counted as zero</>
        ) : null}
      </>
    )
  }

  return undefined
}
