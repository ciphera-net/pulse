import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { SITE_PAGES, SiteScopeProvider, memberScope, type SiteScope } from '@/lib/scope/SiteScope'

// The Uptime page, whole, over the REAL data hooks and a recorded transport: every request it
// makes, whichever component makes it. page.test.tsx stubs the hooks and public-reads.test.ts
// scans the sources; this is the one that would notice a request nobody wrote down, such as a
// shared child (the picker, the permission and display-zone hooks, the info glyphs) reaching
// for something of its own.
//
// What the recording can and cannot say. It normalises the site prefix, so `/sites/<id>` and
// `/public/sites/<id>` read the same: which of the two a scope uses is the data layer's job
// (lib/swr, lib/api), and the test for it lives with that layer. What this pins is the SET of
// reads, which is the same in both scopes: a demo that asked for something a member's page
// does not, or the reverse, would be two pages again.

const requests: string[] = []

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>()
  return {
    ...actual,
    default: vi.fn(async (path: string) => {
      requests.push(path)
      return respond(path)
    }),
  }
})

// No `useParams`, as in the page tests: the surface reads its site from the scope.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/demo/uptime',
}))
vi.mock('@/components/skeletons', () => ({
  UptimeSkeleton: () => <div data-testid="uptime-skeleton" />,
  useMinimumLoading: (v: boolean) => v,
  useSkeletonFade: () => '',
}))
vi.mock('@/components/ui/DateRangePicker', () => ({ default: () => <div data-testid="range-picker" /> }))
vi.mock('@ciphera-net/facet', () => ({
  toast: { success: () => {}, error: () => {} },
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  cn: (...parts: unknown[]) => parts.filter(Boolean).join(' '),
  InfoTip: ({ title }: { title?: string }) => <button type="button" aria-label={title ? `About ${title}` : 'What this counts'} />,
}))

import UptimeSurface from '@/components/surfaces/UptimeSurface'

const ID = 'site-1'
const MONITOR = {
  id: 'mon-1',
  site_id: ID,
  name: 'Site',
  url: 'https://haldencycles.example',
  check_interval_seconds: 300,
  expected_status_code: 200,
  timeout_seconds: 30,
  enabled: true,
  last_checked_at: '2026-10-20T09:55:00Z',
  last_status: 'up',
  last_response_time_ms: 182,
  tls_expires_at: null,
  tls_issuer: null,
  tls_checked_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-10-20T09:55:00Z',
}

/** What the API would say, by the shape of the path (the prefix is whichever surface was asked). */
function respond(path: string): unknown {
  const p = path.replace(/^\/(public\/)?sites\/[^/?]+/, '')
  if (p === '') return { id: ID, domain: 'haldencycles.example', name: 'Halden Cycles', timezone: 'Europe/Oslo', uptime_enabled: true }
  if (p === '/data-window') return { surfaces: { uptime: { from: '2026-01-01', through: '2026-10-20' } } }
  if (p.startsWith('/uptime/status')) {
    return {
      monitors: [{ monitor: MONITOR, daily_stats: [], overall_uptime: 99.9 }],
      overall_uptime: 99.9,
      status: 'operational',
      total_monitors: 1,
      utc_days_before: null,
    }
  }
  if (p.startsWith('/uptime/incidents')) return { incidents: [], start_date: '2026-09-21', end_date: '2026-10-20' }
  if (p.includes('/response-times')) {
    return { granularity: 'day', buckets: [], summary: null, start_date: '2026-09-21', end_date: '2026-10-20' }
  }
  if (p.includes('/checks')) {
    return { checks: [{ id: 'chk-1', monitor_id: 'mon-1', status: 'up', response_time_ms: 182, status_code: 200, error_message: null, checked_at: '2026-10-20T09:55:00Z' }] }
  }
  throw new Error(`the Uptime page asked for something unaccounted for: ${path}`)
}

/** A request's route with the site prefix and the query taken off: `''` is the site record. */
const route = (path: string) => path.replace(/^\/(public\/)?sites\/[^/?]+/, '').replace(/\?.*$/, '')

const scopes: [string, SiteScope][] = [
  ['a member', memberScope(ID)],
  ['the demo (public, full)', { siteId: ID, mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full' }],
]

beforeEach(() => {
  requests.length = 0
})

describe('Uptime page — every request it makes', () => {
  for (const [name, scope] of scopes) {
    it(`asks for exactly the status, ledger, series, checks, site and window: ${name}`, async () => {
      const { findByText } = render(
        // A fresh cache per render: SWR's default one is shared across the whole test file.
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
          <SiteScopeProvider scope={scope}>
            <UptimeSurface />
          </SiteScopeProvider>
        </SWRConfig>,
      )
      // The last read to land is the recent checks card: by then every other card has had its answer.
      await findByText('Recent checks')
      await waitFor(() => expect(requests.some((r) => r.includes('/response-times'))).toBe(true))

      expect([...new Set(requests.map(route))].sort()).toEqual(
        [
          '',
          '/data-window',
          '/uptime/incidents',
          '/uptime/monitors/mon-1/checks',
          '/uptime/monitors/mon-1/response-times',
          '/uptime/status',
        ].sort(),
      )
    })
  }

  it('asks for nothing at all when the scope cannot show the page', () => {
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <SiteScopeProvider scope={{ siteId: ID, mode: 'public', basePath: '/share/site-1', pages: ['dashboard'], demo: false, fidelity: 'scoped' }}>
          <UptimeSurface />
        </SiteScopeProvider>
      </SWRConfig>,
    )
    expect(requests).toEqual([])
  })
})
