import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import type { PageSpeedCheck, PageSpeedAttempt, PageSpeedConfig } from '@/lib/api/pagespeed'

// Page-level tests for the states that used to fail SILENTLY. Each one pins a
// distinction the old page collapsed, and in every case the wrong behaviour
// looked completely normal on screen — which is why a unit test is the only
// thing that would have caught them.

const mockSite = vi.fn()
const mockConfig = vi.fn()
const mockLatest = vi.fn()
const mockHistory = vi.fn()

vi.mock('@/lib/swr/dashboard', () => ({
  useSite: () => mockSite(),
  usePageSpeedConfig: () => mockConfig(),
  usePageSpeedLatest: () => mockLatest(),
  usePageSpeedHistory: () => mockHistory(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'site-1' }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/auth/permissions', () => ({ useCan: () => true }))
vi.mock('@/lib/hooks/useQueryParamsWriter', () => ({ useQueryParamsWriter: () => () => {} }))
vi.mock('@/components/skeletons', () => ({
  useMinimumLoading: (v: boolean) => v,
  useSkeletonFade: () => '',
}))
// The stubs drop the props React would warn about on a plain DOM element
// (layoutId, isLoading). Spreading them produces "React does not recognize the
// X prop" on stderr, and test output that is noisy by default is test output
// nobody reads when it starts saying something real.
vi.mock('framer-motion', () => ({
  motion: { div: ({ className }: { className?: string }) => <div className={className} /> },
}))
vi.mock('@ciphera-net/facet', () => ({
  toast: { success: () => {}, error: () => {} },
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  // lib/utils re-exports cn from facet, so ErrorCard breaks without it.
  cn: (...parts: unknown[]) => parts.filter(Boolean).join(' '),
}))
vi.mock('@/components/ui/select', () => ({ default: () => <select /> }))
vi.mock('@/lib/api/pagespeed', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api/pagespeed')>()
  return { ...actual, getPageSpeedCheck: vi.fn(), getPageSpeedLatest: vi.fn(), triggerPageSpeedCheck: vi.fn(), updatePageSpeedConfig: vi.fn() }
})

import PageSpeedPage from '../page'

const config = (over: Partial<PageSpeedConfig> = {}): PageSpeedConfig => ({
  site_id: 'site-1',
  enabled: true,
  frequency: 'daily',
  next_check_at: '2026-08-15T08:00:00Z',
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-08-14T00:00:00Z',
  ...over,
})

const check = (over: Partial<PageSpeedCheck> = {}): PageSpeedCheck =>
  ({
    id: 'chk-1',
    site_id: 'site-1',
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
    lcp_ms: 6090,
    cls: 0,
    tbt_ms: 52,
    fcp_ms: 1427,
    si_ms: 1956,
    tti_ms: 6090,
    audits: [],
    triggered_by: 'scheduled',
    checked_at: '2026-08-13T21:15:00Z',
    ...over,
  }) as PageSpeedCheck

const attempt = (over: Partial<PageSpeedAttempt> = {}): PageSpeedAttempt => ({
  id: 'chk-1',
  strategy: 'mobile',
  source: 'lighthouse',
  status: 'ok',
  error: null,
  lighthouse_version: '13.4.1',
  runs: 3,
  triggered_by: 'scheduled',
  checked_at: '2026-08-13T21:15:00Z',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockSite.mockReturnValue({ data: { id: 'site-1', domain: 'ciphera.net' } })
  mockConfig.mockReturnValue({ data: config(), error: undefined, isLoading: false, mutate: vi.fn() })
  mockLatest.mockReturnValue({
    data: { checks: [check()], attempts: [attempt()] },
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  })
  mockHistory.mockReturnValue({ data: [], error: undefined })
})

describe('PageSpeed page — states that used to fail silently', () => {
  it('a FAILED CONFIG FETCH renders an error, not "monitoring is off"', () => {
    // `config?.enabled ?? false` collapsed these two: a 500 on the settings
    // endpoint produced a confident "monitoring is disabled" screen, complete
    // with an Enable button, for a site where it was switched ON.
    mockConfig.mockReturnValue({
      data: undefined,
      error: new Error('500'),
      isLoading: false,
      mutate: vi.fn(),
    })
    const { container } = render(<PageSpeedPage />)
    const text = container.textContent ?? ''
    expect(text).toContain("Couldn't load PageSpeed settings")
    expect(text).not.toContain('PageSpeed monitoring is off')
    expect(text).not.toContain('Enable PageSpeed monitoring')
  })

  it('a genuinely disabled site still gets the enable state — the positive control', () => {
    // Without this, the assertion above also passes if the disabled state were
    // deleted outright.
    mockConfig.mockReturnValue({
      data: config({ enabled: false }),
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    })
    const { container } = render(<PageSpeedPage />)
    expect(container.textContent).toContain('PageSpeed monitoring is off')
  })

  it('reports the last check as FAILED while showing the last good numbers', () => {
    mockLatest.mockReturnValue({
      data: {
        checks: [check()],
        attempts: [attempt({ id: 'chk-2', status: 'error', error: 'chrome timeout', runs: 0, checked_at: '2026-08-14T21:15:00Z' })],
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    })
    const { container } = render(<PageSpeedPage />)
    const text = container.textContent ?? ''
    expect(text).toContain('Check failed')
    expect(text).toContain('chrome timeout')
    expect(text).toContain('showing the last successful run')
    // The gauges still show the last SUCCESSFUL check's numbers.
    expect(text).toContain('72')
  })

  it('labels a pre-cutover check "single run", never "median of 3"', () => {
    // The provenance chip reads the ROW. A hardcoded "median of 3" would
    // retro-claim a property five months of PSI history does not have.
    mockLatest.mockReturnValue({
      data: {
        checks: [check({ source: 'psi', runs: null, lighthouse_version: null })],
        attempts: [attempt({ source: 'psi', runs: null, lighthouse_version: null })],
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    })
    const { container } = render(<PageSpeedPage />)
    const text = container.textContent ?? ''
    expect(text).toContain('single run')
    expect(text).not.toContain('median of 3')
    // And the spec plate must not claim a pinned Lighthouse version it does not have.
    expect(text).toContain('pagespeed insights (version not recorded)')
  })

  it('labels a self-hosted check with its real run count', () => {
    const { container } = render(<PageSpeedPage />)
    const text = container.textContent ?? ''
    expect(text).toContain('median of 3')
    expect(text).toContain('lighthouse 13.4.1 (pinned)')
  })

  it('renders an em dash for a metric that was never measured, not a zero', () => {
    mockLatest.mockReturnValue({
      data: { checks: [check({ tbt_ms: null, cls: null })], attempts: [attempt()] },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    })
    const { container } = render(<PageSpeedPage />)
    const text = container.textContent ?? ''
    // Assert on the VALUE next to its label. A bare substring sweep for "0ms"
    // matches the "good < 200ms" threshold caption and would pass either way —
    // exactly the kind of assertion that reads green against broken code.
    expect(text).toContain('Total Blocking Time—')
    expect(text).toContain('Cumulative Layout Shift—')
    expect(text).not.toContain('Total Blocking Time0ms')
    expect(text).not.toContain('Cumulative Layout Shift0.000')
    // Positive control: a metric that WAS measured still renders its number.
    expect(text).toContain('Largest Contentful Paint6.1s')
  })

  it('says "first check queued" when nothing has ever run', () => {
    mockLatest.mockReturnValue({
      data: { checks: [], attempts: [] },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    })
    const { container } = render(<PageSpeedPage />)
    expect(container.textContent).toContain('First check queued')
  })

  it('never says "Core Web Vitals" — the page has only ever shown lab data', () => {
    // CrUX field data was probed live for every site on the platform and came
    // back EMPTY for all of them. The old copy promised something the page has
    // never once rendered.
    const { container } = render(<PageSpeedPage />)
    expect(container.textContent).not.toContain('Core Web Vitals')
    expect(container.textContent).toContain('Lab performance scores')
  })
})
