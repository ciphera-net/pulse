import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EmptyState } from '@/components/ui/EmptyState'

// ---------------------------------------------------------------------------
// The two kinds of empty (R57, 16-11-2026). A whole page with nothing yet keeps the tinted tile and the filled
// orange button; a block on the dashboard is the lighter kind, its action in the dashboard's bordered button. Both
// are drawn here so a change to one cannot quietly change the other.
// ---------------------------------------------------------------------------

const classesOf = (el: Element | null | undefined) => (el?.className ?? '').toString().split(' ')

describe('a page with nothing yet (the default)', () => {
  it('keeps the tinted tile around the icon, the large title and the filled orange button', () => {
    const { container } = render(<EmptyState icon={<svg data-testid="icon" />} title="No funnels yet" description="Create one." action={{ label: 'Create funnel', href: '/funnels/new' }} />)
    expect(container.firstElementChild?.getAttribute('data-empty-state')).toBe('page')
    expect(classesOf(screen.getByTestId('icon').parentElement)).toEqual(expect.arrayContaining(['h-20', 'w-20', 'bg-brand-orange/10']))
    expect(classesOf(screen.getByRole('heading'))).toContain('text-title-2')
    expect(classesOf(screen.getByRole('link', { name: 'Create funnel' }))).toEqual(expect.arrayContaining(['bg-brand-orange', 'text-white']))
  })
})

describe('a block on the dashboard', () => {
  it('draws the icon alone, a smaller title, and the action as the bordered button', () => {
    const { container } = render(<EmptyState variant="block" icon={<svg data-testid="icon" />} title="No events in this range" description="Try a longer range." action={{ label: 'How to send events', href: 'https://docs.ciphera.net/pulse/custom-events', external: true }} />)
    expect(container.firstElementChild?.getAttribute('data-empty-state')).toBe('block')
    // No tile: the icon's own wrapper carries only the ink and the icon's size.
    expect(container.querySelector('.bg-brand-orange\\/10')).toBeNull()
    expect(classesOf(screen.getByTestId('icon').parentElement)).toContain('text-brand-ink')
    expect(classesOf(screen.getByRole('heading'))).toContain('text-base')
    const link = screen.getByRole('link', { name: 'How to send events' })
    expect(classesOf(link)).toEqual(expect.arrayContaining(['border', 'border-input', 'bg-card', 'hover:border-line-hover', 'font-normal']))
    expect(classesOf(link)).not.toContain('bg-brand-orange')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('keeps an action that both links and records (the settings link names its site first)', () => {
    let recorded = false
    render(<EmptyState variant="block" title="Outbound links are switched off" action={{ label: 'Open site settings', href: '/settings/site/general', onClick: () => { recorded = true } }} />)
    fireEvent.click(screen.getByRole('link', { name: 'Open site settings' }))
    expect(recorded).toBe(true)
  })

  it('draws a button where the action acts in place', () => {
    render(<EmptyState variant="block" title="Nothing matches this filter" action={{ label: 'Clear filter', onClick: () => {} }} />)
    expect(classesOf(screen.getByRole('button', { name: 'Clear filter' }))).toContain('border-input')
  })
})
