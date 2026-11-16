// Site Settings, Analyst (P1, picked 14-11-2026): the switch first, then each memory with its day, a pencil and a bin
// as the Goals list has them, no Add button; the switch, an edit and a delete behind the Undo window; a team without
// Analyst, a site with no memories and a failed read each say so.
import * as React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { ApiError } from '@/lib/api/client'
import type { AnalystMemories, AnalystMemory } from '@/lib/api/analyst'


const getAnalystMemories = vi.fn()
const setAnalystMemoriesEnabled = vi.fn()
const updateAnalystMemory = vi.fn()
const deleteAnalystMemory = vi.fn()
vi.mock('@/lib/api/analyst', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/analyst')>()),
  getAnalystMemories: (...a: unknown[]) => getAnalystMemories(...a),
  setAnalystMemoriesEnabled: (...a: unknown[]) => setAnalystMemoriesEnabled(...a),
  updateAnalystMemory: (...a: unknown[]) => updateAnalystMemory(...a),
  deleteAnalystMemory: (...a: unknown[]) => deleteAnalystMemory(...a),
}))

// The hold and the Undo window are facet-hold's own suite: a confirm is one click, and each deferred delete is
// committed or undone by the test (as the Goals page's test does).
vi.mock('@ciphera-net/facet-hold', async () => {
  const standIn = (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn()
  type Props = {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: React.ReactNode
    description?: React.ReactNode
    holdLabel: string
    onConfirm: () => void
  }
  return {
    ...standIn,
    HoldDialog: ({ open, onOpenChange, title, description, holdLabel, onConfirm }: Props) =>
      open ? (
        <div role="dialog" aria-labelledby="hold-title">
          <h3 id="hold-title">{title}</h3>
          {description && <div data-testid="hold-description">{description}</div>}
          <button type="button" onClick={() => onOpenChange(false)}>Cancel</button>
          <button
            type="button"
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            {holdLabel}
          </button>
        </div>
      ) : null,
  }
})

vi.mock('@ciphera-net/facet', async () => {
  const R = await import('react')
  type ButtonProps = React.ComponentProps<'button'> & { asChild?: boolean; variant?: string; size?: string }
  return {
    cn: (...args: unknown[]) => args.flat(Infinity).filter(Boolean).join(' '),
    Button: ({ children, asChild, variant: _v, size: _s, ...props }: ButtonProps) =>
      asChild && R.isValidElement(children) ? children : <button {...props}>{children}</button>,
    Textarea: R.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>((props, ref) => <textarea ref={ref} {...props} />),
    Toggle: ({ id, checked, onChange, disabled }: { id?: string; checked: boolean; onChange: () => void; disabled?: boolean }) => (
      <button type="button" role="switch" id={id} aria-checked={checked} disabled={disabled} onClick={onChange} />
    ),
    toast: { success: vi.fn(), error: vi.fn() },
  }
})

vi.mock('framer-motion', () => import('@/components/settings/__tests__/framer-mock'))

import AnalystSettingsPage, { savedOn } from '../AnalystSettingsPage'
import { toast } from '@ciphera-net/facet'
import { deferred, resetDeferred, commitLast, undoLast } from '@/lib/hold/__tests__/facetHoldStandIn'

const memory = (id: string, body: string, created_at: string): AnalystMemory => ({ id, site_id: 's1', body, created_at, updated_at: created_at })
const list = (over: Partial<AnalystMemories> = {}): AnalystMemories => ({
  memories: [
    memory('m1', 'Shared Link is our newsletter.', '2026-11-10T09:00:00Z'),
    memory('m2', '/products/pulse is the page we want visitors to reach.', '2026-11-11T09:00:00Z'),
  ],
  max_memories: 20,
  max_length: 280,
  enabled: true,
  offer_snoozed_until: null,
  ...over,
})

const renderPage = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <AnalystSettingsPage siteId="s1" />
    </SWRConfig>,
  )

beforeEach(() => {
  cleanup()
  getAnalystMemories.mockReset().mockResolvedValue(list())
  setAnalystMemoriesEnabled.mockReset().mockImplementation(async (_s: string, enabled: boolean) => ({ enabled }))
  updateAnalystMemory.mockReset().mockImplementation(async (_s: string, id: string, body: string) => memory(id, body, '2026-11-10T09:00:00Z'))
  deleteAnalystMemory.mockReset().mockResolvedValue(undefined)
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
  resetDeferred()
  Element.prototype.scrollIntoView = vi.fn()
})

