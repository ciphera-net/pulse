import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// The install step after the 11-09-2026 rebuild. Two things are pinned here
// because both were the trap: (1) Continue goes to the DASHBOARD, not to a
// pricing page — unless the person brought a plan with them from the pricing
// page, in which case checkout is what they came for; (2) there is no
// "Skip for now" any more, because it was a door that was not a door.

const mockPush = vi.fn()
let search = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  useSearchParams: () => search,
}))

const completeStep = vi.fn()
let site: { id: string; name: string; domain: string } | null = { id: 's1', name: 'walltest.mubaig.com', domain: 'walltest.mubaig.com' }
let pendingPlan: { planId: string; interval: string; limit: number } | null = null
vi.mock('@/lib/setup/context', () => ({
  useSetup: () => ({ site, pendingPlan, completeStep }),
}))

vi.mock('@/lib/swr/sites', () => ({
  useSites: () => ({ sites: [], isLoading: false }),
}))
vi.mock('@/lib/api/sites', () => ({ verifySite: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/components/sites/ScriptSetupBlock', () => ({ default: () => <div data-testid="script-block" /> }))
vi.mock('@/components/setup/InstallStateBlock', () => ({ default: () => <div data-testid="install-state" /> }))
vi.mock('@/components/sites/SiteFavicon', () => ({ SiteFavicon: () => <span data-testid="favicon" /> }))
vi.mock('@ciphera-net/facet', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Spinner: (props: any) => <div data-testid="spinner" {...props} />,
}))

import SetupInstallPage from '../page'
import { SETUP_COPY } from '@/lib/setup/copy'

beforeEach(() => {
  mockPush.mockClear()
  completeStep.mockClear()
  search = new URLSearchParams()
  site = { id: 's1', name: 'walltest.mubaig.com', domain: 'walltest.mubaig.com' }
  pendingPlan = null
})

describe('SetupInstallPage', () => {
  it('reads its heading and line from the one copy file, and shows the site as a chip', () => {
    render(<SetupInstallPage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(SETUP_COPY.install.heading)
    expect(screen.getByText(SETUP_COPY.install.dek)).toBeTruthy()
    expect(screen.getByTestId('site-chip').textContent).toContain('walltest.mubaig.com')
  })

  // 🔴 THE FIX. Step 4 used to be a pricing page; two of two external signups
  // reached it and left. Continue now goes to done.
  it('Continue goes to /setup/done, never to the plan step, for a normal signup', () => {
    render(<SetupInstallPage />)
    fireEvent.click(screen.getByRole('button', { name: SETUP_COPY.installContinue }))
    expect(completeStep).toHaveBeenCalledWith('install')
    expect(mockPush).toHaveBeenCalledWith('/setup/done')
    expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('/setup/plan'))
  })

  // 🔑 THE ONE EXCEPTION: intent the person brought with them. Somebody who
  // picked a plan on the pricing page carries it through the wizard, and for
  // them checkout is what they came for — cutting this edge would land a buyer
  // on /setup/done and never ask them to pay.
  it('Continue goes to checkout, keeping the chosen plan, when a plan was brought from the pricing page', () => {
    pendingPlan = { planId: 'business', interval: 'year', limit: 100000 }
    search = new URLSearchParams('plan=business&interval=year&limit=100000')
    render(<SetupInstallPage />)
    fireEvent.click(screen.getByRole('button', { name: SETUP_COPY.installContinueToCheckout }))
    expect(mockPush).toHaveBeenCalledWith('/setup/plan?plan=business&interval=year&limit=100000')
  })

  it('has NO "Skip for now" — leaving is free because Continue leads to the dashboard', () => {
    render(<SetupInstallPage />)
    expect(screen.queryByText(/skip for now/i)).toBeNull()
  })

  it('still explains itself when no site is attached, and offers the way back', () => {
    site = null
    render(<SetupInstallPage />)
    expect(screen.getByText(/no site is attached/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to site setup' }))
    expect(mockPush).toHaveBeenCalledWith('/setup/site')
  })
})
