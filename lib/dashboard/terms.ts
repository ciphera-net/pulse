import type { MetricType } from '@/lib/dashboard/metrics'

// ---------------------------------------------------------------------------
// The copy registry behind every InfoTip (metric info layer).
//
// Two forms of every definition exist. The SHORT one lives here and goes in
// the panel: at most a couple of lines, carrying the one thing a reader would
// otherwise be wrong about. The FULL one lives in the Pulse documentation,
// which is where `Learn more →` goes — the docs pages already existed, so a
// second home for the same sentences would only rot.
//
// Two rules the lint enforces (lib/dashboard/__tests__/terms.test.ts):
//   * A glyph renders only from an entry here — no sentence, no glyph. The
//     component enforces it too (a nullish `definition` renders nothing).
//   * A term whose definition would only restate its own label gets NO entry.
//     A glyph that teaches nothing is worse than no glyph: it costs a click
//     and returns what the reader could already see.
// ---------------------------------------------------------------------------

const DOCS = 'https://help.ciphera.net/docs/pulse'

export interface GlossaryTerm {
  /** Title shown at the top of the panel. */
  title: string
  /** The SHORT definition — panel copy, not documentation. */
  definition: string
  /** `page#anchor` in the Pulse docs; omitted while a term is unpublished. */
  docs?: string
}

/** The deck's six metrics — the rail, and the chart toolbar's active metric. */
export const METRIC_TERMS: Record<MetricType, GlossaryTerm> = {
  visitors: {
    title: 'Unique visitors',
    definition:
      "People, not visits: a returning reader counts once. Identity is deduplicated within each calendar month in your site's timezone, so a range that spans months counts a returning reader once per month. Before 26 Aug 2026, deduplication was per day.",
    docs: 'dashboard#unique-visitors',
  },
  pageviews: {
    title: 'Total pageviews',
    definition:
      'Every page load in the range, bots and excluded traffic removed — a reload counts again.',
    docs: 'dashboard#total-pageviews',
  },
  pages_per_visit: {
    title: 'Pages / visit',
    definition:
      'Pageviews divided by visits — how many pages someone reads before they stop. A returning reader adds a second visit rather than deepening the first.',
    docs: 'dashboard#pages-per-visit',
  },
  bounce_rate: {
    title: 'Bounce rate',
    definition:
      'Share of visits with exactly one pageview — a reload counts as a second, so it ends the bounce. A visit ends after 30 minutes of inactivity. Deltas are percentage points.',
    docs: 'dashboard#bounce-rate',
  },
  avg_duration: {
    title: 'Visit duration',
    definition:
      'Average length of a visit — the time its pages were visible and in use. The clock pauses while the tab is hidden and after two minutes without scrolling, clicking or typing, so a tab left open does not count. Unmeasured visits are excluded, not counted as zero. A visit ends after 30 minutes of inactivity.',
    docs: 'dashboard#visit-duration',
  },
}

/**
 * Everything else: dimension-card tabs, instrument metrics, and the
 * provenance caveats that say how a number was recorded. Keyed by a stable
 * TERM slug, so the glyph explains the card the reader is looking at rather
 * than the metric the rail happens to hold.
 *
 * 🔴 The slug is NOT the id a dimension card holds in state — Campaigns holds
 * `source`, ContentStats holds `top_pages`, ContentSignals holds `scroll`.
 * Handing a raw tab id straight to the registry resolves to nothing and the
 * gate then fails SILENT (no glyph, no error, no failing test). Every card
 * resolves through DIMENSION_TERM below.
 */
