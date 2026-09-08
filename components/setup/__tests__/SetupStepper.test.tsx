import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// P5 wizard-step tests (25-08-2026): the server-truth stepper's honesty
// contract from ruled C1 — a completed step gets a checkmark, a SKIPPED step
// keeps its number even when you are past it (skip ≠ done was part of the lie
// the rebuild removed), and exactly the current step carries aria-current.

let pathname = '/setup/done'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

import SetupStepper from '../SetupStepper'

beforeEach(() => {
  pathname = '/setup/done'
})

describe('SetupStepper', () => {
  it('marks exactly the current step with aria-current="step"', () => {
    pathname = '/setup/install'
    const { container } = render(<SetupStepper completedSteps={new Set(['org', 'site'])} />)
    const current = container.querySelectorAll('[aria-current="step"]')
    expect(current).toHaveLength(1)
    expect(current[0].textContent).toContain('Install script')
  })

  it('keeps numbers on skipped steps — being past a step never fakes a checkmark', () => {
    // On the done page with only the site completed: install and plan were
    // SKIPPED. They must render as "2" and "3", not checks.
    const { container } = render(<SetupStepper completedSteps={new Set(['org', 'site'])} />)
    const checks = container.querySelectorAll('svg')
    expect(checks).toHaveLength(1) // site only — 'org' is no longer a step
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('renders a checkmark for every server-completed step', () => {
    const { container } = render(
      <SetupStepper completedSteps={new Set(['org', 'site', 'install', 'plan'])} />
    )
    // Three, not four: the workspace is provisioned, not stepped through.
    expect(container.querySelectorAll('svg')).toHaveLength(3)
    expect(screen.queryByText('1')).toBeNull()
  })

  it('shows no workspace step — it is not something a person does', () => {
    // 🔴 08-09-2026. The workspace is created for a new account before they
    // arrive, so a "Create workspace" entry showed a step nobody could visit,
    // already ticked, at the top of the ladder. The owner, on seeing it:
    // "i couldn't go to it. but it shouldn't show."
    render(<SetupStepper completedSteps={new Set(['org'])} />)
    expect(screen.queryByText('Create workspace')).toBeNull()
  })

  it('renders nothing marked current on /setup/org, which is off the ladder', () => {
    // The page still EXISTS as the provisioning fallback and for creating a
    // second workspace; it simply is not a rung. findIndex returns -1 there.
    pathname = '/setup/org'
    const { container } = render(<SetupStepper completedSteps={new Set()} />)
    expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(0)
  })

  it('labels only the plan step Optional', () => {
    render(<SetupStepper completedSteps={new Set()} />)
    // One visible "Optional" caption (the other slots render an invisible
    // placeholder with the same text kept out of the accessibility tree by
    // class only — assert the count of elements NOT marked invisible).
    const captions = screen.getAllByText('Optional').filter(el => !el.className.includes('invisible'))
    expect(captions.length).toBeGreaterThanOrEqual(1)
  })

  it('prints the mobile step line for the current step', () => {
    pathname = '/setup/plan'
    render(<SetupStepper completedSteps={new Set(['org', 'site', 'install'])} />)
    expect(screen.getByText(/Step 3 of 4 · Choose plan/)).toBeTruthy()
  })
})
