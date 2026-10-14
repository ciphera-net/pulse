import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// --- Mocks ---------------------------------------------------------------

const resetSiteData = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/sites', () => ({
  resetSiteData: (...a: unknown[]) => resetSiteData(...a),
}))

// The hold dialog and the Undo window are facet-hold's own suite (PUL-28);
// here a confirm presses the hold button and each deferred action is
// committed, undone or failed by the test itself.
vi.mock('@ciphera-net/facet-hold', async () =>
  (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())

vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: any[]) => args.flat().filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  // Facet's real Checkbox is a role="checkbox" button (never a native
  // <input>), independently of whether it renders the "select all" row or a
  // module row.
  Checkbox: ({ checked, onChange, label, indeterminate: _i, ...props }: any) => (
    <button role="checkbox" aria-checked={checked} onClick={onChange} {...props}>{label}</button>
  ),
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: (e: Error) => e?.message ?? '',
}))

import ResetDataModal from '../ResetDataModal'
import { toast } from '@ciphera-net/facet'
import { deferred, resetDeferred, commitLast, undoLast } from '@/lib/hold/__tests__/facetHoldStandIn'

const onReset = vi.fn()
const onClose = vi.fn()

beforeEach(() => {
  resetSiteData.mockClear()
  onReset.mockClear()
  onClose.mockClear()
  vi.mocked(toast.error).mockClear()
  resetDeferred()
})

function renderModal() {
  return render(
    <ResetDataModal open onClose={onClose} onReset={onReset} siteDomain="acme.com" siteId="s1" />,
  )
}

function selectModule(label: string) {
  fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(label) }))
}

describe('ResetDataModal (hold-to-confirm, PUL-28)', () => {
  it('lists every reset module and stays disabled until one is picked', () => {
    renderModal()
    expect(screen.getByText('Analytics')).toBeInTheDocument()
    expect(screen.getByText('Search Console')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hold to reset' })).toBeDisabled()
    // No typed confirmation left anywhere.
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('opens with a question title and the hold icon, enabled once a module is picked', () => {
    renderModal()
    expect(screen.getByRole('dialog', { name: 'Reset data?' })).toBeInTheDocument()
    selectModule('Analytics')
    expect(screen.getByRole('button', { name: 'Hold to reset' })).not.toBeDisabled()
  })

  it('hides nothing (a reset has no row to hide) and sends nothing until the window runs out', async () => {
    renderModal()
    selectModule('Analytics')
    fireEvent.click(screen.getByRole('button', { name: 'Hold to reset' }))

    expect(resetSiteData).not.toHaveBeenCalled()
    expect(deferred).toHaveLength(1)
    expect(deferred[0]!.message).toBe('Analytics reset')

    await commitLast()
    expect(resetSiteData).toHaveBeenCalledWith('s1', ['analytics'], { keepalive: false })
  })

  it('commitLast({ keepalive: true }) passes keepalive through', async () => {
    renderModal()
    selectModule('Analytics')
    fireEvent.click(screen.getByRole('button', { name: 'Hold to reset' }))
    await commitLast({ keepalive: true })
    expect(resetSiteData).toHaveBeenCalledWith('s1', ['analytics'], { keepalive: true })
  })

  it('names two picked modules by label, three or more by count, and all of them as "All data reset"', () => {
    // Confirming clears the picker (handleClose resets `selected`), so each
    // scenario below re-picks its own modules from a clean slate.
    renderModal()
    selectModule('Analytics')
    selectModule('Journeys')
    fireEvent.click(screen.getByRole('button', { name: 'Hold to reset' }))
    expect(deferred[0]!.message).toBe('Analytics and Journeys reset')

    selectModule('Analytics')
    selectModule('Journeys')
    selectModule('Funnels')
    fireEvent.click(screen.getByRole('button', { name: 'Hold to reset' }))
    expect(deferred[1]!.message).toBe('3 modules reset')

    for (const label of ['Analytics', 'Journeys', 'Funnels', 'Uptime', 'Performance', 'CDN', 'Search Console']) {
      selectModule(label)
    }
    fireEvent.click(screen.getByRole('button', { name: 'Hold to reset' }))
    expect(deferred[2]!.message).toBe('All data reset')
  })

  it('refreshes (onReset) only after the commit succeeds, with no success toast', async () => {
    renderModal()
    selectModule('Analytics')
    fireEvent.click(screen.getByRole('button', { name: 'Hold to reset' }))
    expect(onReset).not.toHaveBeenCalled()

    await commitLast()
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('Undo sends nothing', async () => {
    renderModal()
    selectModule('Analytics')
    fireEvent.click(screen.getByRole('button', { name: 'Hold to reset' }))

    undoLast()
    expect(resetSiteData).not.toHaveBeenCalled()
    expect(onReset).not.toHaveBeenCalled()
  })

  it('a rejected reset reports the failure', async () => {
    resetSiteData.mockRejectedValueOnce(new Error('Server error'))
    renderModal()
    selectModule('Analytics')
    fireEvent.click(screen.getByRole('button', { name: 'Hold to reset' }))

    await commitLast()
    expect(toast.error).toHaveBeenCalledWith('Server error')
    expect(onReset).not.toHaveBeenCalled()
  })

  // --- Structural pins (settings overhaul, carried over) -------------------

  it('uses ONE Facet Checkbox idiom for every row, no pseudo-checkbox beside it', () => {
    const { container } = renderModal()
    // 7 module rows + 1 select-all row, all the same control.
    expect(screen.getAllByRole('checkbox')).toHaveLength(8)
    expect(container.querySelectorAll('[aria-pressed]').length).toBe(0)
  })

  it('escalates the all-modules label as every module is picked', () => {
    renderModal()
    for (const label of ['Analytics', 'Journeys', 'Funnels', 'Uptime', 'Performance', 'CDN', 'Search Console']) {
      selectModule(label)
    }
    expect(screen.getByRole('checkbox', { name: /All modules/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('7/7')).toBeInTheDocument()
  })

  it('has no em dash, en dash, or three-dot ellipsis anywhere in its copy', () => {
    const source = readFileSync(join(process.cwd(), 'components/settings/unified/ResetDataModal.tsx'), 'utf8')
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(stripped).not.toMatch(/[—–]/)
    expect(stripped).not.toMatch(/\.\.\./)
  })
})
