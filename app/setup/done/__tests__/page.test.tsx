import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}))

vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { org_id: 'org_1' } }),
}))

vi.mock('@/lib/setup/context', () => ({
  useSetup: () => ({ site: null, completeStep: vi.fn() }),
}))

vi.mock('@/lib/api/organization', () => ({
  completeOnboarding: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/lib/api/stats', () => ({
  getRealtime: vi.fn().mockResolvedValue({ visitors: 0 }),
}))

const getSubscription = vi.fn()
vi.mock('@/lib/api/billing', () => ({
  getSubscription: (...args: unknown[]) => getSubscription(...args),
}))

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => ({ children, ...rest }: any) => <div className={rest.className}>{children}</div> }),
}))

vi.mock('@ciphera-net/facet', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Spinner: (props: any) => <div data-testid="spinner" {...props} />,
  CheckCircleIcon: () => <span />,
  UsersIcon: () => <span />,
  BookOpenIcon: () => <span />,
  FunnelIcon: () => <span />,
}))

import SetupDonePage from '../page'

function setSearch(search: string) {
  window.history.replaceState({}, '', '/setup/done' + search)
}

beforeEach(() => {
  getSubscription.mockReset()
  mockPush.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  setSearch('')
})

describe('SetupDonePage payment confirmation', () => {
  it('renders the success content directly for Hobby skippers (no from=checkout)', () => {
    setSearch('')
    render(<SetupDonePage />)
    expect(screen.getByText(/You're all set!/)).toBeTruthy()
    expect(getSubscription).not.toHaveBeenCalled()
  })

  it('confirms an active subscription before showing success', async () => {
    setSearch('?from=checkout')
    getSubscription.mockResolvedValue({ subscription_status: 'active' })
    render(<SetupDonePage />)
    // The success claim must be earned — confirming state first…
    expect(screen.getByText(/Confirming your payment/)).toBeTruthy()
    // …then flips once the subscription reads active.
    expect(await screen.findByText(/You're all set!/)).toBeTruthy()
  })

  it('shows the unconfirmed state when the subscription never activates', async () => {
    vi.useFakeTimers()
    setSearch('?from=checkout')
    getSubscription.mockResolvedValue({ subscription_status: '' })
    render(<SetupDonePage />)
    expect(screen.getByText(/Confirming your payment/)).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000)
    })
    expect(screen.getByText(/couldn't confirm your payment/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'View billing' })).toBeTruthy()
    expect(screen.queryByText(/You're all set!/)).toBeNull()
  })
})
