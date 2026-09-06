import { TOUR_ANCHORS, tourSelector, type TourAnchor, type DimensionCardKey } from './anchors'

/**
 * The approved tour script (design round 24-08-2026, artifact "The Guided
 * Minute"): a centered welcome plus seven anchored steps, dashboard-only,
 * closing on the sidebar nav. Copy shipped as approved; edits here are
 * copy edits, not design changes.
 */
export interface TourStepDef {
  /** Registered anchor, or null for the centered welcome step. */
  anchor: TourAnchor | null
  /** Disambiguates the six dimension cards sharing one anchor. */
  card?: DimensionCardKey
  title: string
  body: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
}

export const TOUR_STEPS: readonly TourStepDef[] = [
  {
    anchor: null,
    title: 'Welcome to Pulse',
    body: 'A one-minute tour of your dashboard — where the numbers live, how to filter them, and where alerts land. You can leave at any point.',
  },
  {
    anchor: TOUR_ANCHORS.metricRail,
    title: 'Your key metrics',
    body: 'Six headline numbers for the selected period. Click one and the chart follows it.',
    side: 'right',
    align: 'start',
  },
  {
    anchor: TOUR_ANCHORS.chartToolbar,
    title: 'The chart',
    body: 'Plots whichever metric is selected, at the interval you choose. The ⓘ explains exactly how a metric is measured.',
    side: 'bottom',
    align: 'start',
  },
  {
    anchor: TOUR_ANCHORS.dimensionCard,
    card: 'referrers',
    title: 'Break it down',
    body: 'Sources, locations, tech and content each get a card. Click any row to filter the whole dashboard by it; the switcher changes the view.',
    side: 'right',
    align: 'start',
  },
  {
    anchor: TOUR_ANCHORS.dateRangePicker,
    title: 'Pick your window',
    body: "Every number on the page follows this range, resolved in your site's timezone.",
    side: 'bottom',
    align: 'end',
  },
  {
    anchor: TOUR_ANCHORS.realtimeTrigger,
    title: 'Right now',
    body: "Who's on your site this minute — it updates live.",
    side: 'bottom',
    align: 'start',
  },
  {
    anchor: TOUR_ANCHORS.notificationBell,
    title: 'Alerts land here',
    body: 'Uptime, performance and billing notifications, with email for the critical ones.',
    side: 'bottom',
    align: 'end',
  },
  {
    anchor: TOUR_ANCHORS.sidebarNav,
    title: 'More than the dashboard',
    body: 'Uptime, Search, CDN and Performance each have their own page — all live in this rail.',
    side: 'right',
    align: 'start',
  },
] as const

/** Number of counted steps — the welcome is deliberately uncounted. */
export const TOUR_STEP_COUNT = TOUR_STEPS.length - 1

/** CSS selector for a step's anchor (null for the welcome step). */
export function stepSelector(def: TourStepDef): string | null {
  if (!def.anchor) return null
  const base = tourSelector(def.anchor)
  return def.card ? `${base}[data-tour-card="${def.card}"]` : base
}

/**
 * The visible mount for a step's anchor. `notification-bell` renders twice
 * (desktop bar + mobile header) — the first DOM match can be `display: none`,
 * so pick by `offsetParent`, never document order.
 */
export function findStepElement(def: TourStepDef): Element | undefined {
  const selector = stepSelector(def)
  if (!selector) return undefined
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector))
  // VISIBLE matches only, no fallback: a hidden node handed to driver reads
  // as "found" — it then spotlights a 0×0 rect at the viewport corner with
  // the popover floating over the shell (measured, 24-08 audit). An
  // undefined return instead tells driver "not here", which engages its
  // waitForElement/skipMissingElement handling — and the controller filters
  // absent-target steps out before the tour even starts.
  return nodes.find((n) => n.offsetParent !== null)
}

/**
 * Anchors whose presence means the dashboard is fully mounted: the deck
 * (client-only behind a ≥300ms skeleton with no ready signal) and the last
 * card grid. Everything else the tour touches renders earlier or in the shell.
 */
export const TOUR_READY_SELECTORS = [
  tourSelector(TOUR_ANCHORS.metricRail),
  `${tourSelector(TOUR_ANCHORS.dimensionCard)}[data-tour-card="referrers"]`,
] as const
