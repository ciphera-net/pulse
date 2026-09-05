'use client'

import { Sparkline } from '@/components/ui/sparkline'

// ---------------------------------------------------------------------------
// The KPI tile mini chart, in the big chart's language (sharp-chart round,
// 01-09-2026, artifact "The Sharp Line" — M1 "lifted" pick). The drawing
// itself lives in components/ui/sparkline.tsx since the chart-consistency
// round (05-09-2026); this wrapper is the deck's METRIC EXTRACTION:
//
//   - M1 lift: the series max rises to ~4px below the svg top (just under
//     the tile's label row), grounded at the tile floor — never floaty.
//   - Gaps follow THE BIG CHART's per-metric rule (owner report 01-09-2026:
//     the bounce/duration minis looked "nothing like the real charts"): a
//     metric the deck plots missing-as-zero anchors its empty buckets at the
//     floor here too, so the mini is the big chart in miniature. Only
//     unflagged metrics keep the old compress-the-gap behaviour.
//   - pages_per_visit: the precomputed series wins (the deck divides by
//     VISITS, migration-164 rule) — the mini must plot the same series the
//     big chart plots, never re-derive it per person.
// ---------------------------------------------------------------------------

export type SparkMetric = 'visitors' | 'pageviews' | 'pages_per_visit' | 'bounce_rate' | 'avg_duration'

export default function RailSparkline({ data, dataKey, active, dashedTail = false, missingAsZero = false }: {
  data: {
    pageviews: number
    visitors: number
    bounce_rate: number | null
    avg_duration: number | null
    /** Precomputed by the consumer's chart pipeline (the deck divides by
     *  VISITS, migration-164 rule). When present it wins — the mini must
     *  plot the same series the big chart plots, never re-derive it. */
    pages_per_visit?: number | null
  }[]
  dataKey: SparkMetric
  active: boolean
  /** The range ends now — dash the final segment like the big chart. */
  dashedTail?: boolean
  /** Plot a null bucket at zero, exactly like the big chart's flag for this
   *  metric — the mini must draw the same shape the chart draws. */
  missingAsZero?: boolean
}) {
  if (data.length < 2) return null
  const values = data.map((d) =>
    dataKey === 'pages_per_visit'
      ? d.pages_per_visit !== undefined
        ? d.pages_per_visit
        : (d.visitors > 0 ? d.pageviews / d.visitors : 0)
      : (d[dataKey] as number | null)
  )

  return (
    <Sparkline
      active={active}
      className="absolute bottom-0 left-0 right-0 w-full z-0 transition-opacity duration-base opacity-30 group-hover:opacity-60 ease-apple"
      dashedTail={dashedTail}
      height={52}
      missingAsZero={missingAsZero}
      padBottom={2}
      padTop={4}
      style={{ height: 52 }}
      values={values}
    />
  )
}
