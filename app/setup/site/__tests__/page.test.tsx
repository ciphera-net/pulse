import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// P5 wizard-step tests (25-08-2026): the site step's ruled-C1 resume view —
// an org that already has a site gets "Pick up where you left off" (fact row,
// Continue to install, quiet add-another), never the create form that invited
// duplicate sites; a fresh org still gets the create form; and skipping must
// NOT mark the step complete (skip ≠ done, the server-truth stepper contract).

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const setSite = vi.fn()
const completeStep = vi.fn()
vi.mock('@/lib/setup/context', () => ({
  useSetup: () => ({ setSite, completeStep }),
}))

let sitesState: { sites: unknown[]; isLoading: boolean } = { sites: [], isLoading: false }
vi.mock('@/lib/swr/sites', () => ({
  useSites: () => sitesState,
  mutateSites: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/api/sites', () => ({
  createSite: vi.fn(),
  detectFramework: vi.fn().mockResolvedValue({}),
}))

const trackSkipped = vi.fn()
vi.mock('@/lib/welcomeAnalytics', () => ({
  trackWelcomeSiteAdded: vi.fn(),
  trackWelcomeSiteSkipped: (...args: unknown[]) => trackSkipped(...args),
}))

vi.mock('@ciphera-net/facet', () => ({
  getAuthErrorMessage: () => '',
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  Spinner: (props: any) => <div data-testid="spinner" {...props} />,
  GlobeIcon: () => <span />,
}))

import SetupSitePage from '../page'

const site = (domain: string, createdAt: string) => ({
  id: 'site-' + domain,
  domain,
  created_at: createdAt,
  verified: true,
})

beforeEach(() => {
  mockPush.mockClear()
  setSite.mockClear()
  completeStep.mockClear()
  trackSkipped.mockClear()
  sitesState = { sites: [], isLoading: false }
})

describe('SetupSitePage', () => {
  it('shows the resume view when the org already has a site — never the create form', () => {
    sitesState = { sites: [site('example.com', '2026-08-01T00:00:00Z')], isLoading: false }
    render(<SetupSitePage />)
    expect(screen.getByText('Pick up where you left off')).toBeTruthy()
    expect(screen.getByText('example.com')).toBeTruthy()
    expect(screen.queryByRole('form')).toBeNull()
  })

  it('resumes with the NEWEST site and routes Continue to install with it', () => {
    sitesState = {
      sites: [site('old.com', '2026-07-01T00:00:00Z'), site('new.com', '2026-08-20T00:00:00Z')],
      isLoading: false,
    }
    render(<SetupSitePage />)
    expect(screen.getByText('new.com')).toBeTruthy()
    fireEvent.click(screen.getByText('Continue to install'))
    expect(setSite).toHaveBeenCalledWith(expect.objectContaining({ domain: 'new.com' }))
    expect(mockPush).toHaveBeenCalledWith('/setup/install')
  })

  it('lets "Add another site" reach the create form from the resume view', () => {
    sitesState = { sites: [site('example.com', '2026-08-01T00:00:00Z')], isLoading: false }
    render(<SetupSitePage />)
    fireEvent.click(screen.getByText('Add another site'))
    expect(screen.queryByText('Pick up where you left off')).toBeNull()
  })

  it('shows the create form for a fresh org', () => {
    render(<SetupSitePage />)
    expect(screen.queryByText('Pick up where you left off')).toBeNull()
  })

  it('shows only a spinner while sites load — no create-form flash', () => {
    sitesState = { sites: [], isLoading: true }
    render(<SetupSitePage />)
    expect(screen.getByTestId('spinner')).toBeTruthy()
    expect(screen.queryByText('Pick up where you left off')).toBeNull()
  })

  // best-way-B (owner ruling 05-09): the site step is a hard gate — there is no
  // skip. A workspace needs one site to produce any data, so the only forward
  // move on the create form is to add a site. This test used to assert the skip
  // existed and routed to /setup/plan; it now pins that it is GONE.
  it('has NO skip control — the step is a hard gate', () => {
    render(<SetupSitePage />)
    expect(screen.queryByText('Skip for now')).toBeNull()
    // and nothing here routes to /setup/plan (the old skip's destination)
    expect(mockPush).not.toHaveBeenCalledWith('/setup/plan')
    expect(trackSkipped).not.toHaveBeenCalled()
  })
})
