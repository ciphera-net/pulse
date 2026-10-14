import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { toast } from '@ciphera-net/facet'

// The funnels LIST page's delete flow (PUL-28): a hold dialog replaces the
// old inline confirm, the funnel disappears at once, and the delete is sent
// only when the Undo window runs out. Everything else about this page
// (empty/error states, the create modal) is out of this file's scope.

const mockUseFunnels = vi.fn()
const deleteFunnel = vi.fn()

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'site-1' }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/swr/dashboard', () => ({
  useSite: () => ({ data: { id: 'site-1', timezone: 'Europe/Brussels' } }),
  useFunnels: (...a: unknown[]) => mockUseFunnels(...a),
  useFunnelListStats: () => ({ data: {}, error: undefined }),
  useDataWindow: () => null,
}))

vi.mock('@/lib/api/funnels', () => ({
  deleteFunnel: (...a: unknown[]) => deleteFunnel(...a),
  createFunnel: vi.fn(),
  updateFunnel: vi.fn(),
}))

vi.mock('@/lib/auth/permissions', () => ({ useCan: () => true }))

vi.mock('@/lib/hooks/useUrlDateRange', () => ({
  useUrlDateRange: () => ({
    period: '30',
    dateRange: { start: '2026-07-27', end: '2026-08-26' },
    periodReady: true,
    picker: {},
  }),
}))

vi.mock('@/components/ui/DateRangePicker', () => ({ default: () => null }))
vi.mock('@/components/skeletons', () => ({ FunnelsListSkeleton: () => <div data-testid="skeleton" /> }))
vi.mock('@/components/dashboard/MetricInfoTip', () => ({ TermInfoTip: () => null }))
vi.mock('@/components/funnels/FunnelModal', () => ({ default: () => null }))

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, className }: any) => <div className={className}>{children}</div> },
}))

vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: any[]) => args.flat(Infinity).filter(Boolean).join(' '),
  toast: { success: vi.fn(), error: vi.fn() },
  PlusIcon: () => null,
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  getAuthErrorMessage: (e: Error) => e?.message ?? '',
}))

// The hold dialog and the Undo window are facet-hold's own suite; here a
// confirm is one click and each deferred delete is committed, undone or
// failed by the test itself (PUL-28).
vi.mock('@ciphera-net/facet-hold', async () =>
  (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())

import FunnelsPage from '../page'
import { deferred, resetDeferred, commitLast, undoLast } from '@/lib/hold/__tests__/facetHoldStandIn'

const FUNNEL = {
  id: 'f1',
  site_id: 'site-1',
  name: 'Signup flow',
  description: null,
  steps: [
    { order: 0, name: 'Step 1', value: '/pricing', type: 'exact', category: 'page' },
    { order: 1, name: 'Step 2', value: 'signup', type: 'exact', category: 'event' },
  ],
  created_at: '',
  updated_at: '',
}

function funnelsState(over: Partial<ReturnType<typeof mockUseFunnels>> = {}) {
  return { data: [FUNNEL], error: undefined, isLoading: false, mutate: vi.fn(), ...over }
}

beforeEach(() => {
  mockUseFunnels.mockReset().mockReturnValue(funnelsState())
  deleteFunnel.mockReset().mockResolvedValue(undefined)
  resetDeferred()
})

describe('funnels list: delete through a hold dialog (PUL-28)', () => {
  it('names the funnel in a hold dialog, hides it at once, and sends nothing until the Undo window runs out', async () => {
    render(<FunnelsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Signup flow' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete "Signup flow"?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to delete' }))

    expect(screen.queryByText('Signup flow')).toBeNull()
    expect(deleteFunnel).not.toHaveBeenCalled()
    expect(deferred[0]!.message).toBe('"Signup flow" deleted')

    const { mutate } = mockUseFunnels.mock.results[0]!.value
    await act(() => commitLast())
    expect(deleteFunnel).toHaveBeenCalledWith('site-1', 'f1', { keepalive: false })
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('passes keepalive through to the request on a commit sent as the page closes', async () => {
    render(<FunnelsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Signup flow' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    await act(() => commitLast({ keepalive: true }))
    expect(deleteFunnel).toHaveBeenCalledWith('site-1', 'f1', { keepalive: true })
  })

  it('Undo restores the funnel and sends nothing', async () => {
    render(<FunnelsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Signup flow' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    expect(screen.queryByText('Signup flow')).toBeNull()

    act(() => undoLast())
    expect(screen.getByText('Signup flow')).toBeInTheDocument()
    expect(deleteFunnel).not.toHaveBeenCalled()
  })

  it('a rejected delete brings the funnel back and says so', async () => {
    deleteFunnel.mockRejectedValueOnce(new Error())
    render(<FunnelsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Signup flow' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    expect(screen.queryByText('Signup flow')).toBeNull()

    await act(() => commitLast())
    expect(toast.error).toHaveBeenCalledWith('Couldn\'t delete "Signup flow". Try again.')
    expect(screen.getByText('Signup flow')).toBeInTheDocument()
  })
})
