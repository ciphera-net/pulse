import { isAutomatic } from '@/lib/dashboard/events'
import { autoSentence, kindOf, type TrailKind } from '@/lib/visitors/trail'
import type { VisitCampaign, VisitEvent, VisitRow, VisitorDayVisit } from '@/lib/api/visitors'

// ---------------------------------------------------------------------------
// A listed visitor's day, as the new Visitors page draws it (rulings R101 to R114, plan
// Pulse/docs/plans/18-11-2026-visitors-page-overhaul-plan.md). The server sends each row's day (`include=day`): its
// visits in order, each its steps in the visit trail's shape. These are the page's readings of it, kept apart from the
// drawing so they are tested on their own.
// ---------------------------------------------------------------------------

/** Where a site names the events Converted counts (Settings, Events). */
export const NAME_AN_EVENT_HREF = '/settings/site/events'

/**
 * An event the site's own code sent: what the dashboard's Events block lists under "Your events" (lib/dashboard/events
 * isAutomatic), and what the page's Events column counts and its marks light orange. The server counts the same split
 * (pulse-backend IsSiteOwnEvent, pinned to this list by a test there).
 */
export function isOwnEvent(e: Pick<VisitEvent, 'type' | 'event_name'>): boolean {
  return e.type === 'custom' && !isAutomatic(e.event_name)
}

/** The names a person reads for the automatic events the trail has no sentence for. */
const AUTOMATIC_SINGULAR: Record<string, string> = { '404': 'Page not found' }

/** A stored name made readable, the dashboard's way: underscores as spaces, the first letter a capital. */
export function readableEvent(name: string): string {
  if (AUTOMATIC_SINGULAR[name]) return AUTOMATIC_SINGULAR[name]
  const s = name.replace(/_/g, ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : name
}

/** What happened on a page: its kind, whether the site's own code sent it, and how it reads. */
export interface DayItem {
  kind: TrailKind
  own: boolean
  /** An automatic event the trail cannot classify (a 404): drawn with a plain glyph, never as one of the site's own. */
  plain: boolean
  text: string
}

/** A page of the visitor's day: its address, its time, and what happened on it. */
export interface DayPage {
  path: string
  seconds: number | null
  items: DayItem[]
}

function itemOf(e: VisitEvent): DayItem {
  const kind = kindOf(e)
  const own = isOwnEvent(e)
  // The trail calls every event it cannot read by its schema `event`; the dashboard's split says which of those are
  // the site's own. One it calls `event` that is automatic (a 404) keeps a plain mark.
  const plain = kind === 'event' && !own
  return { kind, own, plain, text: autoSentence(e) ?? (own ? e.event_name : readableEvent(e.event_name)) }
}

/**
 * The day as pages, visit by visit: each pageview a page, each event on the page before it (an event before any
 * pageview opens a page of its own, at the address it was sent from).
 */
export function dayPages(day: readonly VisitorDayVisit[] | undefined): DayPage[][] {
  return (day ?? []).map((visit) => {
    const pages: DayPage[] = []
    for (const e of visit.steps) {
      if (e.type === 'pageview') {
        pages.push({ path: e.path ?? 'A page', seconds: e.duration, items: [] })
        continue
      }
      const item = itemOf(e)
      if (pages.length) pages[pages.length - 1].items.push(item)
      else pages.push({ path: e.path ?? 'A page', seconds: null, items: [item] })
    }
    return pages
  })
}

/** The distinct names of the site's own events in a day, as a person reads them, in the order they first fired. */
export function ownNamesOf(day: readonly VisitorDayVisit[] | undefined): string[] {
  const seen = new Set<string>()
  for (const visit of day ?? []) {
    for (const e of visit.steps) if (isOwnEvent(e)) seen.add(e.event_name)
  }
  return [...seen].map(readableEvent)
}

/**
 * Each visit's steps, by its visit key: the visits read (`include=campaign`) and the row's day are both in time order,
 * and a visit's first step is the instant it started, so a day's visit belongs to the visit row that starts when it
 * does. A visit the day has no steps for (past the day's cap of 200 steps) gets none, never another visit's.
 */
export function stepsByVisit(visits: readonly VisitRow[], day: readonly VisitorDayVisit[] | undefined): Map<string, VisitEvent[]> {
  const byStart = new Map<number, VisitEvent[]>()
  for (const v of day ?? []) {
    const first = v.steps[0]
    if (first) byStart.set(Date.parse(first.timestamp), v.steps)
  }
  const out = new Map<string, VisitEvent[]>()
  for (const v of visits) out.set(v.visit_key, byStart.get(Date.parse(v.started_at)) ?? [])
  return out
}

/** A visit's campaign as the page shows it: its name, with the source and medium as tagged; null without a name. */
export function campaignOf(c: VisitCampaign | undefined): { campaign: string; source: string | null; medium: string | null } | null {
  return c?.utm_campaign ? { campaign: c.utm_campaign, source: c.utm_source, medium: c.utm_medium } : null
}

/** The source as the dashboard's Sources block names it: Direct when there is no referrer. */
export const sourceOf = (referrer: string | null) => referrer ?? 'Direct'
