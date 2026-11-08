// @vitest-environment jsdom
//
// VersionToast and the What's new button share one notice (lib/updateNotice.ts). What these pin:
//
//  1. The toast publishes "a new version is ready" for the button to show.
//  2. It steps aside while the button has claimed the notice, and only then.
//  3. A tab broken by a failed chunk load always shows it, claimed or not.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { NewVersionReason } from '@/lib/hooks/useVersionCheck'

let fire: ((reason: NewVersionReason) => void) | null = null
vi.mock('@/lib/hooks/useVersionCheck', () => ({
  useVersionCheck: (cb: (reason: NewVersionReason) => void) => {
    fire = cb
  },
}))
vi.mock('@phosphor-icons/react', () => ({ ArrowClockwise: () => null, X: () => null }))

import VersionToast from '../VersionToast'
import { resetUpdateNoticeForTests, useClaimUpdateNotice, useUpdateReady } from '@/lib/updateNotice'

function Claimer({ active }: { active: boolean }) {
  useClaimUpdateNotice(active)
  return null
}
function ReadyProbe() {
  return <span data-testid="ready">{String(useUpdateReady())}</span>
}

beforeEach(() => {
  fire = null
  resetUpdateNoticeForTests()
})
afterEach(() => cleanup())

describe('VersionToast', () => {
  it('shows the notice and publishes it when nothing has claimed it', () => {
    render(<><VersionToast /><ReadyProbe /></>)
    expect(screen.getByTestId('ready').textContent).toBe('false')
    act(() => fire!('poll'))
    expect(screen.getByText('Update available')).toBeTruthy()
    expect(screen.getByTestId('ready').textContent).toBe('true')
  })

  it("steps aside while the What's new button has the notice, and returns when it goes", () => {
    const { rerender } = render(<><VersionToast /><Claimer active /><ReadyProbe /></>)
    act(() => fire!('poll'))
    expect(screen.queryByText('Update available')).toBeNull()
    expect(screen.getByTestId('ready').textContent).toBe('true')
    rerender(<><VersionToast /><Claimer active={false} /><ReadyProbe /></>)
    expect(screen.getByText('Update available')).toBeTruthy()
  })

  it('shows for a tab broken by a failed chunk load even when the notice is claimed', () => {
    render(<><VersionToast /><Claimer active /></>)
    act(() => fire!('chunk'))
    expect(screen.getByText('Update available')).toBeTruthy()
  })
})
