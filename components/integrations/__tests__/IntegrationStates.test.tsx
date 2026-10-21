import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MagnifyingGlass } from '@phosphor-icons/react'

const mockUseCan = vi.fn<(permission: string) => boolean>(() => true)
vi.mock('@/lib/auth/permissions', () => ({ useCan: (permission: string) => mockUseCan(permission) }))

import { IntegrationOffState } from '../IntegrationStates'
import { SiteScopeProvider, type SiteScope } from '@/lib/scope/SiteScope'
import { DEMO, MEMBER, SHARE_LINK } from '@/components/surfaces/__tests__/integrationHarness'

beforeEach(() => {
  mockUseCan.mockReset().mockReturnValue(true)
})
afterEach(cleanup)

const offState = (scope: SiteScope) =>
  render(
    <SiteScopeProvider scope={scope}>
      <IntegrationOffState
        rails={['Clicks', 'Impressions']}
        icon={<MagnifyingGlass />}
        connect={{
          heading: 'Connect it',
          body: 'Member body.',
          actionLabel: 'Connect in Settings',
          href: '/settings/site/integrations',
          fallback: 'An owner or admin can connect it.',
        }}
        absent={{ heading: 'It is not connected', body: 'Public body.' }}
      />
    </SiteScopeProvider>,
  )

describe('IntegrationOffState', () => {
  it('offers a member who may connect it the way to', () => {
    offState(MEMBER)
    expect(screen.getByRole('heading', { name: 'Connect it' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connect in Settings' })).toHaveAttribute('href', '/settings/site/integrations')
    expect(mockUseCan).toHaveBeenCalledWith('integrations.manage')
  })

  it('tells a member who may not connect it who can', () => {
    mockUseCan.mockReturnValue(false)
    offState(MEMBER)
    expect(screen.getByText('An owner or admin can connect it.')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('tells a public visitor it is not connected, with nothing to click, and reads no permission', () => {
    const { container } = offState(DEMO)
    expect(screen.getByRole('heading', { name: 'It is not connected' })).toBeInTheDocument()
    expect(screen.getByText('Public body.')).toBeInTheDocument()
    expect(screen.getByText('Nothing to show yet.')).toBeInTheDocument()
    expect(screen.queryByText('Connect it')).toBeNull()
    expect(container.querySelectorAll('a[href], button')).toHaveLength(0)
    expect(mockUseCan).not.toHaveBeenCalled()
  })
})
