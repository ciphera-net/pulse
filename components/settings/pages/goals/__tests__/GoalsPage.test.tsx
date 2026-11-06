import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import * as React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { MastheadSlotProvider } from '@/components/settings/shell-slots'
import { ApiError } from '@/lib/api/client'
import type { Goal } from '@/lib/api/goals'

// --- Mocks ---------------------------------------------------------------

let mockCanManage = true
vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => mockCanManage,
}))

const useGoals = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useGoals: (...a: unknown[]) => useGoals(...a),
}))

const createGoal = vi.fn()
const updateGoal = vi.fn()
const deleteGoal = vi.fn()
vi.mock('@/lib/api/goals', () => ({
  createGoal: (...a: unknown[]) => createGoal(...a),
  updateGoal: (...a: unknown[]) => updateGoal(...a),
  deleteGoal: (...a: unknown[]) => deleteGoal(...a),
}))

// The hold and the Undo window are facet-hold's own suite: here a confirm is one click, and each deferred delete is
// committed, undone or failed by the test itself (PUL-28). The shared stand-in names its dialog with
// `aria-label={title}`, a string; this page's title is a node (KitDialogTitle), so the dialog here is named by its
// heading, as Facet's own dialog is.
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
    // `@/lib/utils` re-exports cn from facet; the kit calls it.
    cn: (...args: unknown[]) => args.flat(Infinity).filter(Boolean).join(' '),
    // asChild: the child is the element (a link), as Radix's Slot renders it.
    Button: ({ children, asChild, ...props }: ButtonProps) =>
      asChild && R.isValidElement(children) ? children : <button {...props}>{children}</button>,
    Input: R.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>((props, ref) => <input ref={ref} {...props} />),
    toast: { success: vi.fn(), error: vi.fn() },
  }
})

vi.mock('framer-motion', () => import('@/components/settings/__tests__/framer-mock'))

import GoalsPage from '../GoalsPage'
import { toast } from '@ciphera-net/facet'
import { deferred, resetDeferred, commitLast, undoLast } from '@/lib/hold/__tests__/facetHoldStandIn'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const SOURCES = ['GoalsPage.tsx', 'GoalForm.tsx', 'checkGoal.ts'].map((f) => readFileSync(path.join(DIR, '..', f), 'utf8'))

const goal = (id: string, name: string, event_name: string): Goal => ({
  id,
  site_id: 's1',
  name,
  event_name,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
})
const goals = [goal('g1', 'Sign up', 'signup_click'), goal('g2', 'Purchase', 'purchase')]

const mutate = vi.fn()
function goalsState(over: Record<string, unknown> = {}) {
  return { data: goals, mutate, isLoading: false, isValidating: false, error: undefined, ...over }
}

const scrollIntoView = vi.fn()

function renderPage() {
  const slot = document.createElement('div')
  slot.setAttribute('data-testid', 'masthead-slot')
  document.body.appendChild(slot)
  return render(
    <MastheadSlotProvider value={slot}>
      <GoalsPage siteId="s1" />
    </MastheadSlotProvider>,
  )
}

const nameInput = () => screen.getByLabelText('Name') as HTMLInputElement
const eventInput = () => screen.getByLabelText('Event name') as HTMLInputElement
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })

beforeEach(() => {
  mockCanManage = true
  useGoals.mockReset().mockReturnValue(goalsState())
  createGoal.mockReset().mockResolvedValue(goal('g3', 'Trial started', 'trial_start'))
  updateGoal.mockReset().mockResolvedValue(goals[0])
  deleteGoal.mockReset().mockResolvedValue(undefined)
  mutate.mockReset().mockResolvedValue(goals)
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
  resetDeferred()
  // jsdom has no layout, so no scrollIntoView.
  scrollIntoView.mockClear()
  Element.prototype.scrollIntoView = scrollIntoView
  document.body.innerHTML = ''
})

