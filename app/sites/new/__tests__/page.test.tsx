import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEffect } from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { SWRConfig, useSWRConfig } from 'swr'
import type { Site } from '@/lib/api/sites'

// /sites/new's plan-limit gate vs. the shared sites cache (11-09-2026).
//
// The created site is written straight into the sites cache (lib/swr/sites.tsx,
// useSitesCache().addSite). That is the fix for a fleet that said "No sites
// yet" after the wizard — and it exposed this page's limit check, which
// depended on `sites` and bounced to `/` whenever `sites.length >= siteLimit`.
// Creating the site that FILLS the limit re-ran the check on the new count and
// yanked the person off the install snippet for the site they were just
// allowed to create. Caught in review, against the real page in a real
// provider cache; the harness below is that reproduction, kept.

const push = vi.fn()
const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
}))

const listSites = vi.fn<() => Promise<Site[]>>()
const createSite = vi.fn<(d: unknown) => Promise<Site>>()
const getSite = vi.fn<(id: string) => Promise<Site>>()
vi.mock('@/lib/api/sites', () => ({
  listSites: () => listSites(),
  createSite: (d: unknown) => createSite(d),
  getSite: (id: string) => getSite(id),
  getSitesOverview: vi.fn().mockResolvedValue([]),
}))
const getSubscription = vi.fn().mockResolvedValue({ plan_id: 'pioneer' }) // limit 3 (lib/plans.ts)
vi.mock('@/lib/api/billing', () => ({
  getSubscription: () => getSubscription(),
}))
vi.mock('@/lib/utils/favicon', () => ({ FAVICON_SERVICE_URL: 'https://icons.example' }))
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/welcomeAnalytics', () => ({
  trackSiteCreatedFromDashboard: vi.fn(),
  trackSiteCreatedScriptCopied: vi.fn(),
}))
const toastError = vi.fn()
vi.mock('@ciphera-net/facet', () => ({
  toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) },
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  CheckCircleIcon: () => <span />,
}))
vi.mock('@/components/sites/ScriptSetupBlock', () => ({
  default: ({ siteId }: { siteId: string }) => <div data-testid="script-setup-block">{siteId}</div>,
}))

import NewSitePage from '../page'

const mk = (id: string): Site =>
  ({ id, user_id: 'u', domain: `${id}.example`, name: id, uptime_enabled: false, created_at: '2026-09-11T20:00:00Z' }) as Site

// A sibling inside the same provider, standing in for the other useSites()
// consumers mounted alongside /sites/new (the shell, the sidebar switcher):
// its bound mutate lets a test change the shared list from "elsewhere".
type SharedMutate = ReturnType<typeof useSWRConfig>['mutate']
function Elsewhere({ onReady }: { onReady: (m: SharedMutate) => void }) {
  const { mutate } = useSWRConfig()
  useEffect(() => { onReady(mutate) }, [mutate, onReady])
  return null
}

let mutateShared: SharedMutate
function renderPage() {
  const cache = new Map<string, unknown>()
  render(
    <SWRConfig value={{ provider: () => cache as never }}>
      <Elsewhere onReady={(m) => { mutateShared = m }} />
      <NewSitePage />
    </SWRConfig>,
  )
  return { cache }
}

beforeEach(() => {
  push.mockClear()
  replace.mockClear()
  toastError.mockClear()
  listSites.mockReset()
  createSite.mockReset()
  getSite.mockReset()
  sessionStorage.clear()
})