export const TERMS: Record<string, GlossaryTerm> = {
  // The Visitors surface. Both entries exist to say the SAME thing the metric
  // glossary's `visitors` entry says, at the surface where a reader is looking
  // at individual rows and is most likely to assume more permanence than there
  // is — one sentence family, three places, no third definition.
  visitor_identity: {
    title: 'Visitor identity',
    definition:
      'A pseudonym derived server-side from a monthly key, scoped to this site. It cannot be linked to a person, to another site, or to the same reader next month — the key is re-minted at the start of each calendar month in your site’s timezone, so a returning reader becomes a new visitor. There is no cookie and nothing stored on their device.',
  },
  visitor_month_reset: {
    title: 'Monthly reset',
    definition:
      'Identities reset on the first day of each calendar month in your site’s timezone. A range that spans a boundary therefore shows a returning reader once per month, under two different names — that is the identity genuinely resetting, not a duplicate.',
  },
  availability: {
    title: 'Availability',
    definition:
      'The share of uptime checks that came back healthy across the range. A degraded check — an unexpected status code under 500, or a response slower than 5 s — counts against it, and a failure only counts once the checker has confirmed it. Days are your site’s calendar days.',
    docs: 'uptime#availability',
  },
  response_time: {
    title: 'Response time',
    definition:
      'Average response time across every timed check, failures included. Exact p50 and p95 come from raw checks (kept 90 days) on ranges up to 8 days; longer ranges fall back to the stored daily average, labelled ‘avg’ — never an invented percentile.',
    docs: 'uptime#response-time',
  },
  checks: {
    title: 'Checks',
    definition:
      'Every uptime check run in the range.',
    docs: 'uptime#checks',
  },
  incidents: {
    title: 'Incidents',
    definition:
      'Confirmed down or degraded episodes — the durable record. Raw checks are purged after 90 days; incidents are kept.',
    docs: 'uptime#incidents',
  },
  recent_checks: {
    title: 'Recent checks',
    definition:
      'The newest checks for this monitor, whatever range is selected: when each ran, the status code it saw and how long it took. The dot shows the confirmed status, so a blip inside the grace window still reads as up.',
    docs: 'uptime#checks',
  },
  site_timezone: {
    title: 'Site timezone',
    definition:
      'Days here are your site’s calendar days. Days before the labelled date were bucketed on the old UTC calendar and their raw checks no longer fully survive, so they can’t be re-cut.',
    docs: 'uptime#site-timezone',
  },

  // ── dashboard ──
  browsers: {
    title: 'Browsers',
    definition:
      'Parsed from the user agent at ingestion. Hidden when device-info collection is off; unrecognised browsers are dropped rather than bucketed as "Unknown".',
    docs: 'dashboard#browsers',
  },
  channels: {
    title: 'Channels',
    definition:
      'Assigned server-side from utm_medium first, then the referrer\'s domain. An unrecognised referrer files as Referral; anything matching neither shows as Unknown — the classifier does not guess.',
    docs: 'dashboard#channels',
  },
  cities: {
    title: 'Cities',
    definition:
      'The finest geography resolved — same GeoIP lookup and same two gates as Regions: collection off, or detail capped at country level.',
    docs: 'dashboard#cities',
  },
  countries: {
    title: 'Countries',
    definition:
      'Resolved from the request IP at ingestion, which is then wiped. T1, A1, A2, O1, EU and AP are not countries — an anonymising network, a satellite provider, a broad region or an unplaceable IP.',
    docs: 'dashboard#countries',
  },
  devices: {
    title: 'Devices',
    definition:
      'Taken from the user agent; when it says nothing, screen width decides — so a narrow desktop window counts as mobile.',
    docs: 'dashboard#devices',
  },
  entries: {
    title: 'Entries',
    definition:
      'Each session\'s first pageview inside the range — the landing page. A session that began earlier shows its first page in the window instead.',
    docs: 'dashboard#entries',
  },
  events: {
    title: 'Events',
    definition:
      'Counts firings, not people — one visitor firing the same event six times reads 6. Expanding a row loads that event\'s property keys and recorded values.',
    docs: 'dashboard#events',
  },
  exits: {
    title: 'Exits',
    definition:
      'Each session\'s last pageview inside the range — for a session still running at the range end, the last page in the window, not its final page.',
    docs: 'dashboard#exits',
  },
  languages: {
    title: 'Languages',
    definition:
      'Self-reported by the browser in Accept-Language, not derived from the IP — a browser setting, not a location. Gated by the audience-data setting, not the geo one.',
    docs: 'dashboard#languages',
  },
  map: {
    title: 'Map',
    definition:
      'The Countries rows drawn rather than listed — the identical query, non-country codes included. Not a second measurement, so it cannot disagree with the Countries tab.',
    docs: 'dashboard#map',
  },
  os: {
    title: 'OS',
    definition:
      'Parsed from the user agent at ingestion. Unrecognised values are dropped, and the site setting that governs Browsers turns this off too.',
    docs: 'dashboard#os',
  },
  pages: {
    title: 'Pages',
    definition:
      'Pageviews count page loads, so a reload adds one. Visitors counts people, deduplicated monthly — a reload adds no visitor, and neither does a return trip. Bounce and duration stay session-scoped: they describe a visit, not a person.',
    docs: 'dashboard#pages',
  },
  peak_hours: {
    title: 'Peak hours',
    definition:
      'Bucketed by the site\'s own wall clock, not the viewer\'s, so everyone sees the same grid. Hours with no measured value contribute no weight to averages.',
    docs: 'dashboard#peak-hours',
  },
  referrers: {
    title: 'Referrers',
    definition:
      '"Direct" and "Shared Link" both mean no referrer was captured — a typed URL, a bookmark, an app that strips it. The entry referrer sticks for 30 minutes.',
    docs: 'dashboard#referrers',
  },
  regions: {
    title: 'Regions',
    definition:
      'State or province, from the same GeoIP lookup as Countries. Hidden when geographic collection is off, or when the site caps geo detail at country level.',
    docs: 'dashboard#regions',
  },
  screens: {
    title: 'Screens',
    definition:
      'Reported by the browser. It has its own site setting — turning off browser/OS/device collection does not turn this off.',
    docs: 'dashboard#screens',
  },
  scroll_depth: {
    title: 'Scroll depth',
    definition:
      'Cumulative and per visit, not per page: 80% counts in the 25, 50 and 75 rows. Visits with no scroll reading are excluded, not counted as 0%.',
    docs: 'dashboard#scroll-depth',
  },
  timezones: {
    title: 'Timezones',
    definition:
      'Self-reported by the device, like Languages — not derived from the IP. The flag is a best-effort guess, blank for zones outside a fixed list.',
    docs: 'dashboard#timezones',
  },

  // ── campaigns ──
  utm_campaign: {
    title: 'Campaign (UTM)',
    definition:
      'The campaign name a link was tagged with, grouping every source and medium that carried it. Ranked and weighted like Source (UTM).',
    docs: 'campaigns#utm-campaign',
  },
  utm_content: {
    title: 'Content (UTM)',
    definition:
      'Conventionally tells apart two links or ad variants that share the same source, medium and campaign. Ranked and weighted like Source (UTM).',
    docs: 'campaigns#utm-content',
  },
  utm_medium: {
    title: 'Medium (UTM)',
    definition:
      'The same field the Channels classifier reads first, sorting traffic into Paid Search, Paid Social, Email or SMS. Ranked and weighted like Source (UTM).',
    docs: 'campaigns#utm-medium',
  },
  utm_source: {
    title: 'Source (UTM)',
    definition:
      'Only pageviews carrying a utm_source appear here — or on any other Campaigns tab. Untagged traffic never does. Bounce rate and duration are visitors-weighted means.',
    docs: 'campaigns#utm-source',
  },
  utm_term: {
    title: 'Term (UTM)',
    definition:
      'Conventionally the paid-search keyword a link was tagged with. Ranked and weighted like Source (UTM).',
    docs: 'campaigns#utm-term',
  },

  // ── search-console ──
  bing_clicks_impressions_ctr: {
    title: 'Clicks / Impressions / CTR (Bing)',
    definition:
      'Site-level daily figures are all the synced endpoint returns — no average position. The per-query endpoint isn\'t synced: it carries no dates and could not honour the date picker.',
    docs: 'search-console#bing-metrics',
  },
  bing_timezone_days: {
    title: 'Bing\'s day, Bing\'s timezone',
    definition:
      'Each daily row is bucketed in Bing\'s reporting day — a Pacific offset, stored verbatim — which can differ from a Google calendar day by up to 24 hours.',
    docs: 'search-console#bing-day-timezone',
  },
  search_avg_ctr: {
    title: 'Avg CTR (Search)',
    definition:
      'Clicks divided by impressions across the whole period, recomputed from summed counts rather than averaged across daily CTRs — not an average of averages.',
    docs: 'search-console#search-avg-ctr',
  },
  search_avg_position: {
    title: 'Avg position (Search)',
    definition:
      'Impression-weighted mean rank. Only the date-only sync carries a daily position; before backfill it shows an em dash, never a guess. The chart is inverted: higher is better.',
    docs: 'search-console#search-avg-position',
  },
  search_clicks: {
    title: 'Clicks (Search)',
    definition:
      'Tiles and chart read the date-only sync that matches Search Console; the tables read a query-dimensioned one that undercounts, so the two will not sum.',
    docs: 'search-console#search-clicks',
  },
  search_data_source_gate: {
    title: 'Search data source (why tables and tiles differ)',
    definition:
      'Search Console drops anonymised queries when a query dimension is requested, so that sync undercounts. Tiles, the chart and the Days table switch to the date-only sync after a zero-error backfill; the query and page tables never do.',
    docs: 'search-console#search-data-source-gate',
  },
  search_days_view: {
    title: 'Days view',
    definition:
      'Per-date breakdown, newest first, mirroring Search Console\'s own Dates table. CTR is recomputed from each row\'s clicks and impressions rather than trusted from the response.',
    docs: 'search-console#search-days-view',
  },
  search_granularity_rollup: {
    title: 'Weekly / monthly rollup',
    definition:
      'Clicks and impressions are summed; CTR is recomputed from those sums, never averaged. Position is impression-weighted, and a bucket where no day has one stays empty.',
    docs: 'search-console#search-granularity-rollup',
  },
  search_impressions: {
    title: 'Impressions (Search)',
    definition:
      'Same two sources as Clicks (Search): tiles from the date-only sync, tables from the query-dimensioned one that undercounts, so the two will not sum.',
    docs: 'search-console#search-impressions',
  },
  search_new_queries_chip: {
    title: 'New queries',
    definition:
      'Distinct queries absent from the preceding period of the same length. The count is exact; the list you can open is capped at 100. The chip hides at zero.',
    docs: 'search-console#search-new-queries',
  },
  search_opportunities: {
    title: 'Opportunities (Search)',
    definition:
      'Queries averaging position 4–20 with at least 10 impressions, ranked by impressions. "Potential" is a model — impressions × 8.5% — not a Google figure or a measured gain.',
    docs: 'search-console#search-opportunities',
  },
  search_query_trend: {
    title: 'Query position trend',
    definition:
      'One query\'s daily average position, drawn inverted so a taller bar is a better rank. Fewer than two days of data says so instead of drawing a flat line.',
    docs: 'search-console#search-query-trend',
  },
  search_row_tables: {
    title: 'Queries / Pages / Countries / Devices tables',
    definition:
      'Read from the query-dimensioned source Google undercounts. Sorting runs in the browser over the top 200 rows by clicks; the table says so when the period holds more.',
    docs: 'search-console#search-row-tables',
  },

  // ── cdn ──
  cdn_backfill_caps: {
    title: 'How far CDN history goes back',
    definition:
      'Two upstream limits — 40 days per request, and no start date older than a year — bound backfilled history at 364 days regardless of connection age.',
    docs: 'cdn#cdn-backfill-caps',
  },
  cdn_bandwidth_total: {
    title: 'Total bandwidth (CDN)',
    definition:
      'All bytes served over the range, cache and origin together. Not a rail of its own — it is the denominator behind "X% of all bandwidth".',
    docs: 'cdn#cdn-total-bandwidth',
  },
  cdn_cache_hit_rate: {
    title: 'Cache hit rate',
    definition:
      'Counted in requests, not bytes. A window with zero requests has no hit rate and shows an em dash, never 0%. The change is in percentage points.',
    docs: 'cdn#cdn-cache-hit-rate',
  },
  cdn_errors: {
    title: 'Errors (4xx/5xx)',
    definition:
      'The upstream chart zero-fills the error series unless errors are explicitly requested, and until 14-08-2026 they were not — so counts written before then were fabricated zeros. A full re-sync rewrote the last 364 days with real counts; anything older still reads zero and proves nothing. 3xx are redirects, not errors.',
    docs: 'cdn#cdn-errors',
  },
  cdn_live_card: {
    title: 'Last 24 hours (live card)',
    definition:
      'Covers the trailing 24 complete UTC hours and ignores the date range above it. The hour in progress is excluded from totals and not plotted.',
    docs: 'cdn#cdn-live-card',
  },
  cdn_origin_latency: {
    title: 'Origin latency',
    definition:
      'Averaged only over days that pulled from the origin. A day with no pull shows an em dash — the CDN reports 0, and 0ms was never measured.',
    docs: 'cdn#cdn-origin-latency',
  },
  cdn_origin_traffic: {
    title: 'Origin traffic',
    definition:
      'Bytes the cache did not absorb — total bandwidth minus cached. The delta is inverted here: a decrease is shown as an improvement.',
    docs: 'cdn#cdn-origin-traffic',
  },
  cdn_served_from_cache: {
    title: 'Served from cache',
    definition:
      'Bytes the cache served without reaching your origin. The delta compares against the immediately preceding window of the same length.',
    docs: 'cdn#cdn-served-from-cache',
  },
  cdn_served_from_regions: {
    title: 'Served from (edge regions)',
    definition:
      'Bandwidth by edge location over the selected range — where bytes were served from, not where visitors are, and not a per-day series.',
    docs: 'cdn#cdn-served-from-regions',
  },
  cdn_status_band: {
    title: 'Response status composition',
    definition:
      'Share of 2xx/3xx/4xx/5xx responses over the loaded range, drawn from the same daily rows as the strips above. 3xx counts as redirects, not errors.',
    docs: 'cdn#cdn-status-composition',
  },
  cdn_utc_days: {
    title: 'CDN days are UTC days',
    definition:
      'Follows the CDN\'s own UTC calendar days, not the site-local day the rest of Pulse reports. Every date and preset here is anchored to UTC.',
    docs: 'cdn#cdn-utc-days',
  },
  cdn_zero_fill_absence: {
    title: 'Zero-fill means absence',
    definition:
      'The CDN returns a value for every bucket asked about, so an all-zero day is indistinguishable from a day the zone did not exist — Pulse refuses to store one. Days with no row leave a gap and render a dash, never a zero.',
    docs: 'cdn#cdn-zero-fill',
  },

  // ── pagespeed ──
  accessibility_score: {
    title: 'Accessibility score',
    definition:
      'Automated checks only — contrast, labels, ARIA. What Lighthouse cannot verify is listed separately, so 100 does not mean the page is accessible.',
    docs: 'pagespeed#accessibility-score',
  },
  best_practices_score: {
    title: 'Best Practices score',
    definition:
      'Browser and web-platform hygiene: HTTPS, console errors, deprecated APIs, security headers. It says nothing about load speed.',
    docs: 'pagespeed#best-practices-score',
  },
  check_error_status: {
    title: 'A failed check',
    definition:
      'Stored as its own row with the cause; the last good numbers stay visible under a "check failed" line. Missing values show an em dash, never zero.',
    docs: 'pagespeed#failed-check',
  },
  check_imagery_retention: {
    title: 'Screenshot and filmstrip retention',
    definition:
      'Kept only on the newest successful check per site and device. An older check with numbers but no picture is the retention rule, not a loading failure.',
    docs: 'pagespeed#imagery-retention',
  },
  check_provenance: {
    title: 'Where a check comes from',
    definition:
      'Runs on Pulse\'s own Lighthouse runner, not Google\'s PageSpeed Insights. The engine is pinned to 13.4.1 and recorded per row, so the instrument stays fixed.',
    docs: 'pagespeed#check-provenance',
  },
  median_of_three: {
    title: 'Median of 3',
    definition:
      'Up to three full runs; the one with the median performance score is kept whole — with two, the lower. A metric-by-metric median would describe a page load that never happened.',
    docs: 'pagespeed#median-of-3',
  },
  metric_cls: {
    title: 'Cumulative Layout Shift (CLS)',
    definition:
      'How much visible content moved unexpectedly during load, on a unitless scale from 0 up — not a time. Under 0.100 is good.',
    docs: 'pagespeed#cls',
  },
  metric_fcp: {
    title: 'First Contentful Paint (FCP)',
    definition:
      'Time until the first text or image appeared on screen. Under 1.8s is good.',
    docs: 'pagespeed#fcp',
  },
  metric_lcp: {
    title: 'Largest Contentful Paint (LCP)',
    definition:
      'Time until the largest visible element finished rendering. Under 2.5s is good.',
    docs: 'pagespeed#lcp',
  },
  metric_speed_index: {
    title: 'Speed Index',
    definition:
      'How quickly the visible page filled in, measured across the whole load rather than one element\'s timestamp. Under 3.4s is good.',
    docs: 'pagespeed#speed-index',
  },
  metric_tbt: {
    title: 'Total Blocking Time (TBT)',
    definition:
      'How long the main thread was blocked, counting only the time past 50ms in each long task, between First Contentful Paint and the page becoming interactive. Under 200ms is good.',
    docs: 'pagespeed#tbt',
  },
  metric_tti: {
    title: 'Time to Interactive (TTI)',
    definition:
      'Time until the page could reliably respond to input. Under 3.8s is good. It carries no weight in the Performance score — it is shown for diagnosis, so a poor TTI beside a green gauge is not a contradiction.',
    docs: 'pagespeed#tti',
  },
  performance_score: {
    title: 'Performance score',
    definition:
      'Lighthouse\'s 0–100 performance-category score, measured by Pulse\'s own Lighthouse runner rather than Google PageSpeed Insights, which it replaced on 14-08-2026.',
    docs: 'pagespeed#performance-score',
  },
  seo_score: {
    title: 'SEO score',
    definition:
      'On-page crawlability checks: meta tags, crawler directives, link text, canonical and hreflang. It measures whether a crawler can read the page, not how it ranks.',
    docs: 'pagespeed#seo-score',
  },
  trend_provenance_boundary: {
    title: 'Provenance boundary (score trend)',
    definition:
      'The dashed line marks the switch to Pulse\'s own runner: one PageSpeed Insights run left, a median of three right. A step across it is a change of instrument.',
    docs: 'pagespeed#trend-provenance-boundary',
  },
  trend_trailing_median: {
    title: 'Trend line (7-check trailing median)',
    definition:
      'The line is a trailing median over the last 7 scored checks, not the raw score; with an even count it takes the lower of the two middle values. The dots are the individual checks.',
    docs: 'pagespeed#trend-trailing-median',
  },

  // ── user-journeys ──
  journey_depth_density: {
    title: 'Depth and Paths (journeys)',
    definition:
      'Steps plotted (2–6), and pages kept per step before the rest roll into (other). Raising the pages limit splits (other) open; it adds no sessions.',
    docs: 'user-journeys#journey-depth-density',
  },
  journey_dropoff: {
    title: 'Drop-off (journeys)',
    definition:
      'The change in session count from the previous step: negative when fewer reached this one, positive when paths converged. Step 1 has no previous step, so it shows nothing rather than 0%.',
    docs: 'user-journeys#journey-dropoff',
  },
  journey_entry_point: {
    title: 'Entry point (journeys)',
    definition:
      'Filtering by one narrows the whole canvas to sessions that began on that page.',
    docs: 'user-journeys#journey-entry-point',
  },
  journey_exit: {
    title: 'Exit (journeys)',
    definition:
      'Sessions on the lens page at that step that made no further tracked hop. Shown as a red (exit) row on the column after the lens.',
    docs: 'user-journeys#journey-exit',
  },
  journey_lens: {
    title: 'Lens (journeys)',
    definition:
      'Pinning a page highlights every hop connected to it across every step it appears at, and dims the rest. Hovering without pinning highlights only that row\'s own flow.',
    docs: 'user-journeys#journey-lens',
  },
  journey_other_bucket: {
    title: '(other) — journeys',
    definition:
      'Pages beyond a step\'s Paths limit are rolled into one row, not dropped: counts are kept, identities collapse. (other) to (other) hops are not drawn.',
    docs: 'user-journeys#journey-other-bucket',
  },
  journey_step: {
    title: 'Step (journeys)',
    definition:
      // The columns are LABELLED from 1 (StepHeader renders `Step {index+1}`),
      // so this must count from 1 too — a panel that says "0" beside a header
      // reading "Step 1" teaches the reader the wrong thing about the very
      // label it is attached to.
      'Each column is one hop: step 1 is where sessions started, step k is where they were after k−1 recorded hops. Counts are out of that column\'s total.',
    docs: 'user-journeys#journey-step',
  },

  // ── funnels ──
  funnel_breakdown_floor: {
    title: 'Funnel breakdown privacy floor',
    definition:
      'Values with fewer than 5 entrants are withheld entirely — no row, never a zero — so a small slice and an empty one look the same and iterating a dimension cannot isolate one visitor.',
    docs: 'funnels#funnel-breakdown-floor',
  },
  funnel_exit_pages: {
    title: 'Exit pages (funnels)',
    definition:
      'The pages visitors opened within an hour of dropping off this step, top ten by volume. The final step has no drop-off, so it shows none.',
    docs: 'funnels#funnel-exit-pages',
  },
  funnel_provenance: {
    title: 'How funnel numbers are made',
    definition:
      "Computed from raw events on every request with bot and fraud verdicts applied — those can be revised retroactively, so past numbers can change. Every step must complete within one session, which resets at your site's midnight; days are cut in the site's timezone.",
    docs: 'funnels#funnel-provenance',
  },
  funnel_step_definition: {
    title: 'Funnel step',
    definition:
      'Either a page — matched exactly, by substring, or by regex on the path — or an event matched by name, optionally narrowed by property filters.',
    docs: 'funnels#funnel-step',
  },
}

