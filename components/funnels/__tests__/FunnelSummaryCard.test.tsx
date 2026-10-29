import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// The funnels list row knows no route: its link is the one the list built from the scope
// (scopeHref), and edit and delete exist only when the list says the scope may write (PUL-34).

vi.mock('@/components/ui/animated-number', () => ({
  AnimatedNumber: ({ value }: { value: number }) => <span>{value}</span>,
}))
vi.mock('@/components/funnels/FunnelColumns', () => ({
  FunnelColumns: () => <div data-testid="columns" />,
  formatFunnelPct: (v: number) => `${v}%`,
}))

import { FunnelSummaryCard } from '../FunnelSummaryCard'

const FUNNEL = {
  id: 'f1',
  site_id: 'site-1',
  name: 'Signup flow',
  description: '',
  steps: [
    { order: 0, name: 'Step 1', value: '/pricing', type: 'exact', category: 'page' as const },
    { order: 1, name: 'Step 2', value: 'signup', type: 'exact', category: 'event' as const },
  ],
  created_at: '',
  updated_at: '',
}

const STATS = {
  funnel_id: 'f1',
  steps: [
    { step: FUNNEL.steps[0], visitors: 100, dropoff: null, conversion: 100, exit_pages: [] },
    { step: FUNNEL.steps[1], visitors: 25, dropoff: 75, conversion: 25, exit_pages: [] },
  ],
}

const renderCard = (over: Partial<React.ComponentProps<typeof FunnelSummaryCard>> = {}) =>
  render(
    <FunnelSummaryCard
      funnel={FUNNEL}
      href="/demo/funnels/f1?period=7"
      canManage={false}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      {...over}
    />,
  )

describe('FunnelSummaryCard', () => {
  it('links to exactly the href it was given, whatever scope that is', () => {
    const { unmount } = renderCard({ href: '/demo/funnels/f1?period=7' })
    expect(screen.getByRole('link')).toHaveAttribute('href', '/demo/funnels/f1?period=7')
    unmount()

    renderCard({ href: '/sites/site-1/funnels/f1' })
    expect(screen.getByRole('link')).toHaveAttribute('href', '/sites/site-1/funnels/f1')
  })

  it('has no edit or delete unless the list says the scope may write', () => {
    renderCard({ canManage: false })
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers edit and delete, and hands the funnel to each, when the list says so', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    renderCard({ canManage: true, onEdit, onDelete })
    fireEvent.click(screen.getByRole('button', { name: 'Edit Signup flow' }))
    expect(onEdit).toHaveBeenCalledWith(FUNNEL)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Signup flow' }))
    expect(onDelete).toHaveBeenCalledWith({ id: 'f1', name: 'Signup flow' })
  })

  it('shows the denominator with the conversion, and an em dash while there are no stats', () => {
    const { unmount } = renderCard({ stats: STATS })
    expect(screen.getByText('25 of 100 entered')).toBeInTheDocument()
    expect(screen.getByTestId('columns')).toBeInTheDocument()
    unmount()

    renderCard({ stats: undefined })
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByTestId('columns')).toBeNull()
  })
})