describe('GoalsPage: the list', () => {
  it('leads with the page line and no section heading, lists each goal by its event, and puts Add goal in the masthead', () => {
    renderPage()
    expect(
      screen.getByText(
        "A goal gives one of your site's events a name. It shows by that name on the dashboard and in funnels, and growth reports list it.",
      ),
    ).toBeInTheDocument()
    // §5.1: the page title already says Goals.
    expect(screen.queryByRole('heading', { name: 'Goals' })).toBeNull()

    expect(screen.getByText('Sign up')).toBeInTheDocument()
    const caption = screen.getByText('signup_click').closest('p')!
    expect(caption).toHaveTextContent('Counts the signup_click event.')
    expect(screen.getByText('signup_click').tagName).toBe('CODE')
    expect(screen.getByText('signup_click').className).toMatch(/\bfont-mono\b/)

    const add = screen.getByRole('button', { name: 'Add goal' })
    expect(screen.getByTestId('masthead-slot').contains(add)).toBe(true)
  })

  it('draws each row with both buttons in the same places, its last glyph on the right edge, delete in coral (R24)', () => {
    renderPage()
    for (const g of goals) {
      const edit = screen.getByRole('button', { name: `Edit ${g.name}` })
      const del = screen.getByRole('button', { name: `Delete ${g.name}` })
      expect(edit.parentElement).toBe(del.parentElement)
      expect(edit.parentElement!.lastElementChild).toBe(del)
      // A 14 px glyph in a 32 px button sits 9 px in; the group takes the inset back.
      expect(edit.parentElement!.className).toContain('-mr-[9px]')
      expect(del.className).toMatch(/\btext-destructive\b/)
      expect(del).toHaveAttribute('aria-haspopup', 'dialog')
    }
  })

  it('shows no goals as the title, the caption, the guide link, and a dimmed example led by its status', () => {
    useGoals.mockReturnValue(goalsState({ data: [] }))
    renderPage()
    expect(screen.getByText('No goals yet')).toBeInTheDocument()
    expect(screen.getByText('Send an event from your site, like a sign-up or a purchase, then add it here.')).toBeInTheDocument()

    const guide = screen.getByRole('link', { name: 'How to send an event' })
    expect(guide.getAttribute('href')).toMatch(/custom-events$/)
    expect(guide).toHaveAttribute('target', '_blank')
    expect(guide).toHaveAttribute('rel', 'noopener noreferrer')

    // The example is inert and dimmed; its status (R24: a dot and a word, no chip) is real, legible content.
    const preview = screen.getByText('Sign up').closest('[aria-hidden="true"]')
    expect(preview?.className).toMatch(/opacity-40/)
    const status = screen.getByText('Example')
    expect(status.closest('[data-kit-status="off"]')).not.toBeNull()
    expect(status.closest('[aria-hidden="true"]')).toBeNull()
    expect(status.closest('.opacity-40')).toBeNull()
    // The masthead's Add goal stays the page's one call to action.
    expect(screen.getAllByRole('button', { name: 'Add goal' })).toHaveLength(1)
  })

  it('loads as three placeholder rows, with no list and no Add goal yet', () => {
    useGoals.mockReturnValue(goalsState({ data: undefined, isLoading: true }))
    renderPage()
    const status = screen.getByRole('status', { name: 'Loading' })
    expect(status.querySelectorAll('[data-kit-row]')).toHaveLength(3)
    expect(screen.queryByText('No goals yet')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add goal' })).toBeNull()
  })

  it("says the goals did not load, never that there are none, and Try again fetches them again", () => {
    useGoals.mockReturnValue(goalsState({ data: undefined, error: new ApiError('Invalid credentials', 403) }))
    renderPage()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load your goals")
    // Facet's sentence for the status is not the page's words (§5.6, finding 3).
    expect(alert).not.toHaveTextContent(/Invalid credentials|Something went wrong/)
    expect(screen.queryByText('No goals yet')).toBeNull()
    expect(alert.querySelector('[data-kit-icon="state"]')!.className).toMatch(/\btext-destructive\b/)

    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('tells someone who cannot manage goals who can, with no list and no buttons', () => {
    mockCanManage = false
    renderPage()
    expect(screen.getByRole('heading', { name: 'Owners and admins only' })).toBeInTheDocument()
    expect(screen.getByText("Only your team's owners and admins can add and change goals.")).toBeInTheDocument()
    expect(screen.queryByText('Sign up')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add goal' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit Sign up' })).toBeNull()
  })
})

describe('GoalsPage: adding a goal (R13)', () => {
  it('opens the New goal form above the list, takes Add goal out of the masthead, and puts the cursor in Name', () => {
    const { container } = renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))

    const heading = screen.getByRole('heading', { name: 'New goal', level: 2 })
    expect(screen.queryByTestId('masthead-slot')!.childElementCount).toBe(0)
    expect(document.activeElement).toBe(nameInput())
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }))

    // The page's line, then the form, then the list.
    const intro = container.querySelector('[data-goals-intro]')!
    const form = container.querySelector('[data-goals-form="above"]')!
    const list = container.querySelector('[data-goals-list]')!
    expect(intro.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(form.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The form's closing hairline is the list's first.
    expect(list.firstElementChild!.className).toBe('border-b border-border')
  })

  it('carries the copy deck labels, captions and placeholders, the event name in mono', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    expect(nameInput()).toHaveAttribute('placeholder', 'Sign up')
    expect(screen.getByText('Shown on the dashboard, in funnels and in growth reports.')).toBeInTheDocument()
    expect(eventInput()).toHaveAttribute('placeholder', 'signup_click')
    expect(eventInput().className).toMatch(/\bfont-mono\b/)
    const eventCaption = document.getElementById('goal-event-caption')!
    expect(eventCaption).toHaveTextContent("The name your site sends, as in pulse.track('signup_click').")
    // R14: the second sentence went.
    expect(eventCaption).not.toHaveTextContent(/changed/)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('variant', 'outline')
  })

  it('adds the goal with what was typed, says so, refreshes the list and closes the form', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    type(nameInput(), '  Trial started ')
    type(eventInput(), ' trial_start ')
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Goal added'))
    expect(createGoal).toHaveBeenCalledWith('s1', { name: 'Trial started', event_name: 'trial_start' })
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('heading', { name: 'New goal' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Add goal' })).toBeInTheDocument()
  })

  it('sends with Enter from a field, and shows Saving… while the request runs', async () => {
    let finish: (g: Goal) => void = () => {}
    createGoal.mockReturnValue(new Promise<Goal>((r) => (finish = r)))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    type(nameInput(), 'Trial started')
    type(eventInput(), 'trial_start')
    fireEvent.submit(eventInput().closest('form')!)

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    // The rows' buttons are dimmed meanwhile, so the form cannot change under the request.
    expect(screen.getByRole('button', { name: 'Edit Purchase' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete Purchase' })).toBeDisabled()
    await act(async () => finish(goal('g3', 'Trial started', 'trial_start')))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'New goal' })).toBeNull())
  })

  it.each([
    ['', '', 'Give the goal a name.', 'Enter the event name your site sends.'],
    ['x'.repeat(256), 'signup', 'Use 255 characters or fewer.', null],
    // 128 two-byte letters are 256 bytes: the server counts bytes.
    ['é'.repeat(128), 'signup', 'Use 255 characters or fewer.', null],
    ['Sign up', 'sign up', null, 'Use letters, numbers and underscores only.'],
    ['Sign up', 'a'.repeat(65), null, 'Use 64 characters or fewer.'],
    ['Sign up', 'PageView', null, "pageview can't be a goal. Every pageview is counted already."],
    ['Sign up', 'SIGNUP_CLICK', null, 'This event already has a goal.'],
  ])('refuses name %j with event %j in the form, sending nothing', async (name, event, nameWords, eventWords) => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    type(nameInput(), name)
    type(eventInput(), event)
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))

    if (nameWords) {
      expect(await screen.findByText(nameWords)).toBeInTheDocument()
      expect(nameInput()).toHaveAttribute('aria-invalid', 'true')
      expect(nameInput().getAttribute('aria-describedby')).toContain('goal-name-problem')
    } else {
      expect(nameInput()).not.toHaveAttribute('aria-invalid')
    }
    if (eventWords) {
      expect(document.getElementById('goal-event-problem')).toHaveTextContent(eventWords)
      expect(eventInput()).toHaveAttribute('aria-invalid', 'true')
    } else {
      expect(document.getElementById('goal-event-problem')).toBeNull()
    }
    expect(createGoal).not.toHaveBeenCalled()
  })

  it('clears a field’s refusal as soon as that field changes', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    expect(await screen.findByText('Give the goal a name.')).toBeInTheDocument()
    type(nameInput(), 'S')
    expect(screen.queryByText('Give the goal a name.')).toBeNull()
    expect(screen.getByText('Enter the event name your site sends.')).toBeInTheDocument()
  })

  it("keeps the draft and says Couldn't add the goal when the request fails, in the page's own words", async () => {
    createGoal.mockRejectedValue(new ApiError('Something went wrong, please try again.', 500))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    type(nameInput(), 'Trial started')
    type(eventInput(), 'trial_start')
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't add the goal. Try again."))
    expect(toast.success).not.toHaveBeenCalled()
    expect(nameInput().value).toBe('Trial started')
    expect(eventInput().value).toBe('trial_start')
    expect(screen.getByRole('button', { name: 'Add goal' })).not.toBeDisabled()
  })

  it('shows the server refusing a second goal for one event as the field’s own words', async () => {
    createGoal.mockRejectedValue(new ApiError('Bad request', 400, { error: 'A goal with this event name already exists' }))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    type(nameInput(), 'Trial started')
    type(eventInput(), 'trial_start')
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))

    expect(await screen.findByText('This event already has a goal.')).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
    expect(eventInput().value).toBe('trial_start')
  })

  it('Cancel closes the form, sends nothing, and gives Add goal back to the masthead', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    type(nameInput(), 'Trial started')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('heading', { name: 'New goal' })).toBeNull()
    expect(createGoal).not.toHaveBeenCalled()
    expect(screen.getByTestId('masthead-slot')).toContainElement(screen.getByRole('button', { name: 'Add goal' }))
  })
})

