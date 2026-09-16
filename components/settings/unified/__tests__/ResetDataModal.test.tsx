import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// --- Mocks ---------------------------------------------------------------

const resetSiteData = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/sites', () => ({
  resetSiteData: (...a: unknown[]) => resetSiteData(...a),
}))

vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: any[]) => args.flat().filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  // Facet's real Checkbox is a role="checkbox" button (never a native
  // <input>), independently of whether it renders the "select all" row or a
  // module row — the ONE idiom this rebuild pins.
  Checkbox: ({ checked, onChange, label, indeterminate: _i, ...props }: any) => (
    <button role="checkbox" aria-checked={checked} onClick={onChange} {...props}>{label}</button>
  ),
  // Facet's real Modal only renders its content while isOpen is true.
  Modal: ({ isOpen, title, children }: any) => (isOpen ? <div><h2>{title}</h2>{children}</div> : null),
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
    fireEvent.click(screen.getByRole('checkbox', { name: /Analytics/ }))

    const confirmBtn = screen.getByRole('button', { name: /Reset 1 module/ })
    expect(confirmBtn).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('RESET'), { target: { value: 'RESET' } })
    await waitFor(() => expect(confirmBtn).not.toBeDisabled())

    fireEvent.click(confirmBtn)
    await waitFor(() => expect(resetSiteData).toHaveBeenCalledWith('s1', ['analytics']))
  })

  it('escalates the confirmation to the site domain when ALL modules are selected', () => {
    renderModal()
    // Toggle every module row on.
    for (const label of ['Analytics', 'Journeys', 'Funnels', 'Uptime', 'Performance', 'CDN', 'Search Console']) {
      fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(label) }))
    }
    // Full wipe demands the domain, not the RESET keyword.
    expect(screen.getByPlaceholderText('acme.com')).toBeInTheDocument()
    const confirmBtn = screen.getByRole('button', { name: /Reset 7 modules/ })
    fireEvent.change(screen.getByPlaceholderText('acme.com'), { target: { value: 'RESET' } })
    expect(confirmBtn).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('acme.com'), { target: { value: 'acme.com' } })
    expect(confirmBtn).not.toBeDisabled()
  })

  // --- Structural pins (settings overhaul, 16-09-2026) --------------------

  it('renders on Facet Modal, titled in sentence case, never a local Dialog import', () => {
    renderModal()
    expect(screen.getByRole('heading', { name: 'Reset data' })).toBeInTheDocument()
    expect(screen.queryByText('Reset Data')).toBeNull()

    const source = readFileSync(join(process.cwd(), 'components/settings/unified/ResetDataModal.tsx'), 'utf8')
    expect(source).not.toMatch(/@\/components\/ui\/dialog/)
    expect(source).toMatch(/from ['"]@ciphera-net\/facet['"]/)
    expect(source).toMatch(/\bModal\b/)
  })

  it('uses ONE Facet Checkbox idiom for every row — no pseudo-checkbox button beside it', () => {
    const { container } = renderModal()
    // 7 module rows + 1 select-all row, all the same control.
    expect(screen.getAllByRole('checkbox')).toHaveLength(8)
    // The old per-module row was a second, hand-rolled `aria-pressed` mark
    // living beside the real Checkbox — assert that idiom is gone entirely.
    expect(container.querySelectorAll('[aria-pressed]').length).toBe(0)
  })

  it('has no em dash, en dash, or three-dot ellipsis anywhere in its copy', () => {
    const source = readFileSync(join(process.cwd(), 'components/settings/unified/ResetDataModal.tsx'), 'utf8')
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(stripped).not.toMatch(/[—–]/)
    expect(stripped).not.toMatch(/\.\.\./)
  })
})