describe('Site Settings, Analyst', () => {
  it('shows the switch first, then each memory with its day and both buttons, the count, and no Add button', async () => {
    renderPage()
    expect(await screen.findByText('Shared Link is our newsletter.')).toBeInTheDocument()
    expect(screen.getByText('Memories')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Save memories from chats' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('2 of 20')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Edit memory' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Delete memory' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /^Add/ })).toBeNull()
    expect(getAnalystMemories).toHaveBeenCalledWith('s1')
  })

  it('turns memories on for an undecided site, and off again', async () => {
    getAnalystMemories.mockResolvedValue(list({ enabled: null }))
    renderPage()
    const sw = await screen.findByRole('switch', { name: 'Save memories from chats' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(sw)
    await waitFor(() => expect(setAnalystMemoriesEnabled).toHaveBeenCalledWith('s1', true))
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'))
    fireEvent.click(sw)
    await waitFor(() => expect(setAnalystMemoriesEnabled).toHaveBeenLastCalledWith('s1', false))
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'))
  })

  it('says so when the switch fails, and leaves it as it was', async () => {
    setAnalystMemoriesEnabled.mockRejectedValue(new Error('network'))
    renderPage()
    const sw = await screen.findByRole('switch', { name: 'Save memories from chats' })
    fireEvent.click(sw)
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't turn off memories. Try again."))
    expect(sw).toHaveAttribute('aria-checked', 'true')
  })

  it('edits a memory in the form above the list, on one line, and closes it once saved', async () => {
    renderPage()
    fireEvent.click((await screen.findAllByRole('button', { name: 'Edit memory' }))[0])
    expect(screen.getByText('Edit memory')).toBeInTheDocument()
    const box = screen.getByLabelText('Memory') as HTMLTextAreaElement
    expect(box.value).toBe('Shared Link is our newsletter.')
    expect(screen.getByText('30 of 280 characters')).toBeInTheDocument()
    fireEvent.change(box, { target: { value: '  Shared Link is our\n weekly newsletter. ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save memory' }))
    await waitFor(() => expect(updateAnalystMemory).toHaveBeenCalledWith('s1', 'm1', 'Shared Link is our weekly newsletter.'))
    await waitFor(() => expect(screen.queryByText('Edit memory')).toBeNull())
    expect(toast.success).toHaveBeenCalledWith('Memory saved')
  })

  it('closes the form, reads the list again and says so when someone deleted the memory during the edit', async () => {
    renderPage()
    fireEvent.click((await screen.findAllByRole('button', { name: 'Edit memory' }))[0])
    updateAnalystMemory.mockRejectedValueOnce(new ApiError('Not found', 404))
    getAnalystMemories.mockResolvedValue(list({ memories: [memory('m2', '/products/pulse is the page we want visitors to reach.', '2026-11-11T09:00:00Z')] }))
    fireEvent.change(screen.getByLabelText('Memory'), { target: { value: 'Shared Link is our weekly newsletter.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save memory' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Someone deleted this memory while you were editing it.'))
    await waitFor(() => expect(screen.queryByText('Edit memory')).toBeNull())
    await waitFor(() => expect(screen.queryByText('Shared Link is our newsletter.')).toBeNull())
    expect(screen.getByText('/products/pulse is the page we want visitors to reach.')).toBeInTheDocument()
  })

  it('keeps the form and shows the server words when an edit is refused', async () => {
    renderPage()
    fireEvent.click((await screen.findAllByRole('button', { name: 'Edit memory' }))[0])
    const words = 'A memory holds at most 280 characters.'
    updateAnalystMemory.mockRejectedValueOnce(new ApiError(words, 400, { error: words }))
    fireEvent.change(screen.getByLabelText('Memory'), { target: { value: 'Shared Link is our weekly newsletter.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save memory' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(words))
    expect(screen.getByText('Edit memory')).toBeInTheDocument()
    expect((screen.getByLabelText('Memory') as HTMLTextAreaElement).value).toBe('Shared Link is our weekly newsletter.')
  })

  it('hides a memory at once on confirm, and deletes it only when the Undo window runs out', async () => {
    renderPage()
    fireEvent.click((await screen.findAllByRole('button', { name: 'Delete memory' }))[0])
    expect(screen.getByTestId('hold-description').textContent).toContain('"Shared Link is our newsletter."')
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    expect(screen.queryByText('Shared Link is our newsletter.')).toBeNull()
    expect(deleteAnalystMemory).not.toHaveBeenCalled()
    expect(deferred[0]!.message).toBe('Memory deleted')
    await act(() => commitLast({ keepalive: true }))
    expect(deleteAnalystMemory).toHaveBeenCalledWith('s1', 'm1', { keepalive: true })
  })

  it('brings a memory back on Undo, sending nothing', async () => {
    renderPage()
    fireEvent.click((await screen.findAllByRole('button', { name: 'Delete memory' }))[0])
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    act(() => undoLast())
    expect(await screen.findByText('Shared Link is our newsletter.')).toBeInTheDocument()
    expect(deleteAnalystMemory).not.toHaveBeenCalled()
  })

  it('says how a memory is added when the site has none', async () => {
    getAnalystMemories.mockResolvedValue(list({ memories: [] }))
    renderPage()
    expect(await screen.findByText('No memories yet')).toBeInTheDocument()
    expect(screen.getByText('0 of 20')).toBeInTheDocument()
  })

  it('says a 404 (the kill switch, or Analyst not configured) failed to load, never that there are no memories', async () => {
    getAnalystMemories.mockRejectedValue(new ApiError('Not found', 404))
    renderPage()
    expect(await screen.findByText("Couldn't load the memories")).toBeInTheDocument()
    expect(screen.queryByText('No memories yet')).toBeNull()
  })

  it('says a failed read failed, never that there are no memories, and reads again on Try again', async () => {
    getAnalystMemories.mockRejectedValueOnce(new ApiError('boom', 500))
    renderPage()
    expect(await screen.findByText("Couldn't load the memories")).toBeInTheDocument()
    expect(screen.queryByText('No memories yet')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Shared Link is our newsletter.')).toBeInTheDocument()
  })
})

describe('savedOn', () => {
  it('names the day, and the year only when it is not this one', () => {
    expect(savedOn('2026-11-10T09:00:00Z', new Date('2026-11-14T12:00:00Z'))).toBe('Saved 10 November')
    expect(savedOn('2025-11-10T09:00:00Z', new Date('2026-11-14T12:00:00Z'))).toBe('Saved 10 November 2025')
    expect(savedOn('not a date')).toBe('Saved')
  })
})