describe('GoalsPage: changing a goal (R13, R14)', () => {
  it('opens Edit goal above the list with the goal filled in and its event name open to change', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Sign up' }))
    expect(screen.getByRole('heading', { name: 'Edit goal', level: 2 })).toBeInTheDocument()
    expect(nameInput().value).toBe('Sign up')
    expect(eventInput().value).toBe('signup_click')
    expect(eventInput()).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save goal' })).toBeInTheDocument()
  })

  it('brings the form into view and puts the cursor in Name when a pencil low on a long list is pressed', () => {
    const many = Array.from({ length: 30 }, (_, i) => goal(`g${i}`, `Goal ${i}`, `event_${i}`))
    useGoals.mockReturnValue(goalsState({ data: many }))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Goal 29' }))

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    const scrolled = scrollIntoView.mock.contexts[0] as Element
    expect(scrolled.contains(screen.getByRole('heading', { name: 'Edit goal' }))).toBe(true)
    expect(document.activeElement).toBe(nameInput())
    expect(nameInput().value).toBe('Goal 29')

    // Pressed again after scrolling away, it brings the form back.
    fireEvent.click(screen.getByRole('button', { name: 'Edit Goal 29' }))
    expect(scrollIntoView).toHaveBeenCalledTimes(2)
  })

  it('saves a new event name for the goal (R14) and says Goal saved', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Sign up' }))
    type(eventInput(), 'signup_done')
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Goal saved'))
    expect(updateGoal).toHaveBeenCalledWith('s1', 'g1', { name: 'Sign up', event_name: 'signup_done' })
    expect(createGoal).not.toHaveBeenCalled()
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('heading', { name: 'Edit goal' })).toBeNull()
  })

  it('lets a goal keep its own event name, and refuses another goal’s', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Sign up' }))
    type(eventInput(), 'purchase')
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }))
    expect(await screen.findByText('This event already has a goal.')).toBeInTheDocument()
    expect(updateGoal).not.toHaveBeenCalled()

    type(eventInput(), 'signup_click')
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }))
    await waitFor(() => expect(updateGoal).toHaveBeenCalledWith('s1', 'g1', { name: 'Sign up', event_name: 'signup_click' }))
  })

  it("keeps the draft and says Couldn't save the goal when the request fails, never Facet's sentence", async () => {
    updateGoal.mockRejectedValue(new ApiError('Invalid credentials', 403))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Sign up' }))
    type(nameInput(), 'Signed up')
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't save the goal. Try again."))
    expect(toast.error).not.toHaveBeenCalledWith('Invalid credentials')
    expect(nameInput().value).toBe('Signed up')
    expect(screen.getByRole('heading', { name: 'Edit goal' })).toBeInTheDocument()
  })
})

