import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SiteScopeProvider, memberScope } from '@/lib/scope/SiteScope'
import { markTeamResolved, setAccessToken, setActiveTeam } from '@/lib/api/client'
import { useFilterSuggestions } from '@/lib/hooks/useFilterSuggestions'
import type { DashboardData } from '@/lib/api/stats'
import type { DimensionFilter } from '@/lib/filters'
import { SUGGESTION_READS_AT_ONCE, pageValuesFrom, useFilterValues } from '../values'

// PUL-94, counted at the network: one hover on the dashboard's Filter button, through the real suggestion reader and
// the real API client. Each request is a ClickHouse query on the dashboard user's shared limit (16 at once for every
// customer together). The lists the page's own answer holds make no request, the three campaign kinds make one (the
// client sends one GET for identical requests and keeps its answer for 2 s), and no more than SUGGESTION_READS_AT_ONCE
// requests are out at once.

vi.mock('@ciphera-net/facet', () => ({
  authMessageFromStatus: (status: number) => `Error ${status}`,
  AUTH_ERROR_MESSAGES: { NETWORK: 'Network error, please try again.' },
}))
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))

const NO_FILTERS: DimensionFilter[] = []
// The dashboard's answer: its lists are there (empty here), so those kinds are never asked for.
const DASHBOARD = { goal_counts: [], channels: [], screen_resolutions: [], languages: [], timezones: [] } as unknown as DashboardData

let urls: string[] = []
let inflight = 0
let peak = 0

beforeEach(() => {
  urls = []
  inflight = 0
  peak = 0
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: unknown) => {
      urls.push(String(url))
      inflight++
      peak = Math.max(peak, inflight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inflight--
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }),
  )
  markTeamResolved()
  setAccessToken('member-token')
  setActiveTeam('team-1')
})

afterEach(() => {
  setAccessToken(null)
  setActiveTeam(null)
  vi.unstubAllGlobals()
})

describe('one hover on the Filter button, at the network (PUL-94)', () => {
  it(`asks for each list once, the campaign kinds together, never more than ${SUGGESTION_READS_AT_ONCE} at once`, async () => {
    const id = 'hover-requests-site'
    const pageValues = pageValuesFrom(DASHBOARD)
    const wrapper = ({ children }: { children: React.ReactNode }) => <SiteScopeProvider scope={memberScope(id)}>{children}</SiteScopeProvider>
    const { result } = renderHook(
      () => {
        const fetchSuggestions = useFilterSuggestions(id, { start: '2026-11-01', end: '2026-11-07' })
        return useFilterValues({ on: true, fetchSuggestions, pageValues, filters: NO_FILTERS })
      },
      { wrapper },
    )
    await waitFor(() => expect(result.current.ready).toBe(true))
    const paths = urls.map((u) => new URL(u, 'https://pulse.test').pathname)
    // More requests than the bound, so the bound is what holds them back.
    expect(urls.length).toBeGreaterThan(SUGGESTION_READS_AT_ONCE)
    expect(new Set(urls).size).toBe(urls.length)
    expect(paths.filter((p) => p.endsWith('/campaigns'))).toHaveLength(1)
    expect(peak).toBeLessThanOrEqual(SUGGESTION_READS_AT_ONCE)
  })
})
