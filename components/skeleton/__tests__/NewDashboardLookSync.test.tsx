import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  feature: vi.fn<(flag: string) => boolean | null>(),
  setNewLook: vi.fn<(on: boolean) => void>(),
}))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: h.user }) }))
vi.mock('@/lib/features', () => ({ useFeature: (flag: string) => h.feature(flag) }))
vi.mock('@/lib/skeleton/look', () => ({ setNewLook: (on: boolean) => h.setNewLook(on) }))

import NewDashboardLookSync from '@/components/skeleton/NewDashboardLookSync'

// Keeps the device's copy of "the team has the new dashboard" right. It writes on an ANSWER and never on a guess:
// signed out, or while /me is on its way, the copy stands, or the first skeleton after signing in would be wrong.

beforeEach(() => {
  vi.clearAllMocks()
  h.user = { id: 'u1' }
})

describe('NewDashboardLookSync', () => {
  it('draws nothing', () => {
    h.feature.mockReturnValue(true)
    const { container } = render(<NewDashboardLookSync />)
    expect(container.innerHTML).toBe('')
  })

  it('asks for the new dashboard\'s own flag', () => {
    h.feature.mockReturnValue(false)
    render(<NewDashboardLookSync />)
    expect(h.feature).toHaveBeenCalledWith('new-dashboard')
  })

  it.each([[true], [false]])('writes the team\'s answer once /me has given it (%s)', (answer) => {
    h.feature.mockReturnValue(answer)
    render(<NewDashboardLookSync />)
    expect(h.setNewLook).toHaveBeenCalledTimes(1)
    expect(h.setNewLook).toHaveBeenCalledWith(answer)
  })

  it('writes nothing while /me is still on its way, or after it failed', () => {
    h.feature.mockReturnValue(null)
    render(<NewDashboardLookSync />)
    expect(h.setNewLook).not.toHaveBeenCalled()
  })

  it('writes nothing signed out, where the flag hook answers "off" for want of a team', () => {
    h.user = null
    h.feature.mockReturnValue(false)
    render(<NewDashboardLookSync />)
    expect(h.setNewLook).not.toHaveBeenCalled()
  })

  it('follows a switch made while the page is open (Settings → Beta, a change of team)', () => {
    h.feature.mockReturnValue(false)
    const { rerender } = render(<NewDashboardLookSync />)
    h.feature.mockReturnValue(true)
    rerender(<NewDashboardLookSync />)
    expect(h.setNewLook.mock.calls).toEqual([[false], [true]])
    // The same answer again is not written again.
    rerender(<NewDashboardLookSync />)
    expect(h.setNewLook).toHaveBeenCalledTimes(2)
  })
})
