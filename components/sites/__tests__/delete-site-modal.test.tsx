import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { usePendingKeys } from '@/lib/hold/pending'

// --- Mocks ---------------------------------------------------------------

const deleteSite = vi.fn().mockResolvedValue(undefined)
const permanentDeleteSite = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/sites', () => ({
  deleteSite: (...a: unknown[]) => deleteSite(...a),
  permanentDeleteSite: (...a: unknown[]) => permanentDeleteSite(...a),
}))

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

// Site deletion commits through the shared Undo bar; the dialog itself is
// exercised through facet-hold's stand-in (PUL-28), same as every other
// converted component.
vi.mock('@ciphera-net/facet-hold', async () =>
  (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())

vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: any[]) => args.flat().filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  AlertTriangleIcon: () => <svg aria-hidden="true" />,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: (e: Error) => e?.message ?? '',
}))

import DeleteSiteModal from '../DeleteSiteModal'
import { resetDeferred, commitLast, undoLast } from '@/lib/hold/__tests__/facetHoldStandIn'

const onClose = vi.fn()

/** Shows whether a given pending key is currently hiding something (PUL-28). */
function PendingProbe({ pendingKey }: { pendingKey: string }) {
  const pendingKeys = usePendingKeys()
  return <div data-testid="pending">{pendingKeys.has(pendingKey) ? 'hidden' : 'visible'}</div>
}

beforeEach(() => {
  deleteSite.mockClear()
  permanentDeleteSite.mockClear()
  push.mockClear()
  onClose.mockClear()
  resetDeferred()
})

function renderModal(over: Partial<React.ComponentProps<typeof DeleteSiteModal>> = {}, pendingKey = 'site:s1') {
  return render(
    <>
      <PendingProbe pendingKey={pendingKey} />
      <DeleteSiteModal open onClose={onClose} siteName="Acme" siteId="s1" {...over} />
    </>,
  )
}

describe('DeleteSiteModal (hold-to-confirm, PUL-28)', () => {
  it('opens on the soft variant: a question title, the grace-period copy and the two consequence rows', () => {
    renderModal()
    const dialog = screen.getByRole('dialog', { name: 'Delete Acme?' })
    expect(dialog.textContent).toContain('scheduled for deletion with a 7-day grace period')
    expect(screen.getByText('All events and analytics data')).toBeInTheDocument()
    expect(screen.getByText('Alert channels and goals')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hold to delete' })).toBeInTheDocument()
    // No typed confirmation left anywhere.
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('switches to the permanent variant and back without closing the dialog', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently now instead' }))
    expect(screen.getByRole('dialog', { name: 'Delete Acme forever?' })).toBeInTheDocument()
    expect(screen.getByText('All analytics data is permanently lost')).toBeInTheDocument()
    expect(screen.getByText('Deleted at once, with no 7-day grace period')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hold to delete forever' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('dialog', { name: 'Delete Acme?' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('permanentOnly shows only the permanent variant, with no secondary toggle', () => {
    renderModal({ permanentOnly: true })
    expect(screen.getByRole('dialog', { name: 'Delete Acme forever?' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete permanently now instead' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('confirming hides the site at once, navigates home, and sends nothing until the window runs out', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))

    expect(push).toHaveBeenCalledWith('/')
    expect(screen.getByTestId('pending')).toHaveTextContent('hidden')
    expect(deleteSite).not.toHaveBeenCalled()
    expect(permanentDeleteSite).not.toHaveBeenCalled()

    await commitLast()
    expect(deleteSite).toHaveBeenCalledWith('s1', { keepalive: false })
  })

  it('commitLast({ keepalive: true }) passes keepalive through to deleteSite', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    await commitLast({ keepalive: true })
    expect(deleteSite).toHaveBeenCalledWith('s1', { keepalive: true })
  })

  it('confirming the permanent variant sends permanentDeleteSite, not deleteSite', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently now instead' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete forever' }))
    await commitLast()
    expect(permanentDeleteSite).toHaveBeenCalledWith('s1', { keepalive: false })
    expect(deleteSite).not.toHaveBeenCalled()
  })

  it('a permanent delete opened from the deleted list (permanentOnly) hides the deleted-site key, not the site key', async () => {
    renderModal({ permanentOnly: true }, 'deleted-site:s1')
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete forever' }))
    expect(screen.getByTestId('pending')).toHaveTextContent('hidden')
    await commitLast()
    expect(permanentDeleteSite).toHaveBeenCalledWith('s1', { keepalive: false })
  })

  it('Undo restores the site and sends nothing', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    expect(screen.getByTestId('pending')).toHaveTextContent('hidden')

    undoLast()
    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('visible'))
    expect(deleteSite).not.toHaveBeenCalled()
  })

  it('a rejected delete restores the site and reports the failure', async () => {
    deleteSite.mockRejectedValueOnce(new Error('Server error'))
    const { toast } = await import('@ciphera-net/facet')
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))

    await commitLast()
    expect(toast.error).toHaveBeenCalledWith('Server error')
    expect(screen.getByTestId('pending')).toHaveTextContent('visible')
  })

  it('has no em or en dashes anywhere in its source', () => {
    const src = readFileSync(join(process.cwd(), 'components/sites/DeleteSiteModal.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(src).not.toMatch(/[—–]/)
  })
})
