import React, { useEffect } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import useSWR, { SWRConfig, useSWRConfig } from 'swr'

// The public roots (PUL-34 Phase 2): what /demo and /share/<id> make of the answers the API
// gives for a site's public view. Real SWR; the API, the shell and the Facet widgets are
// stubbed, because this file is about which of the page, the gate, a notice or a failure is
// shown, and with what scope.

const apiRequest = vi.fn()
vi.mock('@/lib/api/client', () => ({ default: (...a: unknown[]) => apiRequest(...a) }))

const authenticatePublicDashboard = vi.fn()
vi.mock('@/lib/api/stats', () => ({ authenticatePublicDashboard: (...a: unknown[]) => authenticatePublicDashboard(...a) }))

const toastError = vi.fn()
const captchaMounts = vi.hoisted(() => ({ count: 0 }))
vi.mock('@ciphera-net/facet', () => ({
  Captcha: ({ onVerify }: { onVerify: (id: string, solution: string, token?: string) => void }) => {
    useEffect(() => {
      captchaMounts.count += 1
    }, [])
    return (
      <button type="button" data-testid="captcha" onClick={() => onVerify('cid', 'sol', 'tok')}>
        captcha
      </button>
    )
  },
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  ZapIcon: () => <span />,
  toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() },
  cn: (...c: unknown[]) => c.filter(Boolean).join(' '),
  buttonVariants: () => '',
}))
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...rest}>{children}</a>,
}))

// The shell has its own tests. Here it is a marker that also prints the scope it was given.
vi.mock('@/components/dashboard/DashboardChrome', async () => {
  const { useSiteScope } = await import('@/lib/scope/SiteScope')
  function ChromeMock({ children }: { children: React.ReactNode }) {
    return (
      <div data-testid="chrome">
        <pre data-testid="scope">{JSON.stringify(useSiteScope())}</pre>
        {children}
      </div>
    )
  }
  return { default: ChromeMock }
})

import PublicDemoRoot from '@/components/public/PublicDemoRoot'
import PublicShareRoot from '@/components/public/PublicShareRoot'
import { FALLBACK_DEMO_SITE_ID, type PublicSiteView } from '@/components/public/site-view'

const apiError = (status: number, data: Record<string, unknown> = {}) => Object.assign(new Error(`status ${status}`), { status, data })

