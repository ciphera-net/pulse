'use client'

import { InfoTip } from '@ciphera-net/facet'
import { DIMENSION_TERM, METRIC_TERMS, TERMS, docsHref, type GlossaryTerm } from '@/lib/dashboard/terms'
import type { MetricType } from '@/lib/dashboard/metrics'
import type { EngagementPercentilesData, Stats } from '@/lib/api/stats'
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

/** The InfoTip for a non-deck term (instrument metric, provenance caveat). */
export function TermInfoTip({
  term: key,
  example,
  className,
  glyphSize,
}: {
  term: keyof typeof TERMS | string
  example?: React.ReactNode
  className?: string
  glyphSize?: number
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
      glyphSize={glyphSize}
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
  engagement?: EngagementPercentilesData | null,
): React.ReactNode | undefined {
  if (metric === 'engagement') {
    const s = engagement?.summary
    if (!s || (engagement?.data_days ?? 0) < 7) return undefined
    return (
      <>
        <b>{Math.round(s.score)}</b> — scroll {Math.round(s.scroll_pctl)} · time{' '}
        {Math.round(s.time_pctl)} · depth {Math.round(s.depth_pctl)} · bounce{' '}
        {Math.round(s.bounce_pctl)}, median over the period against this site’s prior 90 days
      </>
    )
  }

  if (!stats) return undefined

  if (metric === 'bounce_rate') {
    const bounced = stats.bounce_sessions
    if (bounced == null || stats.bounce_rate == null || stats.visitors <= 0) return undefined
    return (
      <>
        <b>{Math.round(stats.bounce_rate)}%</b> — {formatNumber(bounced)} of{' '}
        {formatNumber(stats.visitors)} sessions saw exactly one page
      </>
    )
  }

  if (metric === 'avg_duration') {
    const measured = stats.duration_measured_sessions
    if (measured == null || stats.visitors <= 0) return undefined
    const excluded = Math.max(0, stats.visitors - measured)
    return (
      <>
        Measured over <b>{formatNumber(measured)}</b> sessions that carried a duration signal
        {excluded > 0 ? (
          <> — {formatNumber(excluded)} had none and are excluded, not counted as zero</>
        ) : null}
      </>
    )
  }

  return undefined
}
