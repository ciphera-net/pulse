import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import FleetHeader from '@/components/sites/FleetHeader'

describe('FleetHeader', () => {
  it('renders the fused Add Site control with the N/M counter', () => {
    render(<FleetHeader siteCount={2} siteLimit={3} canCreate={true} />)
    const add = screen.getByRole('link', { name: /Add Site/ })
    expect(add.getAttribute('href')).toBe('/sites/new')
    expect(add.textContent).toContain('2/3')
    expect(screen.getByRole('heading', { name: 'Your Sites' })).toBeTruthy()
  })

  it('hands over to the upgrade control at the plan limit', () => {
    render(<FleetHeader siteCount={3} siteLimit={3} canCreate={true} />)
    const upgrade = screen.getByRole('link', { name: '3 of 3 sites used — upgrade for more' })
    expect(upgrade.getAttribute('href')).toBe('/switch')
    expect(screen.queryByRole('link', { name: /Add Site/ })).toBeNull()
  })

  it('renders counter-only chrome without sites.create', () => {
    render(<FleetHeader siteCount={2} siteLimit={3} canCreate={false} />)
    expect(screen.queryByRole('link', { name: /Add Site/ })).toBeNull()
    expect(screen.getByText('2/3')).toBeTruthy()
  })

  it('shows a plain count on unlimited plans', () => {
    render(<FleetHeader siteCount={7} siteLimit={null} canCreate={true} />)
    expect(screen.getByRole('link', { name: /Add Site/ }).textContent).toContain('7 sites')
  })
})
