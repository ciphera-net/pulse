'use client'

import { useCallback } from 'react'
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
} from '@/lib/api/stats'
import { getJourneyEntryPoints } from '@/lib/api/journeys'
import type { FilterSuggestion } from '@/lib/filters'
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
            return data.filter(c => c.city && c.city !== 'Unknown').map(c => ({ value: c.city, label: c.city, count: c.pageviews }))
          }
          case 'region': {
            const data = await getRegions(ref, start, end, limit, f, liveMinutes != null ? undefined : period, liveMinutes)
            return data.filter(r => r.region && r.region !== 'Unknown').map(r => ({ value: r.region, label: r.region, count: r.pageviews }))
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
            const data = await getCampaigns(ref, start, end, limit, f, liveMinutes != null ? undefined : period, liveMinutes)
            const map = new Map<string, number>()
            const field = dimension === 'utm_source' ? 'source' : dimension === 'utm_medium' ? 'medium' : 'campaign'
            data.forEach(c => {
              const val = c[field]
              if (val) map.set(val, (map.get(val) ?? 0) + c.pageviews)
            })
            return [...map.entries()].map(([v, count]) => ({ value: v, label: v, count }))
          }
          default:
            return []
        }
      } catch (err) {
        // * Rethrow so the value picker renders its explicit error + retry —
        // * returning [] here made a dead request look like "no suggestions".
        logger.error('Filter suggestions failed', err)
        throw err
      }
    },
    [ref, available, start, end, filtersParam, period, liveMinutes],
  )
}
