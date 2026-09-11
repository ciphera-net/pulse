import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// The progress rail (direction B, 11-09-2026) — what replaced the five-square
// stepper. These pin the two things that matter: the ladder is THREE steps,
// and the plan step appears only for somebody who brought a plan with them.

let pathname = '/setup/site'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

let pendingPlan: { planId: string; interval: string; limit: number } | null = null
vi.mock('@/lib/setup/context', () => ({
  useSetup: () => ({ pendingPlan }),
}))

import SetupRail from '../SetupRail'

beforeEach(() => {
  pathname = '/setup/site'
  pendingPlan = null
})

describe('SetupRail', () => {
  it('is a three-step ladder for a normal signup: site, install, done', () => {
    render(<SetupRail />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuemax', '3')
    expect(bar).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByText('Step 1 of 3')).toBeTruthy()
    expect(screen.getByText('33%')).toBeTruthy()
  })

  it('fills to 100% on the done step', () => {
    pathname = '/setup/done'
    render(<SetupRail />)
    expect(screen.getByText('Step 3 of 3')).toBeTruthy()
    expect(screen.getByText('100%')).toBeTruthy()
    expect(screen.getByTestId('setup-rail-fill').style.width).toBe('100%')
  })

  // 🔴 THE PLAN STEP IS NOT ON THE LADDER — unless it will actually be walked.
  // Somebody who chose a plan on the pricing page and then signed up carries
  // `pendingPlan` through the wizard and does finish at checkout; for them the
  // rail is four steps and honest. For everyone else, three: no step is shown
  // that the person is not going to take.
  it('never shows a plan step to somebody who did not bring a plan', () => {
    pathname = '/setup/install'
    render(<SetupRail />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '3')
    expect(screen.getByText('Step 2 of 3')).toBeTruthy()
  })

  it('shows the plan step only when a plan was brought from the pricing page', () => {
    pendingPlan = { planId: 'business', interval: 'month', limit: 100000 }
    pathname = '/setup/plan'
    render(<SetupRail />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuemax', '4')
    expect(bar).toHaveAttribute('aria-valuenow', '3')
    expect(screen.getByText('Step 3 of 4')).toBeTruthy()
  })

  it('renders nothing on /setup/org, which is off the ladder', () => {
    pathname = '/setup/org'
    const { container } = render(<SetupRail />)
    expect(container.firstChild).toBeNull()
  })

  it('says which step it is, in words, for assistive tech', () => {
    pathname = '/setup/install'
    render(<SetupRail />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Step 2 of 3, Install the script')
  })
})
