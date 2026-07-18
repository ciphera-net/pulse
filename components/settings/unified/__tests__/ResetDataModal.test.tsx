import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------

const resetSiteData = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/sites', () => ({
  resetSiteData: (...a: unknown[]) => resetSiteData(...a),
}))

// The Radix Dialog shell is not the unit under test — render its content inline.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: any) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: any[]) => args.flat().filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  Checkbox: ({ checked, onChange, label, indeterminate: _i, ...props }: any) => (
    <button role="checkbox" aria-checked={checked} onClick={onChange} {...props}>{label}</button>
  ),
  Banner: ({ title, children }: any) => <div role="alert">{title}{children}</div>,
  Spinner: () => <div>loading</div>,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

import ResetDataModal from '../ResetDataModal'

const onReset = vi.fn()
const onClose = vi.fn()

beforeEach(() => {
  resetSiteData.mockClear()
  onReset.mockClear()
  onClose.mockClear()
})

function renderModal() {
  return render(
    <ResetDataModal open onClose={onClose} onReset={onReset} siteDomain="acme.com" siteId="s1" />,
  )
}

describe('ResetDataModal (Facet danger panel)', () => {
  it('lists every reset module and stays inert until a module is picked', () => {
    renderModal()
    expect(screen.getByText('Analytics')).toBeInTheDocument()
    expect(screen.getByText('Search Console')).toBeInTheDocument()
    // No confirmation UI until at least one module is selected.
    expect(screen.queryByText(/to confirm/i)).toBeNull()
  })

  it('gates a PARTIAL reset behind typing RESET, then calls resetSiteData with the picked ids', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: /Analytics/ }))

    const confirmBtn = screen.getByRole('button', { name: /Reset 1 Module/ })
    expect(confirmBtn).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('RESET'), { target: { value: 'RESET' } })
    await waitFor(() => expect(confirmBtn).not.toBeDisabled())

    fireEvent.click(confirmBtn)
    await waitFor(() => expect(resetSiteData).toHaveBeenCalledWith('s1', ['analytics']))
  })

  it('escalates the confirmation to the site domain when ALL modules are selected', () => {
    renderModal()
    // Toggle every module row on.
    for (const label of ['Analytics', 'Journeys', 'Funnels', 'Uptime', 'PageSpeed', 'CDN', 'Search Console']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }))
    }
    // Full wipe demands the domain, not the RESET keyword.
    expect(screen.getByPlaceholderText('acme.com')).toBeInTheDocument()
    const confirmBtn = screen.getByRole('button', { name: /Reset 7 Modules/ })
    fireEvent.change(screen.getByPlaceholderText('acme.com'), { target: { value: 'RESET' } })
    expect(confirmBtn).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('acme.com'), { target: { value: 'acme.com' } })
    expect(confirmBtn).not.toBeDisabled()
  })
})