function view(overrides: Partial<PublicSiteView> = {}): PublicSiteView {
  return {
    id: 'site-1', domain: 'shop.example', display_domain: 'shop.example', name: 'Shop', timezone: 'Europe/Oslo',
    is_public: true, is_demo: false, share_pages: ['dashboard'],
    collect_page_paths: true, collect_referrers: true, collect_device_info: true, collect_geo_data: 'country',
    collect_screen_resolution: true, collect_audience_data: true, hide_unknown_locations: false,
    show_referrer_domains: false, uptime_enabled: false, first_event_at: null, last_event_at: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const Page = () => <div data-testid="page">the page</div>

function withSWR(ui: React.ReactElement) {
  // A cache of its own and no deduping: one test's answers must not leak into the next.
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>
}
const renderDemo = () => render(withSWR(<PublicDemoRoot><Page /></PublicDemoRoot>))
const renderShare = (id = 'site-1', child: React.ReactNode = <Page />) =>
  render(withSWR(<PublicShareRoot siteId={id}>{child}</PublicShareRoot>))

const scopeShown = () => JSON.parse(screen.getByTestId('scope').textContent ?? '{}')

beforeEach(() => {
  apiRequest.mockReset()
  authenticatePublicDashboard.mockReset()
  toastError.mockReset()
  captchaMounts.count = 0
})

describe('/demo', () => {
  it('reads the sample site through /public/demo and shows its pages at full fidelity', async () => {
    apiRequest.mockResolvedValue(view({ id: 'halden', is_demo: true, share_pages: ['dashboard', 'pages', 'cdn'] }))
    renderDemo()

    expect(await screen.findByTestId('page')).toBeInTheDocument()
    expect(apiRequest).toHaveBeenCalledWith('/public/demo')
    expect(scopeShown()).toEqual({
      siteId: 'halden', mode: 'public', basePath: '/demo', pages: ['dashboard', 'pages', 'cdn'], demo: true, fidelity: 'full',
    })
  })

  it("falls back to ciphera.net's dashboard, as /demo was before the sample site, on a 404", async () => {
    apiRequest.mockRejectedValue(apiError(404, { error: 'No demo site' }))
    renderDemo()

    expect(await screen.findByTestId('page')).toBeInTheDocument()
    expect(scopeShown()).toEqual({
      siteId: FALLBACK_DEMO_SITE_ID, mode: 'public', basePath: '/demo', pages: ['dashboard'], demo: false, fidelity: 'scoped',
    })
  })

  it('shows a failure with Retry when the view cannot be read, and the page once a retry succeeds', async () => {
    apiRequest.mockRejectedValueOnce(apiError(500, { error: 'boom' }))
    renderDemo()

    expect(await screen.findByText("This dashboard didn't load")).toBeInTheDocument()
    expect(screen.queryByTestId('page')).toBeNull()

    apiRequest.mockResolvedValue(view({ id: 'halden', is_demo: true, share_pages: ['dashboard'] }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByTestId('page')).toBeInTheDocument()
    expect(apiRequest).toHaveBeenCalledTimes(2)
  })

  it('shows a failure, not the fallback, for any answer but 404 (no ask for a password: there is no site yet)', async () => {
    apiRequest.mockRejectedValue(apiError(401, { is_protected: true }))
    renderDemo()
    expect(await screen.findByText("This dashboard didn't load")).toBeInTheDocument()
    expect(screen.queryByText('Protected Dashboard')).toBeNull()
  })

  it('draws a skeleton, not the page, while the view is on its way', async () => {
    apiRequest.mockReturnValue(new Promise(() => {}))
    const { container } = renderDemo()
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByTestId('page')).toBeNull()
  })
})

describe('/share/<id>', () => {
  it('reads the id from the link and uses the pages the view shares, scoped, for a customer', async () => {
    apiRequest.mockResolvedValue(view({ share_pages: ['funnels', 'dashboard', 'visitors'] }))
    renderShare('site-1')

    expect(await screen.findByTestId('page')).toBeInTheDocument()
    expect(apiRequest).toHaveBeenCalledWith('/public/sites/site-1')
    expect(scopeShown()).toEqual({
      siteId: 'site-1', mode: 'public', basePath: '/share/site-1', pages: ['dashboard', 'funnels'], demo: false, fidelity: 'scoped',
    })
  })

  it('reads the sample site behind a share link at full fidelity and calls it a demo', async () => {
    apiRequest.mockResolvedValue(view({ id: 'halden', is_demo: true, share_pages: ['dashboard', 'uptime'] }))
    renderShare('halden')
    expect(await screen.findByTestId('page')).toBeInTheDocument()
    expect(scopeShown()).toMatchObject({ demo: true, fidelity: 'full', basePath: '/share/halden' })
  })

  it("treats a 404 `This page is not shared` as a customer's link: the dashboard, scoped", async () => {
    apiRequest.mockRejectedValue(apiError(404, { error: 'This page is not shared' }))
    renderShare('site-7')

    expect(await screen.findByTestId('page')).toBeInTheDocument()
    expect(scopeShown()).toEqual({
      siteId: 'site-7', mode: 'public', basePath: '/share/site-7', pages: ['dashboard'], demo: false, fidelity: 'scoped',
    })
  })

  it('says there is no such dashboard for a site that does not exist, or an id that is not one', async () => {
    apiRequest.mockRejectedValue(apiError(404, { error: 'Site not found' }))
    const first = renderShare('gone')
    expect(await screen.findByText("This dashboard doesn't exist.")).toBeInTheDocument()
    expect(screen.queryByTestId('page')).toBeNull()
    first.unmount()

    apiRequest.mockRejectedValue(apiError(400, { error: 'invalid path parameter: id must be a valid UUID' }))
    renderShare('not-a-uuid')
    expect(await screen.findByText("This dashboard doesn't exist.")).toBeInTheDocument()
  })

  it('says a site that is not public is not public', async () => {
    apiRequest.mockRejectedValue(apiError(403, { error: 'Access denied' }))
    renderShare('site-1')
    expect(await screen.findByText("This dashboard isn't public.")).toBeInTheDocument()
    expect(screen.queryByTestId('page')).toBeNull()
  })

  it('shows a failure with Retry for a server error', async () => {
    apiRequest.mockRejectedValue(apiError(503))
    renderShare('site-1')
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('encodes the id it puts in the link and in the request', async () => {
    apiRequest.mockResolvedValue(view({ id: 'a b' }))
    renderShare('a b')
    await screen.findByTestId('page')
    expect(apiRequest).toHaveBeenCalledWith('/public/sites/a%20b')
    expect(scopeShown().basePath).toBe('/share/a%20b')
  })
})

describe('a password-protected link', () => {
  async function unlock(password = 'hunter2') {
    fireEvent.change(await screen.findByLabelText('Password'), { target: { value: password } })
    fireEvent.click(screen.getByTestId('captcha'))
    // The submit awaits the API, so its state updates land after the click: let them.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Access Dashboard' }))
    })
  }

  it('shows the gate in place of the page, with the gate copy as it was', async () => {
    apiRequest.mockRejectedValue(apiError(401, { error: 'Invalid or missing password', is_protected: true }))
    renderShare('site-1')

    expect(await screen.findByText('Protected Dashboard')).toBeInTheDocument()
    expect(screen.getByText('This dashboard is password protected. Please enter the password to view stats.')).toBeInTheDocument()
    expect(screen.queryByTestId('page')).toBeNull()
  })

  it('sends the password and the solved captcha, then reads the view again and shows the page', async () => {
    apiRequest.mockRejectedValueOnce(apiError(401, { is_protected: true }))
    renderShare('site-1')
    authenticatePublicDashboard.mockResolvedValue({ status: 'ok' })
    apiRequest.mockRejectedValue(apiError(404, { error: 'This page is not shared' }))

    await unlock()

    await waitFor(() => expect(screen.getByTestId('page')).toBeInTheDocument())
    // (siteId, password, captchaToken, captchaId, captchaSolution)
    expect(authenticatePublicDashboard).toHaveBeenCalledWith('site-1', 'hunter2', 'tok', 'cid', 'sol')
    expect(screen.queryByText('Protected Dashboard')).toBeNull()
    expect(apiRequest).toHaveBeenCalledTimes(2)
    expect(scopeShown()).toMatchObject({ siteId: 'site-1', pages: ['dashboard'], fidelity: 'scoped' })
  })

  it('stays on the gate with the server\'s message when the password is refused, and asks for a fresh captcha', async () => {
    apiRequest.mockRejectedValue(apiError(401, { is_protected: true }))
    renderShare('site-1')
    authenticatePublicDashboard.mockRejectedValue(apiError(401, { error: 'Wrong password' }))

    await unlock('nope')

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Wrong password'))
    expect(screen.getByText('Protected Dashboard')).toBeInTheDocument()
    // The spent challenge is mounted afresh.
    await waitFor(() => expect(captchaMounts.count).toBe(2))
    // And nothing was read again: still locked out.
    expect(apiRequest).toHaveBeenCalledTimes(1)
  })

  it('says "Invalid password or captcha" when a refusal carries no message', async () => {
    apiRequest.mockRejectedValue(apiError(401, { is_protected: true }))
    renderShare('site-1')
    authenticatePublicDashboard.mockRejectedValue(apiError(401))
    await unlock()
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Invalid password or captcha'))
  })

  it('says "Authentication failed" for any other failure', async () => {
    apiRequest.mockRejectedValue(apiError(401, { is_protected: true }))
    renderShare('site-1')
    authenticatePublicDashboard.mockRejectedValue(apiError(500))
    await unlock()
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Authentication failed'))
  })
})

// The share cookie expires while a tab is open. The page's next read answers 401
// `is_protected`, and the gate must come back, with none of the old numbers behind it.
describe('the gate comes back when a later read says protected', () => {
  const probeFetcher = vi.fn()

  function Probe() {
    const { data, error } = useSWR(['probe', 'public:site-1'], () => probeFetcher())
    return <div data-testid="probe">{error ? 'error' : (data ?? 'loading')}</div>
  }
  // A member read under the same root: the unlock must leave it alone.
  const memberFetcher = vi.fn()
  function MemberProbe() {
    const { data } = useSWR(['probe', 'site-1'], () => memberFetcher())
    return <div data-testid="member-probe">{data ?? 'loading'}</div>
  }

  // The page's own mutate, handed out to the test (set in an effect: nothing is assigned while rendering).
  const handle: { mutate: ReturnType<typeof useSWRConfig>['mutate'] } = { mutate: (() => Promise.resolve()) as never }
  const mutate: ReturnType<typeof useSWRConfig>['mutate'] = (...args: unknown[]) =>
    (handle.mutate as (...a: unknown[]) => Promise<unknown>)(...args) as never
  function Handle() {
    const { mutate: bound } = useSWRConfig()
    useEffect(() => {
      handle.mutate = bound
    }, [bound])
    return null
  }

  async function mountedWithData() {
    apiRequest.mockResolvedValue(view())
    probeFetcher.mockResolvedValue('first numbers')
    memberFetcher.mockResolvedValue('member data')
    renderShare('site-1', <><Handle /><Probe /><MemberProbe /></>)
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('first numbers'))
    await waitFor(() => expect(screen.getByTestId('member-probe')).toHaveTextContent('member data'))
  }

  beforeEach(() => {
    probeFetcher.mockReset()
    memberFetcher.mockReset()
  })

  it('replaces the page with the gate when any public read answers 401 is_protected', async () => {
    await mountedWithData()

    probeFetcher.mockRejectedValue(apiError(401, { is_protected: true }))
    await act(async () => { await mutate(['probe', 'public:site-1']) })

    expect(await screen.findByText('Protected Dashboard')).toBeInTheDocument()
    expect(screen.queryByTestId('probe')).toBeNull()
    expect(screen.queryByTestId('page')).toBeNull()
  })

  it('does not lock on any other failure', async () => {
    await mountedWithData()

    probeFetcher.mockRejectedValue(apiError(500))
    await act(async () => { await mutate(['probe', 'public:site-1']).catch(() => {}) })

    expect(screen.queryByText('Protected Dashboard')).toBeNull()
    expect(screen.getByTestId('probe')).toBeInTheDocument()
  })

  it('after the unlock reads the public data afresh: the old numbers are never shown again, member reads are kept', async () => {
    await mountedWithData()
    probeFetcher.mockRejectedValue(apiError(401, { is_protected: true }))
    await act(async () => { await mutate(['probe', 'public:site-1']) })
    await screen.findByText('Protected Dashboard')

    let resolveSecond: (v: string) => void = () => {}
    probeFetcher.mockReset()
    probeFetcher.mockReturnValue(new Promise<string>((resolve) => { resolveSecond = resolve }))
    authenticatePublicDashboard.mockResolvedValue({ status: 'ok' })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByTestId('captcha'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Access Dashboard' }))
    })

    // Back on the page, and what it shows is loading, not the numbers from before the lock
    // nor the failure that locked it.
    await waitFor(() => expect(screen.getByTestId('probe')).toBeInTheDocument())
    expect(screen.getByTestId('probe')).toHaveTextContent('loading')
    expect(screen.queryByText('Protected Dashboard')).toBeNull()
    await act(async () => { resolveSecond('second numbers') })
    expect(screen.getByTestId('probe')).toHaveTextContent('second numbers')
    // A member's read is not a public one: it was never cleared.
    expect(screen.getByTestId('member-probe')).toHaveTextContent('member data')
    // The view was fine, so it was not read again.
    expect(apiRequest).toHaveBeenCalledTimes(1)
  })

  it('can lock a second time', async () => {
    await mountedWithData()
    for (let round = 0; round < 2; round++) {
      probeFetcher.mockReset()
      probeFetcher.mockRejectedValue(apiError(401, { is_protected: true }))
      await act(async () => { await mutate(['probe', 'public:site-1']) })
      await screen.findByText('Protected Dashboard')

      probeFetcher.mockReset()
      probeFetcher.mockResolvedValue(`round ${round}`)
      authenticatePublicDashboard.mockResolvedValue({ status: 'ok' })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
      fireEvent.click(screen.getByTestId('captcha'))
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Access Dashboard' }))
      })
      await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(`round ${round}`))
    }
  })
})

describe('the HTML before the browser takes over', () => {
  it('is the same skeleton for everyone, whoever is asking', () => {
    apiRequest.mockResolvedValue(view({ is_demo: true }))
    const html = () => renderToString(withSWR(<PublicDemoRoot><Page /></PublicDemoRoot>))

    document.cookie = 'pulse_access=signed-in-token; path=/'
    const signedIn = html()
    document.cookie = 'pulse_access=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    const anonymous = html()

    expect(signedIn).toBe(anonymous)
    expect(anonymous).toContain('aria-busy="true"')
    expect(anonymous).not.toContain('the page')
    // The server asks the API for nothing.
    expect(apiRequest).not.toHaveBeenCalled()
  })
})
