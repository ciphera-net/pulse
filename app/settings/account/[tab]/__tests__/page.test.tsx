import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Every dynamically-imported tab collapses to one identifiable stub.
vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="tab-content">tab</div>,
}))

const h = vi.hoisted(() => ({ tab: 'profile', replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useParams: () => ({ tab: h.tab }),
  useRouter: () => ({ replace: h.replace }),
}))

import AccountSettingsTabPage from '../page'

beforeEach(() => {
  h.tab = 'profile'
  h.replace.mockClear()
})

describe('Account settings tab routing (notifications moved here)', () => {
  it('renders personal notification preferences at /account/notifications — no redirect', () => {
    h.tab = 'notifications'
    render(<AccountSettingsTabPage />)
    expect(screen.getByTestId('tab-content')).toBeInTheDocument()
    // The old account→org redirect for notifications is flipped: it stays here.
    expect(h.replace).not.toHaveBeenCalled()
  })

  it('renders known account tabs', () => {
    h.tab = 'devices'
    render(<AccountSettingsTabPage />)
    expect(screen.getByTestId('tab-content')).toBeInTheDocument()
    expect(h.replace).not.toHaveBeenCalled()
  })

  it('redirects unknown tabs to the section default', () => {
    h.tab = 'made-up'
    render(<AccountSettingsTabPage />)
    expect(h.replace).toHaveBeenCalledWith('/settings/account/profile')
  })
})
