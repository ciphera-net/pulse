import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { EmptyState } from '@/components/ui/EmptyState'

// ---------------------------------------------------------------------------
// Pulse's one empty state (R57, 16-11-2026: one format everywhere). A page, a settings section and a dashboard block
// all draw this: the icon alone in the brand's ink, a title, a short line, and the action in the app's bordered
// button. The tinted tile and the filled orange button it replaced must not come back.
// ---------------------------------------------------------------------------

const classesOf = (el: Element | null | undefined) => (el?.className ?? '').toString().split(' ')

describe('the empty state', () => {
  it('draws the icon alone, the title and the line, marked for the probes', () => {
    const { container } = render(<EmptyState icon={<svg data-testid="icon" />} title="No funnels yet" description="A funnel shows how many visitors get from one step to the next." />)
    expect(container.firstElementChild?.hasAttribute('data-empty-state')).toBe(true)
    // No tile: the icon's own wrapper carries only the ink and the icon's size.
    expect(container.querySelector('.bg-brand-orange\\/10')).toBeNull()
    expect(classesOf(screen.getByTestId('icon').parentElement)).toContain('text-brand-ink')
    expect(classesOf(screen.getByTestId('icon').parentElement)).not.toContain('h-20')
    expect(classesOf(screen.getByRole('heading'))).toEqual(expect.arrayContaining(['text-base', 'font-semibold']))
    expect(classesOf(screen.getByText(/A funnel shows/))).toContain('text-caption')
  })

  it('draws a link action as the bordered button, never the filled orange one', () => {
    render(<EmptyState title="No events in this range" action={{ label: 'How to send events', href: 'https://docs.ciphera.net/pulse/custom-events', external: true }} />)
    const link = screen.getByRole('link', { name: 'How to send events' })
    expect(classesOf(link)).toEqual(expect.arrayContaining(['border', 'border-input', 'bg-card', 'hover:border-line-hover', 'font-normal']))
    expect(classesOf(link)).not.toContain('bg-brand-orange')
    expect(classesOf(link)).not.toContain('text-brand-ink')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('draws an action that acts in place as the same bordered button', () => {
    render(<EmptyState title="Nothing matches this filter" action={{ label: 'Clear filter', onClick: () => {} }} />)
    expect(classesOf(screen.getByRole('button', { name: 'Clear filter' }))).toEqual(expect.arrayContaining(['border-input', 'bg-card']))
  })

  it('keeps an action that both links and records (the settings link names its site first)', () => {
    let recorded = false
    render(<EmptyState title="Outbound links are switched off" action={{ label: 'Open site settings', href: '/settings/site/general', onClick: () => { recorded = true } }} />)
    fireEvent.click(screen.getByRole('link', { name: 'Open site settings' }))
    expect(recorded).toBe(true)
  })

  it('takes a caller\'s spacing over its own', () => {
    const { container } = render(<EmptyState title="No visits in this range" className="h-full py-6" />)
    const box = classesOf(container.firstElementChild)
    expect(box).toEqual(expect.arrayContaining(['h-full', 'py-6']))
    expect(box).not.toContain('py-12')
  })
})

describe('one empty state across Pulse (R57, 16-11-2026)', () => {
  const ROOT = path.resolve(__dirname, '../../..')
  // Every component and page, folders included: the second kind lived in the dashboard's bottom block, which a scan of
  // the top folder alone never read.
  const files = ['components', 'app'].flatMap((top) =>
    (fs.readdirSync(path.join(ROOT, top), { recursive: true }) as string[])
      .filter((name) => /\.tsx$/.test(name) && !name.includes('__tests__'))
      .map((name) => path.join(top, name)),
  )
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1')

  it('nothing draws an empty state of its own kind by hand', () => {
    // The marks of the kinds it replaced, each found in the app before R57: EmptyState's own tinted tile, the bottom
    // block's grey icon and hand-made button, the dashboard blocks' "disabled in site settings" lines and their box,
    // the instrument-off tile, the home page's dashed orange box, and the settings pages' grey access icon.
    const MARKS = new RegExp([
      'h-20 w-20 items-center justify-center rounded-none bg-brand-orange/10',
      'text-2xl text-neutral-600',
      'inline-flex h-9 items-center border border-neutral-800',
      'disabled in site settings',
      'h-full flex flex-col items-center justify-center text-center px-4',
      'rounded-none bg-neutral-800 p-5 text-neutral-500',
      'border-2 border-dashed border-brand-orange/30',
      'mb-4 h-12 w-12 text-neutral-600',
    ].map((m) => m.replace(/[/]/g, '\\/')).join('|'))
    const byHand = files.filter((name) => MARKS.test(strip(fs.readFileSync(path.join(ROOT, name), 'utf8'))))
    // A scan that reads nothing proves nothing.
    expect(files.length).toBeGreaterThan(200)
    expect(files).toContain(path.join('components', 'dashboard', 'bottom', 'ConversionBlock.tsx'))
    expect(byHand).toEqual([])
  })
})
