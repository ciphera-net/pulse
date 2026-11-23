'use client'

import { useCallback, useRef } from 'react'
import {
  getTopPages,
  getTopReferrers,
  getCountries,
  getCities,
  getRegions,
  getBrowsers,
  getOS,
  getDevices,
  getCampaigns,
  getGoalStats,
  getEventPropertyKeys,
  getEventPropertyValues,
} from '@/lib/api/stats'
import { getJourneyEntryPoints } from '@/lib/api/journeys'
import { EVENT_KIND, OUTBOUND_KIND, eventPropertyOf, propertyKeysEvent, type FilterSuggestion } from '@/lib/filters'
import { eventName, orderKeys, propertyName, propertyValueRows } from '@/lib/dashboard/events'
import { outboundLinkRows } from '@/lib/dashboard/outbound'
import { logger } from '@/lib/utils/logger'
import { useSiteRead } from '@/lib/swr/site-read'

// ---------------------------------------------------------------------------
// Per-dimension suggestion fetcher for the filter builder — the dashboard's
// handleFetchSuggestions, extracted so every filtered surface (dashboard,
// funnel detail, journeys) resolves values the same way: the dimension's own
// breakdown endpoint, scoped to the current range and committed filters.
//
// Reads through the nearest site scope (lib/swr/site-read): under a public scope the same lists come from
// /public/sites/<id>/..., which only the sample site serves (route class `demo`). A share link
// does not allow filters at all, so a page that draws the filter builder there is wrong, and asking for
// suggestions fails loudly instead of returning an empty list that reads as "nothing to suggest".
// ---------------------------------------------------------------------------

/**
 * How long one campaigns read serves the three campaign kinds (PUL-94). utm_source, utm_medium and utm_campaign are
 * fields of one list, and the Filter button reads every kind in one pass: they were three identical reads, each a
 * ClickHouse query on the dashboard's shared limit. Shared for one pass, then read fresh, so a later pass (the page's
 * answer refreshes every minute) never shows an old list.
 */
export const CAMPAIGNS_SHARED_MS = 10_000