/** The documentation URL for a term, or undefined while it is unpublished. */
export function docsHref(term: GlossaryTerm): string | undefined {
  return term.docs ? `${DOCS}/${term.docs}` : undefined
}

/**
 * A dimension card's TAB ID → its registry key.
 *
 * The two strings are not the same and never were: a card holds `source` /
 * `top_pages` / `scroll` in state while the registry is keyed by the term
 * (`utm_source` / `pages` / `scroll_depth`). Passing the raw tab id renders
 * NOTHING — the registry gate fails safe and therefore fails silent — which
 * is exactly how Campaigns and Content shipped with zero glyphs while a lint
 * that scanned a list of INTENDED keys stayed green.
 *
 * Identity mappings are omitted; DimensionInfoTip falls back to the tab id, so
 * only the tabs whose id differs from their term appear here.
 */
export const DIMENSION_TERM: Record<string, string> = {
  // Campaigns — the card strips the `utm_` prefix for its tab ids.
  source: 'utm_source',
  medium: 'utm_medium',
  campaign: 'utm_campaign',
  term: 'utm_term',
  content: 'utm_content',
  // Content stats — tab ids are page-set names, terms are the dimensions.
  top_pages: 'pages',
  entry_pages: 'entries',
  exit_pages: 'exits',
  // Content signals.
  scroll: 'scroll_depth',
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
