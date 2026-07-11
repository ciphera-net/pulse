import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SiteLimitUpgradeButton from '@/components/dashboard/SiteLimitUpgradeButton'

describe('SiteLimitUpgradeButton', () => {
  it('renders one control linking to /pricing with the usage welled in', () => {
    render(<SiteLimitUpgradeButton used={3} limit={3} />)
    const link = screen.getByRole('link', { name: '3 of 3 sites used — upgrade for more' })
    expect(link.getAttribute('href')).toBe('/pricing')
    expect(link.textContent).toContain('Upgrade for more sites')
    expect(link.textContent).toContain('3/3')
  })

  it('reflects other plan limits in the count', () => {
    render(<SiteLimitUpgradeButton used={5} limit={5} />)
    expect(screen.getByText('5/5')).toBeTruthy()
  })
})
