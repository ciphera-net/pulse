/**
 * Tour anchors — the product's stable selector contract.
 *
 * A guided tour (driver.js) must point at real elements, and until now it had
 * nothing to point at: every candidate was an aria attribute value or a shared
 * Tailwind class string, neither of which is a promise. These `data-tour`
 * attributes ARE the promise. A test asserts every name below appears in the
 * source, so renaming or deleting an anchored element fails CI instead of
 * silently breaking a tour step.
 *
 * Rules for anchors:
 *  - Name what the reader sees, not the component ("metric-rail", not "deck").
 *  - Anchor the element a spotlight should box — usually a container, not a
 *    leaf. Nested targets are reached by composing: e.g. the toolbar's InfoTip
 *    glyph is `[data-tour="chart-toolbar"] button[aria-haspopup="dialog"]`.
 *  - An anchor is a contract: keep the attribute when refactoring the element.
 *
 * ⚠️ Facts a tour implementation must respect (measured, 24-08-2026):
 *  - The dashboard deck is client-only behind a ≥300 ms skeleton with no ready
 *    signal, so steps must WAIT FOR the selector — never a fixed delay.
 *  - `notification-bell` and `onboarding-chip` each render TWICE (desktop bar +
 *    mobile header). Pick the visible one (check `offsetParent`), not the first
 *    DOM match, or a phone tour highlights a `display:none` node.
 *  - `site-switcher` exists on md+ ONLY — the mobile header has no equivalent
 *    control. That step must be skipped below the breakpoint, not degraded.
 *  - `onboarding-chip` is absent once the checklist is dismissed or complete.
 *    Every step needs an existence check.
 *  - Sidebar labels are hover-only tooltips while the rail is collapsed —
 *    expand it (`useSidebar().toggle()`) for a nav step, then restore.
 *  - Three independent outside-press systems live on these anchors (facet's
 *    InfoTip singleton, the realtime popover's own listeners, the shell's
 *    portal pickers). An overlay competes with all three for the same press.
 */

export const TOUR_ANCHORS = {
  // ── Dashboard ──
  metricRail: 'metric-rail',
  chartToolbar: 'chart-toolbar',
  dimensionCard: 'dimension-card',
  realtimeTrigger: 'realtime-trigger',
  dateRangePicker: 'date-range-picker',
  siteSwitcher: 'site-switcher',
  sidebarNav: 'sidebar-nav',
  notificationBell: 'notification-bell',
  onboardingChip: 'onboarding-chip',
  // ── Instruments ──
  uptimePanel: 'uptime-panel',
  uptimeIncidents: 'uptime-incidents',
  searchInstrument: 'search-instrument',
  searchEngineToggle: 'search-engine-toggle',
  cdnSplit: 'cdn-split',
  performanceScores: 'performance-scores',
  performanceTrend: 'performance-trend',
  journeysCanvas: 'journeys-canvas',
} as const

export type TourAnchor = (typeof TOUR_ANCHORS)[keyof typeof TOUR_ANCHORS]

/** `[data-tour="…"]` for a registered anchor. */
export function tourSelector(anchor: TourAnchor): string {
  return `[data-tour="${anchor}"]`
}

/**
 * The six dimension cards share one anchor and are told apart by this second
 * attribute — a tour can box "the Acquisition card" without depending on DOM
 * order or on the card's tab labels.
 */
export const DIMENSION_CARD_KEYS = [
  'referrers',
  'locations',
  'tech',
  'content',
  'content-signals',
] as const

export type DimensionCardKey = (typeof DIMENSION_CARD_KEYS)[number]
