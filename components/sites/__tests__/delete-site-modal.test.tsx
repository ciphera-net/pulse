import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// --- Mocks ---------------------------------------------------------------

const deleteSite = vi.fn().mockResolvedValue(undefined)
const permanentDeleteSite = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/sites', () => ({
  deleteSite: (...a: unknown[]) => deleteSite(...a),
  permanentDeleteSite: (...a: unknown[]) => permanentDeleteSite(...a),
}))

vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: any[]) => args.flat().filter(Boolean).join(' '),
  // Pass-through so a button's `variant` prop is visible on the rendered
  // element (asserted via getAttribute below) — the same idiom the other
  // settings-overhaul test suites use to pin the Facet Button rung.
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Modal: ({ isOpen, title, children }: any) => (isOpen ? <div><h2>{title}</h2>{children}</div> : null),
  AlertTriangleIcon: () => <svg aria-hidden="true" />,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

import DeleteSiteModal from '../DeleteSiteModal'

const onClose = vi.fn()
const onDeleted = vi.fn()

beforeEach(() => {
  deleteSite.mockClear()
  permanentDeleteSite.mockClear()
  onClose.mockClear()
  onDeleted.mockClear()
})

function renderModal(over: Partial<React.ComponentProps<typeof DeleteSiteModal>> = {}) {
  return render(
    <DeleteSiteModal
      open
      onClose={onClose}
      onDeleted={onDeleted}
      siteName="Acme"
      siteDomain="acme.com"
      siteId="s1"
      {...over}
    />,
  )
}

describe('DeleteSiteModal (Facet dialog, settings-overhaul tokens)', () => {
  it('titles the schedule-delete actions in sentence case, gated behind typing DELETE', async () => {
    renderModal()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    const scheduleBtn = screen.getByRole('button', { name: 'Schedule deletion' })
    expect(scheduleBtn).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } })
    expect(scheduleBtn).not.toBeDisabled()

    // The old Title Case labels this round retired must not reappear.
    expect(screen.queryByText('Schedule Deletion')).toBeNull()
  })

  it('titles the permanent-delete actions in sentence case, gated behind typing the domain', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: /Permanently delete now/ }))
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    const forever = screen.getByRole('button', { name: 'Delete forever' })
    expect(forever).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('acme.com'), { target: { value: 'acme.com' } })
    expect(forever).not.toBeDisabled()

    expect(screen.queryByText('Delete Forever')).toBeNull()
  })

  it('puts Cancel and Back on the outline rung, never the grey secondary fill', () => {
    renderModal()
    expect(screen.getByRole('button', { name: 'Cancel' }).getAttribute('variant')).toBe('outline')

    fireEvent.click(screen.getByRole('button', { name: /Permanently delete now/ }))
    expect(screen.getByRole('button', { name: 'Back' }).getAttribute('variant')).toBe('outline')
  })

  it('emphasises the grace period, the confirm keyword and the irreversibility notice at font-semibold, never font-bold', () => {
    renderModal()
    expect(screen.getByText('7-day grace period').className).toMatch(/font-semibold/)
    expect(screen.getByText('DELETE').className).toMatch(/font-semibold/)

    fireEvent.click(screen.getByRole('button', { name: /Permanently delete now/ }))
    expect(screen.getByText('irreversible').className).toMatch(/font-semibold/)
    expect(screen.getByText('acme.com', { selector: 'span' }).className).toMatch(/font-semibold/)
  })

  it('has no em dash, en dash, Title Case button label, secondary variant, or font-bold left in the source', () => {
    const source = readFileSync(join(process.cwd(), 'components/sites/DeleteSiteModal.tsx'), 'utf8')
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(stripped).not.toMatch(/[—–]/)
    expect(stripped).not.toMatch(/\.\.\./)
    expect(stripped).not.toMatch(/variant="secondary"/)
    expect(stripped).not.toMatch(/font-bold/)
    expect(stripped).not.toMatch(/Schedule Deletion/)
    expect(stripped).not.toMatch(/Delete Forever/)
  })
})