describe('NewSitePage plan-limit gate', () => {
  it('creating the site that fills the limit keeps the success screen — no bounce, no "limit reached"', async () => {
    listSites.mockResolvedValue([mk('one'), mk('two')]) // 2 of 3
    const third = mk('three')
    createSite.mockResolvedValue(third)
    const { cache } = renderPage()

    const submit = await screen.findByRole('button', { name: /create|add/i })
    await waitFor(() => expect(submit).not.toBeDisabled())
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'three' } })
    fireEvent.change(screen.getByLabelText(/domain/i), { target: { value: 'three.example' } })
    fireEvent.click(submit)

    await screen.findByTestId('script-setup-block')
    // The write really landed in the shared cache, and the gate did not re-fire on it.
    await waitFor(() => expect((cache.get('sites') as { data?: Site[] }).data).toHaveLength(3))
    expect(screen.getByTestId('script-setup-block').textContent).toBe('three')
    expect(replace).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('"Edit site details" after filling the limit returns to the form with the at-limit notice and Create OFF at once — never a bounce', async () => {
    listSites.mockResolvedValue([mk('one'), mk('two')])
    createSite.mockResolvedValue(mk('three'))
    renderPage()
    const submit = await screen.findByRole('button', { name: /create|add/i })
    await waitFor(() => expect(submit).not.toBeDisabled())
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'three' } })
    fireEvent.change(screen.getByLabelText(/domain/i), { target: { value: 'three.example' } })
    fireEvent.click(submit)
    await screen.findByTestId('script-setup-block')

    fireEvent.click(screen.getByRole('button', { name: 'Edit site details' }))
    // The form is back and Create is off in the SAME render — `atLimit` is
    // derived from the live list, not a flag that catches up after a fetch.
    expect(screen.getByRole('button', { name: /create|add/i })).toBeDisabled()
    expect(screen.getByText(/Plan limit reached/)).toBeTruthy()
    // Even a submit that bypasses the disabled button never reaches the API.
    fireEvent.submit(screen.getByRole('button', { name: /create|add/i }).closest('form')!)
    await new Promise((r) => setTimeout(r, 30))
    expect(createSite).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('a stored site that no longer exists makes the visit an ARRIVAL — at the limit it bounces like one', async () => {
    sessionStorage.setItem('pulse_last_created_site', JSON.stringify({ id: 'gone' }))
    listSites.mockResolvedValue([mk('one'), mk('two'), mk('three')]) // 3 of 3, none of them "gone"
    getSite.mockRejectedValue(new Error('404'))
    renderPage()
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/limit reached \(3 sites\)/))
    expect(sessionStorage.getItem('pulse_last_created_site')).toBeNull()
  })

  it('reloading the success screen at the limit is not an arrival — even when the sites list settles before the site does', async () => {
    // sessionStorage still names the created site; the page rehydrates it with
    // getSite. Make the unrelated sites list resolve FIRST (3 of 3) and hold the
    // site fetch back, which is the ordering that used to bounce.
    sessionStorage.setItem('pulse_last_created_site', JSON.stringify({ id: 'three' }))
    listSites.mockResolvedValue([mk('one'), mk('two'), mk('three')])
    let releaseSite!: (s: Site) => void
    getSite.mockReturnValue(new Promise<Site>((r) => { releaseSite = r }))
    renderPage()

    await waitFor(() => expect(listSites).toHaveBeenCalled())
    // Give the limit effect every chance to fire on the settled list.
    await waitFor(() => expect(getSite).toHaveBeenCalledWith('three'))
    await new Promise((r) => setTimeout(r, 50))
    expect(replace).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()

    releaseSite(mk('three'))
    await screen.findByTestId('script-setup-block')
    expect(screen.getByTestId('script-setup-block').textContent).toBe('three')
  })

  it('a submit before the plan check has settled never reaches the API', async () => {
    listSites.mockResolvedValue([mk('one'), mk('two'), mk('three')]) // at the limit, not yet known to the client
    let releasePlan!: (v: unknown) => void
    getSubscription.mockReturnValueOnce(new Promise((r) => { releasePlan = r }))
    renderPage()
    const submit = await screen.findByRole('button', { name: /create|add/i })
    expect(submit).toBeDisabled() // held until the check has run once
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'four' } })
    fireEvent.change(screen.getByLabelText(/domain/i), { target: { value: 'four.example' } })
    fireEvent.submit(submit.closest('form')!) // Enter-key path, bypassing the disabled button
    await new Promise((r) => setTimeout(r, 30))
    expect(createSite).not.toHaveBeenCalled()
    releasePlan({ plan_id: 'pioneer' })
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/')) // and then the arrival rule applies
    expect(createSite).not.toHaveBeenCalled()
  })

  it('a plan check that never settles fails OPEN after the wait — the server is the backstop, a dead form is not', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      listSites.mockResolvedValue([mk('one')])
      getSubscription.mockReturnValueOnce(new Promise(() => {})) // hangs forever
      renderPage()
      const submit = await screen.findByRole('button', { name: /create|add/i })
      expect(submit).toBeDisabled()
      await act(async () => { vi.advanceTimersByTime(8_100) })
      expect(submit).not.toBeDisabled()
      expect(replace).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('never bounces a person whose own creation is in flight, even if the list fills up from elsewhere meanwhile', async () => {
    listSites.mockResolvedValue([mk('one'), mk('two')]) // 2 of 3
    let releaseCreate!: (s: Site) => void
    createSite.mockReturnValue(new Promise<Site>((r) => { releaseCreate = r }))
    renderPage()
    const submit = await screen.findByRole('button', { name: /create|add/i })
    await waitFor(() => expect(submit).not.toBeDisabled())
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'three' } })
    fireEvent.change(screen.getByLabelText(/domain/i), { target: { value: 'three.example' } })
    fireEvent.click(submit)
    await waitFor(() => expect(createSite).toHaveBeenCalledTimes(1))

    // A teammate's creation lands in the shared list while ours is pending.
    await act(async () => { await mutateShared('sites', [mk('one'), mk('two'), mk('theirs')], { revalidate: false }) })
    await new Promise((r) => setTimeout(r, 30))
    expect(replace).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()

    // Ours resolves: its own outcome is what the person sees.
    releaseCreate(mk('three'))
    await screen.findByTestId('script-setup-block')
    expect(replace).not.toHaveBeenCalled()
  })

  it('arriving AT the limit still bounces home with the limit toast, as before', async () => {
    listSites.mockResolvedValue([mk('one'), mk('two'), mk('three')]) // 3 of 3
    renderPage()
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/limit reached \(3 sites\)/))
    expect(createSite).not.toHaveBeenCalled()
  })
})