export function useFilterSuggestions(
  siteId: string,
  range: { start: string; end: string } | null,
  filtersParam?: string,
  /** A server-resolved period (All time) — sent instead of the dates, like the page's own fetch. */
  period?: string,
  /**
   * Realtime mode's rolling window in minutes (PULSE-192). When set, the suggestions
   * (and their counts) describe the live window the page shows, not the calendar day.
   */
  liveMinutes?: number,
): (dimension: string) => Promise<FilterSuggestion[]> {
  const start = range?.start
  const end = range?.end
  const { ref, available } = useSiteRead(siteId, 'demo')
  // The campaigns read the three campaign kinds share: for this site, range and filters, for CAMPAIGNS_SHARED_MS.
  const campaigns = useRef<{ key: string; at: number; read: ReturnType<typeof getCampaigns> } | null>(null)
  const campaignsKey = [siteId, start, end, filtersParam, period, liveMinutes].join('|')

  return useCallback(
    async (dimension: string): Promise<FilterSuggestion[]> => {
      if (!start || !end) return []
      if (!available) throw new Error('Filters are not available on this shared view')
      const f = filtersParam || undefined
      const limit = 100

      try {
        const regionNames = (() => {
          try {
            return new Intl.DisplayNames(['en'], { type: 'region' })
          } catch {
            return null
          }
        })()

        switch (dimension) {
          case 'entry_path': {
            // * Journeys only: the pages sessions began on, with their session counts.
            const data = await getJourneyEntryPoints(ref, start, end, f, period)
            return data.map(e => ({ value: e.path, label: e.path, count: e.session_count }))
          }
          case 'page': {
            const data = await getTopPages(ref, start, end, limit, f, liveMinutes != null ? undefined : period, liveMinutes)
            return data.map(p => ({ value: p.path, label: p.path, count: p.pageviews }))
          }
          case 'referrer': {
            const data = await getTopReferrers(ref, start, end, limit, f, liveMinutes != null ? undefined : period, liveMinutes)
            return data.filter(r => r.referrer && r.referrer !== '').map(r => ({ value: r.referrer, label: r.referrer, count: r.pageviews }))
          }
          case 'country': {
            const data = await getCountries(ref, start, end, limit, f, liveMinutes != null ? undefined : period, liveMinutes)
            return data.filter(c => c.country && c.country !== 'Unknown').map(c => ({ value: c.country, label: regionNames?.of(c.country) ?? c.country, count: c.pageviews }))
          }
          case 'city': {
            const data = await getCities(ref, start, end, limit, f, liveMinutes != null ? undefined : period, liveMinutes)
            return data.filter(c => c.city && c.city !== 'Unknown').map(c => ({ value: c.city, label: c.city, count: c.pageviews, ...(c.country ? { country: c.country } : {}) }))
          }
          case 'region': {
            const data = await getRegions(ref, start, end, limit, f, liveMinutes != null ? undefined : period, liveMinutes)
            return data.filter(r => r.region && r.region !== 'Unknown').map(r => ({ value: r.region, label: r.region, count: r.pageviews, ...(r.country ? { country: r.country } : {}) }))
          }
          case 'browser': {
            const data = await getBrowsers(ref, start, end, limit, f, liveMinutes != null ? undefined : period, liveMinutes)
            return data.filter(b => b.browser && b.browser !== 'Unknown').map(b => ({ value: b.browser, label: b.browser, count: b.pageviews }))
          }
          case 'os': {
            const data = await getOS(ref, start, end, limit, f, liveMinutes != null ? undefined : period, liveMinutes)
            return data.filter(o => o.os && o.os !== 'Unknown').map(o => ({ value: o.os, label: o.os, count: o.pageviews }))
          }
          case 'device': {
            const data = await getDevices(ref, start, end, limit, f, liveMinutes != null ? undefined : period, liveMinutes)
            return data.filter(d => d.device && d.device !== 'Unknown').map(d => ({ value: d.device, label: d.device, count: d.pageviews }))
          }
          case 'utm_source':
          case 'utm_medium':
          case 'utm_campaign': {
            const now = Date.now()
            let shared = campaigns.current
            if (!shared || shared.key !== campaignsKey || now - shared.at > CAMPAIGNS_SHARED_MS) {
              const read = getCampaigns(ref, start, end, limit, f, liveMinutes != null ? undefined : period, liveMinutes)
              const entry = { key: campaignsKey, at: now, read }
              shared = entry
              campaigns.current = entry
              // A failed read is not shared: the next kind (or a retry) asks again.
              read.catch(() => {
                if (campaigns.current === entry) campaigns.current = null
              })
            }
            const data = await shared.read
            const map = new Map<string, number>()
            const field = dimension === 'utm_source' ? 'source' : dimension === 'utm_medium' ? 'medium' : 'campaign'
            data.forEach(c => {
              const val = c[field]
              if (val) map.set(val, (map.get(val) ?? 0) + c.pageviews)
            })
            return [...map.entries()].map(([v, count]) => ({ value: v, label: v, count }))
          }
          case EVENT_KIND: {
            // * The event filter (R45): every custom event of the range under the other filters now on, named as the
            // * Events block names it, with its count.
            const data = await getGoalStats(ref, start, end, limit, f, liveMinutes != null ? undefined : period, liveMinutes)
            return data.filter(g => g.event_name && g.event_name !== '(other)').map(g => ({ value: g.event_name, label: eventName(g), count: g.count }))
          }
          default: {
            // * An event's keys (the Search filter's "Event property", on its way to a property): named and ordered
            // * as the Events block's tabs are. All time travels as its token, as for every list here.
            const keysOf = propertyKeysEvent(dimension)
            if (keysOf) {
              const keys = await getEventPropertyKeys(ref, keysOf, start, end, liveMinutes, f, liveMinutes != null ? undefined : period)
              return orderKeys(keysOf, keys).map(k => ({ value: k.key, label: propertyName(keysOf, k.key), count: k.count }))
            }
            // * An event's property (R45): its values, written as the Events block writes them, and an outbound link
            // * as the Outbound tab does. Stored values that read the same are one suggestion, which filters by all of
            // * them (a list never draws the same row twice, plan section 10ab).
            const property = eventPropertyOf(dimension)
            if (!property) return []
            const data = await getEventPropertyValues(ref, property.event, property.key, start, end, limit, liveMinutes != null ? undefined : period, liveMinutes, f)
            if (dimension === OUTBOUND_KIND) {
              return outboundLinkRows(data).map(row => ({ value: row.href, label: row.label, count: row.clicks, ...(row.hrefs.length > 1 ? { values: row.hrefs } : {}) }))
            }
            return propertyValueRows(data).map(row => ({ value: row.value, label: row.label, count: row.count, ...(row.values.length > 1 ? { values: row.values } : {}) }))
          }
        }
      } catch (err) {
        // * Rethrow so the value picker renders its explicit error + retry —
        // * returning [] here made a dead request look like "no suggestions".
        logger.error('Filter suggestions failed', err)
        throw err
      }
    },
    [ref, available, start, end, filtersParam, period, liveMinutes, campaignsKey],
  )
}
