import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
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
import { getPageSpeedCheck } from '@/lib/api/pagespeed'

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
  mockHistory.mockReturnValue({ data: [], error: undefined, mutate: vi.fn() })
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


  it('lets the header actions wrap instead of overflowing at 375px', () => {
    // Caught in PRODUCTION, not here, and the reason is worth keeping: the
    // local render harness has no real auth, so `canEdit` was false and the row
    // it measured was missing the very buttons that overflow. jsdom does no
    // layout, so this asserts the CLASS CONTRACT instead — the row must be able
    // to wrap, and must not be unconditionally flex-shrink-0, or tabs +
    // Run Check + Disable exceed the container and the shell's
    // overflow-x-hidden CUTS the excess rather than scrolling it.
    const { getByRole } = render(<PageSpeedPage />)
    const disable = getByRole('button', { name: 'Disable' })
    const row = disable.parentElement as HTMLElement
    expect(row.className).toContain('flex-wrap')
    expect(row.className).not.toMatch(/(^|\s)flex-shrink-0(\s|$)/)
    expect(row.className).toContain('sm:flex-shrink-0')
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

describe('PageSpeed page — the check navigator and the trend card', () => {
  it('does NOT render an empty trend card when no check in the window has a score', () => {
    // The card wrapper was gated on `historyChecks.length >= 2`, but
    // PerformanceTrend filters to performance_score !== null and renders nothing
    // below two points. Those are different sets: a status='ok' row can carry a
    // NULL performance score, because the parser returns nil when the
    // performance category is absent or unscored while the check itself still
    // succeeds. A site whose page never stabilises accumulates exactly these
    // rows, so the user got a bordered box containing the heading
    // "Performance score trend" and nothing else, on every single load.
    mockHistory.mockReturnValue({
      data: [
        check({ id: 'h1', performance_score: null, checked_at: '2026-08-11T09:00:00Z' }),
        check({ id: 'h2', performance_score: null, checked_at: '2026-08-12T09:00:00Z' }),
        check({ id: 'h3', performance_score: null, checked_at: '2026-08-13T09:00:00Z' }),
      ],
      error: undefined,
      mutate: vi.fn(),
    })
    const { container } = render(<PageSpeedPage />)
    expect(container.textContent ?? '').not.toContain('Performance score trend')
  })

  it('does NOT render the trend card with exactly ONE scored check — the boundary', () => {
    // The chart needs TWO points; with one it returns null and the card is empty
    // again. Without this case, mutating the gate from >= 2 to >= 1 restores the
    // exact bug the gate exists to prevent and both other tests stay green.
    mockHistory.mockReturnValue({
      data: [
        check({ id: 'h1', performance_score: 70, checked_at: '2026-08-11T09:00:00Z' }),
        check({ id: 'h2', performance_score: null, checked_at: '2026-08-12T09:00:00Z' }),
        check({ id: 'h3', performance_score: null, checked_at: '2026-08-13T09:00:00Z' }),
      ],
      error: undefined,
      mutate: vi.fn(),
    })
    const { container } = render(<PageSpeedPage />)
    expect(container.textContent ?? '').not.toContain('Performance score trend')
  })

  it('DOES render the trend card once two checks carry a score — the positive control', () => {
    // Without this, the assertion above also passes if the card were deleted.
    mockHistory.mockReturnValue({
      data: [
        check({ id: 'h1', performance_score: 70, checked_at: '2026-08-11T09:00:00Z' }),
        check({ id: 'h2', performance_score: null, checked_at: '2026-08-12T09:00:00Z' }),
        check({ id: 'h3', performance_score: 80, checked_at: '2026-08-13T09:00:00Z' }),
      ],
      error: undefined,
      mutate: vi.fn(),
    })
    const { container } = render(<PageSpeedPage />)
    expect(container.textContent ?? '').toContain('Performance score trend')
  })

  it('does not skip a check when the timeline lags the latest check', () => {
    // 🔴 THE STALE-TIMELINE CASE. After a manual check completes the page mutates
    // `latest` — a different SWR key from `history` — so for one refresh interval
    // the timeline is exactly one row behind. The navigator used to assume
    // `checkTimeline[0]` WAS the displayed check and mapped index 0 to "show
    // latest", so "Previous check" stepped to timeline[1] and the newest
    // historical check was unreachable by any button.
    //
    // Here `latest` is chk-new (12:03 today) and the timeline does not contain
    // it. "Previous check" must reach the timeline's newest entry, h-13aug.
    mockLatest.mockReturnValue({
      data: {
        checks: [check({ id: 'chk-new', checked_at: '2026-08-14T12:03:00Z' })],
        attempts: [attempt({ id: 'chk-new', checked_at: '2026-08-14T12:03:00Z' })],
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    })
    mockHistory.mockReturnValue({
      data: [
        check({ id: 'h-11aug', checked_at: '2026-08-11T09:00:00Z' }),
        check({ id: 'h-12aug', checked_at: '2026-08-12T09:00:00Z' }),
        check({ id: 'h-13aug', checked_at: '2026-08-13T09:00:00Z' }),
      ],
      error: undefined,
      mutate: vi.fn(),
    })

    const { container } = render(<PageSpeedPage />)
    const prev = [...container.querySelectorAll('button')].find(b =>
      (b.getAttribute('aria-label') ?? b.textContent ?? '').toLowerCase().includes('previous'),
    )
    expect(prev, 'no "previous check" control was rendered').toBeTruthy()
    expect(prev!.hasAttribute('disabled')).toBe(false)

    // The decisive assertion: WHICH check it navigates to. Merely being enabled
    // does not distinguish the fix — the old code enabled it too, and then
    // stepped one check too far.
    vi.mocked(getPageSpeedCheck).mockResolvedValue(check({ id: 'h-13aug' }))
    fireEvent.click(prev!)

    expect(getPageSpeedCheck).toHaveBeenCalledWith('site-1', 'h-13aug')
    expect(getPageSpeedCheck).not.toHaveBeenCalledWith('site-1', 'h-12aug')
  })

  it('can get BACK to the latest check after stepping into the lagging timeline', async () => {
    // The other half of the same state, and a bug the first version of the fix
    // introduced: with the latest check absent from the timeline, selectedIndex
    // is -1; stepping back lands on index 0, and `canGoNext = selectedIndex > 0`
    // is then false. The arrow was disabled and goToCheck(-1) fell off the end of
    // the array, so the user was stuck one check behind the newest one with no
    // control that could return them to it.
    mockLatest.mockReturnValue({
      data: {
        checks: [check({ id: 'chk-new', performance_score: 55, checked_at: '2026-08-14T12:03:00Z' })],
        attempts: [attempt({ id: 'chk-new', checked_at: '2026-08-14T12:03:00Z' })],
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    })
    mockHistory.mockReturnValue({
      data: [
        check({ id: 'h-12aug', checked_at: '2026-08-12T09:00:00Z' }),
        check({ id: 'h-13aug', checked_at: '2026-08-13T09:00:00Z' }),
      ],
      error: undefined,
      mutate: vi.fn(),
    })

    vi.mocked(getPageSpeedCheck).mockResolvedValue(check({ id: 'h-13aug', performance_score: 88 }))
    const { container } = render(<PageSpeedPage />)
    const prev = [...container.querySelectorAll('button')].find(
      b => b.getAttribute('aria-label') === 'Previous check',
    )!
    await act(async () => {
      fireEvent.click(prev)
    })
    expect(container.textContent ?? '', 'the step back did not land on the historical check').toContain('88')

    const next = [...container.querySelectorAll('button')].find(
      b => b.getAttribute('aria-label') === 'Next check',
    )!
    expect(next.hasAttribute('disabled'), 'Next check is disabled; the latest check is unreachable').toBe(false)
    await act(async () => {
      fireEvent.click(next)
    })
    // Back on the latest check, which is served from `latest` rather than fetched.
    expect(container.textContent ?? '').toContain('55')
  })
})

describe('PageSpeed page — the retry race (F19)', () => {
  it('a late retry response does not overwrite the check the user navigated to', async () => {
    // 🔴 THE ORDERING BUG. retryCheckFetch used to fire its own unguarded
    // promise, while the main effect had a `cancelled` flag. Both could be in
    // flight at once and resolve in either order:
    //
    //   select X -> fetch fails -> "Couldn't load that check"
    //   click "Try again"       -> retry for X starts (no ownership guard)
    //   click "Previous check"  -> effect starts a fetch for Y
    //   Y resolves, renders
    //   X's retry resolves LAST -> setSelectedCheckData(X)
    //
    // The page then rendered X's scores under Y's navigator position, with the
    // spinner already cleared, so nothing on screen suggested anything was
    // wrong. Routing retry through the same cancellable effect (via a nonce)
    // means the switch to Y cancels X.
    mockLatest.mockReturnValue({
      data: {
        checks: [check({ id: 'chk-latest', checked_at: '2026-08-14T12:03:00Z' })],
        attempts: [attempt({ id: 'chk-latest', checked_at: '2026-08-14T12:03:00Z' })],
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    })
    mockHistory.mockReturnValue({
      data: [
        check({ id: 'h-Y', performance_score: 41, checked_at: '2026-08-12T09:00:00Z' }),
        check({ id: 'h-X', performance_score: 88, checked_at: '2026-08-13T09:00:00Z' }),
      ],
      error: undefined,
      mutate: vi.fn(),
    })

    const api = vi.mocked(getPageSpeedCheck)

    // 1. Navigate to X; that fetch fails.
    api.mockRejectedValueOnce(new Error('boom'))
    const { container } = render(<PageSpeedPage />)
    const prev = [...container.querySelectorAll('button')].find(
      b => b.getAttribute('aria-label') === 'Previous check',
    )!
    await act(async () => {
      fireEvent.click(prev)
    })
    expect(container.textContent ?? '').toContain("Couldn't load that check")

    // 2. Click "Try again" — X's retry is deferred and will resolve LAST.
    let resolveX: (v: PageSpeedCheck) => void = () => {}
    api.mockImplementationOnce(() => new Promise<PageSpeedCheck>(res => { resolveX = res }))
    const retry = [...container.querySelectorAll('button')].find(b => b.textContent === 'Try again')!
    await act(async () => {
      fireEvent.click(retry)
    })

    // 3. Navigate to Y while X's retry is still in flight; Y resolves at once.
    api.mockResolvedValueOnce(check({ id: 'h-Y', performance_score: 41 }))
    const prev2 = [...container.querySelectorAll('button')].find(
      b => b.getAttribute('aria-label') === 'Previous check',
    )!
    await act(async () => {
      fireEvent.click(prev2)
    })

    // 4. X's retry finally resolves — and must be discarded.
    await act(async () => {
      resolveX(check({ id: 'h-X', performance_score: 88 }))
      await Promise.resolve()
    })

    const text = container.textContent ?? ''
    expect(text, 'the abandoned retry overwrote the check the user asked for').toContain('41')
    expect(text, "check X's score is on screen although the user navigated to Y").not.toContain('88')
  })
})
