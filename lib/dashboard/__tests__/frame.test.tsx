import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const feature = vi.hoisted(() => ({ read: vi.fn<(flag: string) => boolean | null>() }))
vi.mock('@/lib/features', () => ({ useFeature: (flag: string) => feature.read(flag) }))
vi.mock('framer-motion', () => import('@/components/settings/__tests__/framer-mock'))

import {
  CardFooter,
  DashboardFrameProvider,
  FRAME_CARD,
  panelSurface,
  useDashboardFrame,
  useGlassPanels,
} from '@/lib/dashboard/frame'
import FilterPopover from '@/components/dashboard/filter/FilterPopover'
import DateRangePicker from '@/components/ui/DateRangePicker'

// The new dashboard frame: the CONTEXT that tells a block it is in the frame, and glass on pop-ups and menus on every
// page. Both were a beta's (the flag `new-dashboard`) until 15-11-2026, when the dashboard went to everyone: glass
// is now every reader's, and nothing reads the flag any more (a stand-in for /me below proves it).

function Probe() {
  return <span data-testid="probe">{String(useDashboardFrame())}</span>
}
function GlassProbe() {
  return <span data-testid="glass">{String(useGlassPanels())}</span>
}

// jsdom has no ResizeObserver; the filter's panel watches its own content with one.
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
})

beforeEach(() => {
  feature.read.mockReset().mockReturnValue(false)
})

describe('the frame\'s context', () => {
  it('is off wherever nothing provides it, and on inside the provider', () => {
    const { unmount } = render(<Probe />)
    expect(screen.getByTestId('probe').textContent).toBe('false')
    unmount()
    render(<DashboardFrameProvider><Probe /></DashboardFrameProvider>)
    expect(screen.getByTestId('probe').textContent).toBe('true')
  })

  it('does not read the flag: a block is in the frame because the surface put it there', () => {
    render(<DashboardFrameProvider><Probe /></DashboardFrameProvider>)
    expect(feature.read).not.toHaveBeenCalled()
  })

  it('pins a block at one size', () => {
    expect(FRAME_CARD.split(' ')).toContain('h-[442px]')
    expect(FRAME_CARD.split(' ')).not.toContain('h-full')
  })
})

describe('CardFooter', () => {
  it('is no element at all outside the frame: its children sit where they always did', () => {
    const { container } = render(<div data-testid="card"><CardFooter><p>note</p><nav>pager</nav></CardFooter></div>)
    expect(screen.queryByTestId('card-footer')).toBeNull()
    expect([...container.querySelector('[data-testid="card"]')!.children].map((c) => c.tagName)).toEqual(['P', 'NAV'])
  })

  it('is one row in the frame', () => {
    render(<DashboardFrameProvider><CardFooter><p>note</p><nav>pager</nav></CardFooter></DashboardFrameProvider>)
    const footer = screen.getByTestId('card-footer')
    expect([...footer.children].map((c) => c.tagName)).toEqual(['P', 'NAV'])
    expect(footer.className.split(' ')).toEqual(expect.arrayContaining(['flex', 'h-6', 'items-center', 'shrink-0', 'empty:hidden']))
  })
})

describe('glass on pop-ups and menus, on every page, for every reader', () => {
  it.each([[true], [false], [null]])('whatever /me says (%s), glass is on, and the flag is not asked for', (value) => {
    feature.read.mockReturnValue(value)
    render(<GlassProbe />)
    expect(screen.getByTestId('glass').textContent).toBe('true')
    expect(feature.read).not.toHaveBeenCalled()
  })

  it('no file of the app reads the flag any more: no quoted flag name, no constant (comments keep its history)', () => {
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    const hits = execSync(`git grep -l -e "'new-dashboard'" -e '"new-dashboard"' -e NEW_DASHBOARD_FLAG -- 'app/*' 'components/*' 'lib/*' ':!*__tests__*' || true`, { encoding: 'utf8' }).trim()
    expect(hits).toBe('')
  })

  it('is one of two surfaces, never a mix', () => {
    expect(panelSurface(true)).toBe('glass-panel border border-white/[0.08]')
    expect(panelSurface(false)).toBe('bg-popover border border-border')
  })

  const picker = () => (
    <DateRangePicker
      label="Last 7 days"
      tick="7"
      rows={[{ key: '7', label: 'Last 7 days', section: 'relative', available: true }]}
      footnote={null}
      onPick={() => {}}
      onCustom={() => {}}
      now={new Date('2026-11-14T12:00:00Z')}
      calendar={{ max: '2026-11-14', maxDays: 366, range: { start: '2026-11-08', end: '2026-11-14' } }}
    />
  )
  const openPicker = () => fireEvent.click(document.querySelector('[data-tour="date-range-picker"]') as HTMLElement)

  it('the date menu is glass', () => {
    render(picker())
    openPicker()
    const panel = document.querySelector('[data-view-switcher]') as HTMLElement
    expect(panel.className).toContain('glass-panel')
    expect(panel.className).toContain('border-white/[0.08]')
    expect(panel.className).not.toContain('bg-popover')
    expect(panel.className).not.toContain('border-border')
  })

  const popover = (anchor: HTMLElement) => (
    <FilterPopover open anchor={anchor} label="Add filter" contentKey="a" onClose={() => {}}><p>stage</p></FilterPopover>
  )

  it('the filter is glass', () => {
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)
    render(popover(anchor))
    expect(screen.getByRole('dialog', { name: 'Add filter' }).className).toContain('glass-panel')
    expect(screen.getByRole('dialog', { name: 'Add filter' }).className).not.toContain('bg-popover')
    anchor.remove()
  })

  it('What\'s new takes its surface from the same switch', () => {
    // Opening it needs the whole feed; its surface is one expression, pinned here as written.
    const src = readFileSync(join(process.cwd(), 'components/whats-new/WhatsNewButton.tsx'), 'utf8')
    expect(src).toContain('const glass = useGlassPanels()')
    expect(src).toContain('rounded-none ${panelSurface(glass)}`}')
    expect(src).not.toContain('border border-border bg-popover')
  })
})
