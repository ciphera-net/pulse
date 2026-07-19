import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MastheadSlotProvider } from '@/components/settings/shell-slots'

// --- Mocks ---------------------------------------------------------------

let mockCanManage = true
vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => mockCanManage,
}))

const useGoals = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useGoals: (...a: unknown[]) => useGoals(...a),
}))

const createGoal = vi.fn().mockResolvedValue(undefined)
const updateGoal = vi.fn().mockResolvedValue(undefined)
const deleteGoal = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/goals', () => ({
  createGoal: (...a: unknown[]) => createGoal(...a),
  updateGoal: (...a: unknown[]) => updateGoal(...a),
  deleteGoal: (...a: unknown[]) => deleteGoal(...a),
}))

vi.mock('@ciphera-net/facet', () => ({
  // `@/lib/utils` re-exports cn from facet; the real panel primitives call it.
  cn: (...args: any[]) => args.flat().filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  Spinner: () => <span>loading</span>,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

import SiteGoalsTab from '../SiteGoalsTab'

const goals = [
  { id: 'g1', site_id: 's1', name: 'Sign up', event_name: 'signup_click', funnel_steps: [], created_at: '', updated_at: '' },
  { id: 'g2', site_id: 's1', name: 'Purchase', event_name: 'purchase', funnel_steps: [], created_at: '', updated_at: '' },
]

const mutate = vi.fn().mockResolvedValue(undefined)

function goalsState(over: Partial<ReturnType<typeof useGoals>> = {}) {
  return { data: goals, mutate, isLoading: false, isValidating: false, error: undefined, ...over }
}

function renderTab() {
  const slot = document.createElement('div')
  slot.setAttribute('data-testid', 'masthead-slot')
  document.body.appendChild(slot)
  return render(
    <MastheadSlotProvider value={slot}>
      <SiteGoalsTab siteId="s1" />
    </MastheadSlotProvider>,
  )
}

beforeEach(() => {
  mockCanManage = true
  useGoals.mockReset().mockReturnValue(goalsState())
  createGoal.mockClear()
  updateGoal.mockClear()
  deleteGoal.mockClear()
  mutate.mockClear()
  document.body.innerHTML = ''
})

describe('SiteGoalsTab (Facet structured panels)', () => {
  it('renders a ruled Goals panel and portals the Add goal CTA into the masthead', () => {
    renderTab()
    expect(screen.getByText('Goals')).toBeInTheDocument()
    expect(screen.getByText('Sign up')).toBeInTheDocument()
    expect(screen.getByText('signup_click')).toBeInTheDocument()
    const cta = screen.getByRole('button', { name: /Add goal/i })
    expect(screen.getByTestId('masthead-slot').contains(cta)).toBe(true)
  })

  it('shows always-visible edit/delete row actions (no hover-only reveal)', () => {
    renderTab()
    const edit = screen.getByLabelText('Edit Sign up')
    expect(edit).toBeInTheDocument()
    expect(edit.className).not.toMatch(/opacity-0/)
    expect(screen.getByLabelText('Delete Sign up')).toBeInTheDocument()
  })

  it('renders an in-frame empty state (not an error) when there are no goals', () => {
    useGoals.mockReturnValue(goalsState({ data: [] }))
    renderTab()
    expect(screen.getByText('No goals yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add your first goal/i })).toBeInTheDocument()
  })

  it('surfaces a distinct error state (B6: error ≠ empty) when the fetch fails', () => {
    useGoals.mockReturnValue(goalsState({ data: [], error: new Error('boom') }))
    renderTab()
    expect(screen.getByText(/Couldn't load this/i)).toBeInTheDocument()
    expect(screen.queryByText('No goals yet')).toBeNull()
  })

  it('opens the inline create form and keeps per-field validation', async () => {
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: /Add goal/i }))
    // Form is open: masthead CTA hidden, Create button shown.
    expect(screen.getByText('New goal')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(screen.getByText('Display name is required')).toBeInTheDocument())
    expect(screen.getByText('Event name is required')).toBeInTheDocument()
    // Invalid submit never hits the API.
    expect(createGoal).not.toHaveBeenCalled()
  })

  it('hides the CTA and all row actions when the user cannot manage goals', () => {
    mockCanManage = false
    renderTab()
    expect(screen.queryByRole('button', { name: /Add goal/i })).toBeNull()
    expect(screen.queryByLabelText('Edit Sign up')).toBeNull()
    expect(screen.queryByLabelText('Delete Sign up')).toBeNull()
  })
})
