import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'


import { MapHeadline } from '../MapHeadline'

// PUL-14: the map has no tooltip; its headline shows the total and trend at
// rest and the hovered country's visitors and share while hovering.
describe('MapHeadline', () => {
  it('shows the total and the rail trend at rest', () => {
    render(<MapHeadline total={187} previous={167} hover={null} />)
    expect(screen.getByText('187')).toBeTruthy()
    expect(screen.getByText('Visitors')).toBeTruthy()
    expect(screen.getByText(/12%/)).toBeTruthy()
  })

  it('shows no trend when the comparison is too small, as the rail does', () => {
    render(<MapHeadline total={6} previous={4} hover={null} />)
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it('swaps to the hovered country, its count and share', () => {
    render(<MapHeadline total={187} previous={167} hover={{ country: 'BE', name: 'Belgium', visitors: 25 }} />)
    expect(screen.getByText('25')).toBeTruthy()
    expect(screen.getByText('Belgium')).toBeTruthy()
    expect(screen.getByText('13% of visitors')).toBeTruthy()
    expect(screen.queryByText(/12%/)).toBeNull()
  })

  it('renders nothing without totals (no denominator)', () => {
    const { container } = render(<MapHeadline total={null} previous={null} hover={null} />)
    expect(container.innerHTML).toBe('')
  })
})
