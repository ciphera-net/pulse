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
import type { FilterSuggestion } from '@/lib/filters'
import { logger } from '@/lib/utils/logger'

// ---------------------------------------------------------------------------
// Per-dimension suggestion fetcher for the filter builder — the dashboard's
// handleFetchSuggestions, extracted so every filtered surface (dashboard,
// funnel detail, journeys) resolves values the same way: the dimension's own
// breakdown endpoint, scoped to the current range and committed filters.
// ---------------------------------------------------------------------------

export function useFilterSuggestions(
  siteId: string,
  range: { start: string; end: string } | null,
  filtersParam?: string,
): (dimension: string) => Promise<FilterSuggestion[]> {
  const start = range?.start
  const end = range?.end

  return useCallback(
    async (dimension: string): Promise<FilterSuggestion[]> => {
      if (!start || !end) return []
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
          case 'page': {
            const data = await getTopPages(siteId, start, end, limit, f)
            return data.map(p => ({ value: p.path, label: p.path, count: p.pageviews }))
          }
          case 'referrer': {
            const data = await getTopReferrers(siteId, start, end, limit, f)
            return data.filter(r => r.referrer && r.referrer !== '').map(r => ({ value: r.referrer, label: r.referrer, count: r.pageviews }))
          }
          case 'country': {
            const data = await getCountries(siteId, start, end, limit, f)
            return data.filter(c => c.country && c.country !== 'Unknown').map(c => ({ value: c.country, label: regionNames?.of(c.country) ?? c.country, count: c.pageviews }))
          }
          case 'city': {
            const data = await getCities(siteId, start, end, limit, f)
            return data.filter(c => c.city && c.city !== 'Unknown').map(c => ({ value: c.city, label: c.city, count: c.pageviews }))
          }
          case 'region': {
            const data = await getRegions(siteId, start, end, limit, f)
            return data.filter(r => r.region && r.region !== 'Unknown').map(r => ({ value: r.region, label: r.region, count: r.pageviews }))
          }
          case 'browser': {
            const data = await getBrowsers(siteId, start, end, limit, f)
            return data.filter(b => b.browser && b.browser !== 'Unknown').map(b => ({ value: b.browser, label: b.browser, count: b.pageviews }))
          }
          case 'os': {
            const data = await getOS(siteId, start, end, limit, f)
            return data.filter(o => o.os && o.os !== 'Unknown').map(o => ({ value: o.os, label: o.os, count: o.pageviews }))
          }
          case 'device': {
            const data = await getDevices(siteId, start, end, limit, f)
            return data.filter(d => d.device && d.device !== 'Unknown').map(d => ({ value: d.device, label: d.device, count: d.pageviews }))
          }
          case 'utm_source':
          case 'utm_medium':
          case 'utm_campaign': {
            const data = await getCampaigns(siteId, start, end, limit, f)
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
    [siteId, start, end, filtersParam],
  )
}
