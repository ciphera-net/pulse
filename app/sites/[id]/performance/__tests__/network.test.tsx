import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { SITE_PAGES, SiteScopeProvider, memberScope, type SiteScope } from '@/lib/scope/SiteScope'

// The Performance page, whole, over the REAL data hooks and a recorded transport: every
// request it makes, whichever component makes it. page.test.tsx stubs the hooks and
// public-reads.test.ts scans the sources; this is the one that would notice a request
// nobody wrote down, such as a shared child (the select, the permission and display-zone
// hooks, the info glyphs) reaching for something of its own.
//
// What the recording can and cannot say. It normalises the site prefix, so `/sites/<id>`
// and `/public/sites/<id>` read the same: which of the two a scope uses is the data layer's
// job (lib/swr, lib/api), and the test for it lives with that layer. What this pins is the
// SET of reads, which is the same in both scopes: a demo that asked for something a
// member's page does not, or the reverse, would be two pages again.

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
  usePathname: () => '/demo/performance',
}))
vi.mock('@/components/skeletons', () => ({
  useMinimumLoading: (v: boolean) => v,
  useSkeletonFade: () => '',
}))
vi.mock('@/components/ui/select', () => ({ default: () => <select /> }))
// Plain elements for the gauge's animation, as in page.test.tsx.
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ className }: { className?: string }) => <div className={className} />,
    polygon: ({ points, fill, className }: { points?: string; fill?: string; className?: string }) => <polygon points={points} fill={fill} className={className} />,
    span: ({ className, children }: { className?: string; children?: unknown }) => (
      <span className={className}>{typeof children === 'object' && children && 'get' in children ? String((children as { get: () => unknown }).get()) : (children as React.ReactNode)}</span>
    ),
  },
  useReducedMotion: () => true,
  useMotionValue: (v: number) => { let cur = v; return { get: () => cur, set: (n: number) => { cur = n }, jump: (n: number) => { cur = n } } },
  useSpring: (mv: unknown) => mv,
  useTransform: (mv: { get: () => number }, fn: (v: number) => string) => ({ get: () => fn(mv.get()) }),
}))
vi.mock('@ciphera-net/facet', () => ({
  toast: { success: () => {}, error: () => {} },
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
  Switcher: ({ options, value, onChange }: { options: { value: string; label: React.ReactNode }[]; value: string; onChange: (v: string) => void }) => (
    <div role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  ),
  cn: (...parts: unknown[]) => parts.filter(Boolean).join(' '),
  InfoTip: ({ title }: { title?: string }) => <button type="button" aria-label={title ? `About ${title}` : 'What this counts'} />,
}))

import PerformanceSurface from '@/components/surfaces/PerformanceSurface'

const ID = 'site-1'

const check = (id: string, checkedAt: string) => ({
  id,
  site_id: ID,
  strategy: 'mobile',
  source: 'lighthouse',
  status: 'ok',
  error: null,
  lighthouse_version: '13.4.1',
  runs: 3,
  performance_score: 72,
  accessibility_score: 97,
  best_practices_score: 100,
  seo_score: 92,
  lcp_ms: 2100,
  cls: 0,
  tbt_ms: 52,
  fcp_ms: 1100,
  si_ms: 1956,
  tti_ms: 2400,
  audits: [],
  triggered_by: 'scheduled',
  checked_at: checkedAt,
})

/** What the API would say, by the shape of the path (the prefix is whichever surface was asked). */
function respond(path: string): unknown {
  const p = path.replace(/^\/(public\/)?sites\/[^/?]+/, '')
  if (p === '') return { id: ID, domain: 'haldencycles.example', name: 'Halden Cycles', timezone: 'Europe/Oslo', uptime_enabled: true }
  if (p === '/performance/config') {
    return { site_id: ID, enabled: true, frequency: 'daily', next_check_at: '2026-10-21T08:00:00Z', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-10-20T00:00:00Z' }
  }
  if (p === '/performance/latest') {
    const latest = check('chk-new', '2026-10-20T08:00:00Z')
    return { checks: [latest], attempts: [{ id: latest.id, strategy: 'mobile', source: 'lighthouse', status: 'ok', error: null, lighthouse_version: '13.4.1', runs: 3, triggered_by: 'scheduled', checked_at: latest.checked_at }] }
  }
  if (p.startsWith('/performance/history')) {
    return { checks: [check('h-18oct', '2026-10-18T08:00:00Z'), check('h-19oct', '2026-10-19T08:00:00Z')] }
  }
  if (p.startsWith('/performance/checks/')) return check(p.slice('/performance/checks/'.length), '2026-10-19T08:00:00Z')
  throw new Error(`the Performance page asked for something unaccounted for: ${path}`)
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

describe('Performance page — every request it makes', () => {
  for (const [name, scope] of scopes) {
    it(`asks for exactly the site, settings, latest, history and a stepped-to check: ${name}`, async () => {
      const { findByText, getByLabelText } = render(
        // A fresh cache per render: SWR's default one is shared across the whole test file.
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
          <SiteScopeProvider scope={scope}>
            <PerformanceSurface />
          </SiteScopeProvider>
        </SWRConfig>,
      )
      await findByText('Category scores')
      // Stepping to an older check is the one read the page makes outside the hooks.
      await waitFor(() => expect(getByLabelText('Previous check')).toBeTruthy())
      fireEvent.click(getByLabelText('Previous check'))
      await waitFor(() => expect(requests.some((r) => r.includes('/performance/checks/'))).toBe(true))

      expect([...new Set(requests.map(route))].sort()).toEqual(
        ['', '/performance/config', '/performance/history', '/performance/latest', '/performance/checks/h-19oct'].sort(),
      )
    })
  }

  it('asks for nothing at all when the scope cannot show the page', () => {
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <SiteScopeProvider scope={{ siteId: ID, mode: 'public', basePath: '/share/site-1', pages: ['dashboard'], demo: false, fidelity: 'scoped' }}>
          <PerformanceSurface />
        </SiteScopeProvider>
      </SWRConfig>,
    )
    expect(requests).toEqual([])
  })
})
