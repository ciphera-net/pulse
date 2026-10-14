import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// DeleteFunnelDialog is a thin wrapper over facet-hold's HoldDialog (PUL-28):
// both the funnels list and detail pages share this one component. The hold
// itself and the Undo window are facet-hold's own suite; here a confirm is
// one click, as the stand-in renders it.
vi.mock('@ciphera-net/facet-hold', async () =>
  (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())

import { DeleteFunnelDialog } from '../DeleteFunnelDialog'

const onCancel = vi.fn()
const onConfirm = vi.fn()

beforeEach(() => {
  onCancel.mockReset()
  onConfirm.mockReset()
})

describe('DeleteFunnelDialog', () => {
  it('names the funnel in a question title, with a Hold to delete button', () => {
    render(<DeleteFunnelDialog open funnelName="Signup flow" onCancel={onCancel} onConfirm={onConfirm} />)
    expect(screen.getByRole('dialog', { name: 'Delete "Signup flow"?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hold to delete' })).toBeInTheDocument()
    // No raw bg-red-600 button and no "cannot be undone" claim.
    expect(screen.queryByText(/cannot be undone/i)).toBeNull()
  })

  it('renders nothing when closed', () => {
    render(<DeleteFunnelDialog open={false} funnelName="Signup flow" onCancel={onCancel} onConfirm={onConfirm} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('calls onConfirm on the hold, and onCancel on Cancel', () => {
    render(<DeleteFunnelDialog open funnelName="Signup flow" onCancel={onCancel} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onConfirm when the hold completes, and closes itself (onCancel closes the dialog state either way)', () => {
    render(<DeleteFunnelDialog open funnelName="Signup flow" onCancel={onCancel} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
