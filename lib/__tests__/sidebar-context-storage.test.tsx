import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { SidebarProvider, useSidebar } from '@/lib/sidebar-context'

// The rail's collapsed state is remembered in localStorage. The public pages (/demo,
// /share/<id>, PUL-34) mount for anyone, and a browser may refuse storage outright (Safari
// with cookies blocked, a locked-down profile, a sandboxed frame): that must cost the
// remembered preference and nothing else, not the page.
function Probe() {
  const { collapsed, toggle, expand, collapse } = useSidebar()
  return (
    <div>
      <span data-testid="state">{collapsed ? 'collapsed' : 'expanded'}</span>
      <button onClick={toggle}>toggle</button>
      <button onClick={expand}>expand</button>
      <button onClick={collapse}>collapse</button>
    </div>
  )
}

const state = () => screen.getByTestId('state').textContent

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('the sidebar preference', () => {
  it('starts collapsed with nothing remembered, expanded when it was left expanded', () => {
    const first = render(<SidebarProvider><Probe /></SidebarProvider>)
    expect(state()).toBe('collapsed')
    first.unmount()

    localStorage.setItem('pulse_sidebar_collapsed', 'false')
    render(<SidebarProvider><Probe /></SidebarProvider>)
    expect(state()).toBe('expanded')
  })

  it('remembers what it is set to', () => {
    render(<SidebarProvider><Probe /></SidebarProvider>)
    fireEvent.click(screen.getByText('expand'))
    expect(localStorage.getItem('pulse_sidebar_collapsed')).toBe('false')
    fireEvent.click(screen.getByText('collapse'))
    expect(localStorage.getItem('pulse_sidebar_collapsed')).toBe('true')
    fireEvent.click(screen.getByText('toggle'))
    expect(localStorage.getItem('pulse_sidebar_collapsed')).toBe('false')
  })

  describe('when the browser refuses storage', () => {
    function refuseStorage() {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError') })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError') })
    }

    it('still mounts, collapsed', () => {
      refuseStorage()
      render(<SidebarProvider><Probe /></SidebarProvider>)
      expect(state()).toBe('collapsed')
    })

    it('still moves, though it cannot remember', () => {
      refuseStorage()
      render(<SidebarProvider><Probe /></SidebarProvider>)
      fireEvent.click(screen.getByText('toggle'))
      expect(state()).toBe('expanded')
      fireEvent.click(screen.getByText('collapse'))
      expect(state()).toBe('collapsed')
      fireEvent.click(screen.getByText('expand'))
      expect(state()).toBe('expanded')
    })

    it('still answers the [ key', () => {
      refuseStorage()
      render(<SidebarProvider><Probe /></SidebarProvider>)
      act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: '[' })) })
      expect(state()).toBe('expanded')
    })
  })
})