describe('GoalsPage: deleting a goal', () => {
  it('names the goal in a hold dialog with a coral bin, and says what goes and what stays', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Sign up' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete the goal "Sign up"?' })
    expect(dialog.querySelector('[data-kit-icon="heading"]')!.className).toMatch(/\btext-destructive\b/)
    expect(within(dialog).getByTestId('hold-description')).toHaveTextContent(
      'The name goes, and growth reports and exports stop listing signup_click as a goal. Every signup_click event stays counted on the dashboard. You can add the goal again at any time.',
    )
    // The carried finding: nothing recorded is deleted, and the dialog no longer says so.
    expect(dialog).not.toHaveTextContent(/everything recorded/)
    expect(within(dialog).getByRole('button', { name: 'Hold to delete' })).toBeInTheDocument()
  })

  it('hides the goal at once on confirm, and sends the delete only when the Undo window runs out', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Sign up' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))

    expect(screen.queryByText('Sign up')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(deleteGoal).not.toHaveBeenCalled()
    expect(deferred[0]!.message).toBe('"Sign up" deleted')

    await act(() => commitLast())
    expect(deleteGoal).toHaveBeenCalledWith('s1', 'g1', { keepalive: false })
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('passes keepalive through when the delete is sent as the page closes', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Sign up' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    await act(() => commitLast({ keepalive: true }))
    expect(deleteGoal).toHaveBeenCalledWith('s1', 'g1', { keepalive: true })
  })

  it('Undo brings the goal back and sends nothing', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Sign up' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    act(() => undoLast())
    expect(screen.getByText('Sign up')).toBeInTheDocument()
    expect(deleteGoal).not.toHaveBeenCalled()
  })

  it("brings the goal back and says Couldn't delete in the page's own words when the request fails", async () => {
    deleteGoal.mockRejectedValue(new ApiError('Invalid credentials', 403))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Sign up' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    await act(() => commitLast())
    expect(toast.error).toHaveBeenCalledWith('Couldn\'t delete "Sign up". Try again.')
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Sign up')).toBeInTheDocument()
  })

  it('closes the form when the goal open in it is deleted', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Sign up' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Sign up' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    expect(screen.queryByRole('heading', { name: 'Edit goal' })).toBeNull()
  })

  it('Cancel closes the dialog and deletes nothing', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Sign up' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(deferred).toHaveLength(0)
    expect(screen.getByText('Sign up')).toBeInTheDocument()
  })
})

describe('GoalsPage: words', () => {
  // Copy deck §1: no em or en dashes; "Pick", never "Choose" (R16). Comments are stripped first.
  it('writes no em or en dash and no "Choose" in its copy', () => {
    for (const src of SOURCES) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      expect(code).not.toMatch(/[—–]/)
      expect(code).not.toMatch(/\bChoose\b/)
    }
  })
})
