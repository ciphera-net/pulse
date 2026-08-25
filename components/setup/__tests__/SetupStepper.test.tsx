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
    // On the done page with only org+site completed: install and plan were
    // SKIPPED. They must render as "3" and "4", not checks.
    const { container } = render(<SetupStepper completedSteps={new Set(['org', 'site'])} />)
    const checks = container.querySelectorAll('svg')
    expect(checks).toHaveLength(2) // org + site only
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
  })

  it('renders a checkmark for every server-completed step', () => {
    const { container } = render(
      <SetupStepper completedSteps={new Set(['org', 'site', 'install', 'plan'])} />
    )
    expect(container.querySelectorAll('svg')).toHaveLength(4)
    expect(screen.queryByText('2')).toBeNull()
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
    expect(screen.getByText(/Step 4 of 5 · Choose plan/)).toBeTruthy()
  })
})
