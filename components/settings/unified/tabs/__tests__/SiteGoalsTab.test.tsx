import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
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

// ConfirmDialog is exercised by its own suite (WorkspaceApiKeysTab's stub is
// the house precedent) - stub it so this tab's tests stay about the tab, not
// about the shared Radix dialog plumbing.
vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, title, description, onConfirm }: any) =>
    open ? (
      <div role="dialog">
        <p>{title}</p>
        <p>{description}</p>
        <button onClick={onConfirm}>Confirm delete</button>
      </div>
    ) : null,
}))

vi.mock('@ciphera-net/facet', () => ({
  // `@/lib/utils` re-exports cn from facet; the real panel primitives call it.
  cn: (...args: any[]) => args.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  Spinner: () => <span>loading</span>,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

import SiteGoalsTab from '../SiteGoalsTab'

const goals = [
  { id: 'g1', site_id: 's1', name: 'Sign up', event_name: 'signup_click', created_at: '', updated_at: '' },
  { id: 'g2', site_id: 's1', name: 'Purchase', event_name: 'purchase', created_at: '', updated_at: '' },
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
  it('renders a ruled Goals panel, as a sentence-case heading, and portals the Add goal CTA into the masthead', () => {
    renderTab()
    // Rule 2: the panel title is a real heading, sentence case, not an
    // uppercase tracked micro-label.
    const heading = screen.getByRole('heading', { name: 'Goals', level: 2 })
    expect(heading).toBeInTheDocument()
    expect(heading.className).not.toMatch(/uppercase/)
    expect(screen.getByText('Track custom events as conversion goals.')).toBeInTheDocument()
    expect(screen.getByText('Sign up')).toBeInTheDocument()

    const cta = screen.getByRole('button', { name: /Add goal/i })
    // Rule 4: the primary action is a real button, not a link-as-button.
    expect(cta.tagName).toBe('BUTTON')
    expect(screen.getByTestId('masthead-slot').contains(cta)).toBe(true)
  })

  it('renders each goal through the shared PanelRow grid, not a hand-rolled row', () => {
    renderTab()
    const name = screen.getByText('Sign up')
    // PanelRow's signature is its responsive label/value/control grid
    // (components/settings/panels/PanelRow.tsx). A row built from that
    // primitive carries this class on an ancestor; the old hand-rolled
    // `flex items-center justify-between` row did not.
    const row = name.closest('.md\\:grid-cols-\\[220px_1fr_auto\\]')
    expect(row).toBeTruthy()
    expect(row).toHaveTextContent('signup_click')
  })

  it('shows always-visible edit/delete row actions sized to the house 32px rung (no touch-only upsize, no hover-only reveal)', () => {
    renderTab()
    const edit = screen.getByLabelText('Edit Sign up')
    expect(edit).toBeInTheDocument()
    expect(edit.className).toMatch(/\bh-8\b/)
    expect(edit.className).toMatch(/\bw-8\b/)
    expect(edit.className).not.toMatch(/h-11/)
    expect(edit.className).not.toMatch(/opacity-0/)
    expect(screen.getByLabelText('Delete Sign up')).toBeInTheDocument()
  })

  it('renders an in-frame empty state (not an error) when there are no goals', () => {
    useGoals.mockReturnValue(goalsState({ data: [] }))
    renderTab()
    expect(screen.getByText('No goals yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add your first goal/i })).toBeInTheDocument()
  })

  it("surfaces a distinct error state naming what failed (error is not empty) when the fetch fails", () => {
    useGoals.mockReturnValue(goalsState({ data: [], error: new Error('boom') }))
    renderTab()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load your goals")
    expect(screen.queryByText('No goals yet')).toBeNull()
  })

  it('renders the loading state as a filling skeleton, not a bare spinner', () => {
    useGoals.mockReturnValue(goalsState({ isLoading: true }))
    renderTab()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('Goals')).toBeNull()
  })

  it('opens the New goal panel (a standing panel, not an inline uppercase kicker) and keeps per-field validation', async () => {
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: /Add goal/i }))

    // Form is open: masthead CTA hidden, its own panel title takes over.
    const formHeading = screen.getByRole('heading', { name: 'New goal', level: 2 })
    expect(formHeading.className).not.toMatch(/uppercase/)
    expect(screen.queryByRole('button', { name: /Add goal/i })).toBeNull()

    // Cancel is a ghost button, never the retired grey `secondary` rung.
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
    expect(cancelBtn).toHaveAttribute('variant', 'ghost')

    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(screen.getByText('Display name is required')).toBeInTheDocument())
    expect(screen.getByText('Event name is required')).toBeInTheDocument()
    // Invalid submit never hits the API.
    expect(createGoal).not.toHaveBeenCalled()
  })

  it('confirms delete through the shared ConfirmDialog naming the goal, not a bare confirm', async () => {
    renderTab()
    fireEvent.click(screen.getByLabelText('Delete Sign up'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Delete this goal?')).toBeInTheDocument()
    expect(screen.getByText(/"Sign up" and everything recorded against it/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(deleteGoal).toHaveBeenCalledWith('s1', 'g1'))
  })

  it('hides the CTA and all row actions when the user cannot manage goals', () => {
    mockCanManage = false
    renderTab()
    expect(screen.queryByRole('button', { name: /Add goal/i })).toBeNull()
    expect(screen.queryByLabelText('Edit Sign up')).toBeNull()
    expect(screen.queryByLabelText('Delete Sign up')).toBeNull()
  })

  // The humanizer (spec §6.1 rule 15) is a hard constraint on user-facing
  // copy; strip WHY-comments first so this checks the copy, not prose inside
  // an explanation next to it.
  it('never uses an em dash or en dash in its source, comments included', () => {
    const sourcePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'SiteGoalsTab.tsx')
    const stripped = readFileSync(sourcePath, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(stripped).not.toMatch(/[—–]/)
  })
})
