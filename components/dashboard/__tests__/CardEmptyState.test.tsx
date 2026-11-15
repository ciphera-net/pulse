import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'

const perms = vi.hoisted(() => ({ canEdit: true }))
vi.mock('@/lib/auth/permissions', () => ({ useCan: () => perms.canEdit }))

import CardEmptyState from '@/components/dashboard/CardEmptyState'
import { EmptyFactsProvider, type EmptyFacts } from '@/lib/dashboard/emptyFacts'
import { SiteScopeProvider, memberScope, SITE_PAGES, type SiteScope } from '@/lib/scope/SiteScope'

// ---------------------------------------------------------------------------
// What an empty dashboard block says (owner rulings R11 and R21 to R23, 14-11-2026).
//
// One block used to say one thing whatever the reason, and six blocks offered an orange "Install tracking script"
// button on sites whose script had reported for months. There are five reasons a block is empty and each has its
// own words. This file walks them, and the order in which one wins over another.
// ---------------------------------------------------------------------------

const demoScope: SiteScope = { siteId: 'site-1', mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full' }
const shareScope: SiteScope = { siteId: 'site-1', mode: 'public', basePath: '/share/site-1', pages: ['dashboard'], demo: false, fidelity: 'scoped' }
const KNOWN: EmptyFacts = { filtered: false, neverVisited: false, canWiden: true, nobodyLive: false }
const DOCS = { label: 'How to send events', href: 'https://docs.ciphera.net/pulse/custom-events' }
const OFF = { title: 'Outbound links are switched off', description: 'This site does not record clicks on links to other sites.' }

function show(
  facts: Partial<EmptyFacts>,
  props: Partial<React.ComponentProps<typeof CardEmptyState>> = {},
  scope: SiteScope | null = memberScope('site-1'),
) {
  const state = (
    <EmptyFactsProvider value={{ ...KNOWN, ...facts }}>
      <CardEmptyState kind="events" fresh="Events your site sends are counted here." {...props} />
    </EmptyFactsProvider>
  )
  return render(scope ? <SiteScopeProvider scope={scope}>{state}</SiteScopeProvider> : state)
}
/** The heading, the line under it and every link or button, as a reader meets them. */
const read = () => ({
  title: screen.getByRole('heading').textContent,
  line: document.querySelector('p')?.textContent ?? null,
  actions: [...document.querySelectorAll('a, button')].map((el) => el.textContent),
})

beforeEach(() => {
  perms.canEdit = true
  sessionStorage.clear()
})

describe('the site has visits and this range has none of the kind', () => {
  it('says the block\'s own heading and suggests a longer range', () => {
    show({})
    expect(read()).toEqual({ title: 'No events in this range', line: 'Try a longer range.', actions: [] })
  })

  it('does not suggest a longer range when the range is already All time', () => {
    show({ canWiden: false })
    expect(read()).toEqual({ title: 'No events in this range', line: null, actions: [] })
  })

  it('carries its one docs link, where the block has one, opened in a new tab', () => {
    show({}, { docs: DOCS })
    const link = screen.getByRole('link', { name: 'How to send events' })
    expect(link.getAttribute('href')).toBe(DOCS.href)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(read().actions).toEqual(['How to send events'])
  })

  it('says the same outside the dashboard, where nothing is known (no provider)', () => {
    render(<CardEmptyState kind="visits" fresh="The sites that send you visitors are listed here." />)
    expect(read()).toEqual({ title: 'No visits in this range', line: 'Try a longer range.', actions: [] })
  })
})

describe('no visit has ever arrived', () => {
  it('says "No visitors yet" and what THIS block will show', () => {
    show({ neverVisited: true })
    expect(read()).toEqual({ title: 'No visitors yet', line: 'Events your site sends are counted here.', actions: [] })
  })

  it('offers no install button: the banner above the chart asks for the install, once', () => {
    show({ neverVisited: true }, { docs: DOCS })
    expect(screen.queryByText(/install/i)).toBeNull()
    // …and a docs link only for a block that says so (Events, whose setup sits beside the script's).
    expect(read().actions).toEqual([])
  })

  it('keeps the docs link of a block that asks for it on a new site', () => {
    show({ neverVisited: true }, { docs: { ...DOCS, whenFresh: true } })
    expect(read().actions).toEqual(['How to send events'])
  })

  it('wins over a filter: on a site with no visits nothing is hidden by one', () => {
    show({ neverVisited: true, filtered: true, clearFilters: () => {} })
    expect(read().title).toBe('No visitors yet')
    expect(read().actions).toEqual([])
  })
})

describe('a filter is on and nothing matches', () => {
  it('says so and clears every filter from the link', () => {
    const clearFilters = vi.fn()
    show({ filtered: true, clearFilters }, { docs: DOCS })
    expect(read()).toEqual({ title: 'Nothing matches this filter', line: 'Change the filter or clear it to see this block again.', actions: ['Clear filter'] })
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }))
    expect(clearFilters).toHaveBeenCalledTimes(1)
  })

  it('offers no link where the page cannot clear a filter', () => {
    show({ filtered: true })
    expect(read().actions).toEqual([])
  })

  it('never blames the filter in a block the filter does not reach (Outbound)', () => {
    show({ filtered: true, clearFilters: () => {} }, { filterable: false })
    expect(read()).toEqual({ title: 'No events in this range', line: 'Try a longer range.', actions: [] })
  })
})

describe('the kind is switched off for the site', () => {
  it('says so, in place of everything else, with the way to the setting', () => {
    show({ filtered: true, neverVisited: true, clearFilters: () => {} }, { off: OFF, docs: DOCS })
    expect(read()).toEqual({ title: OFF.title, line: OFF.description, actions: ['Open site settings'] })
    const link = screen.getByRole('link', { name: 'Open site settings' })
    expect(link.getAttribute('href')).toBe('/settings/site/general')
  })

  it('tells the settings page WHICH site, as the install banner\'s link does', () => {
    show({}, { off: OFF })
    expect(sessionStorage.getItem('pulse_active_site')).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Open site settings' }))
    expect(sessionStorage.getItem('pulse_active_site')).toBe('site-1')
  })

  it('offers no way to a setting somebody may not change', () => {
    perms.canEdit = false
    show({}, { off: OFF })
    expect(read()).toEqual({ title: OFF.title, line: OFF.description, actions: [] })
  })

  it('is not said when the kind is on', () => {
    show({}, { off: null })
    expect(read().title).toBe('No events in this range')
  })
})

describe('realtime', () => {
  it('reads the one realtime line when the live count is known to be at zero, whatever else is true', () => {
    show({ nobodyLive: true, filtered: true, neverVisited: true, clearFilters: () => {} }, { live: true, off: OFF, docs: DOCS })
    expect(read()).toEqual({ title: 'Nobody on the site in the last 5 minutes.', line: null, actions: [] })
  })

  it('says what the block has none of while somebody is on the site: nobody is not true then', () => {
    // Seen on a live page: a counter at 1 beside a block reading "Nobody on the site in the last 5 minutes."
    show({ nobodyLive: false }, { live: true, docs: DOCS })
    expect(read()).toEqual({ title: 'No events in the last 5 minutes.', line: null, actions: [] })
  })

  it('makes each block\'s line from what it counts, as the range heading is made', () => {
    for (const kind of ['visits', 'page views', 'outbound clicks', 'campaign visits']) {
      const { unmount } = show({}, { live: true, kind })
      expect(read().title).toBe(`No ${kind} in the last 5 minutes.`)
      unmount()
      const calm = show({}, { kind })
      expect(read().title).toBe(`No ${kind} in this range`)
      calm.unmount()
    }
  })

  it('does not say nobody is on the site while the count is not known (no provider): the block\'s own line is true either way', () => {
    render(<CardEmptyState live kind="events" fresh="Events your site sends are counted here." />)
    expect(read()).toEqual({ title: 'No events in the last 5 minutes.', line: null, actions: [] })
  })

  it('keeps realtime ahead of every other state, with somebody on the site too', () => {
    show({ filtered: true, neverVisited: true, clearFilters: () => {} }, { live: true, off: OFF, docs: DOCS })
    expect(read()).toEqual({ title: 'No events in the last 5 minutes.', line: null, actions: [] })
  })

  it('says the same to a public reader', () => {
    show({ nobodyLive: true }, { live: true }, demoScope)
    expect(read().title).toBe('Nobody on the site in the last 5 minutes.')
    cleanup()
    show({}, { live: true }, shareScope)
    expect(read().title).toBe('No events in the last 5 minutes.')
  })
})

describe.each([
  ['the demo', demoScope],
  ['a share link', shareScope],
])('a public view (%s): the reader is not the site\'s owner', (_name, scope) => {
  it('says the heading alone: no advice, no docs link', () => {
    show({}, { docs: DOCS }, scope)
    expect(read()).toEqual({ title: 'No events in this range', line: null, actions: [] })
  })

  it('never says "No visitors yet" or that something is switched off, and never leads to settings', () => {
    show({ neverVisited: true }, { off: OFF, docs: { ...DOCS, whenFresh: true } }, scope)
    expect(read()).toEqual({ title: 'No events in this range', line: null, actions: [] })
  })

  it('lets a reader clear a filter they set themselves', () => {
    const clearFilters = vi.fn()
    show({ filtered: true, clearFilters }, {}, scope)
    expect(read()).toEqual({ title: 'Nothing matches this filter', line: 'Change the filter or clear it to see this block again.', actions: ['Clear filter'] })
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }))
    expect(clearFilters).toHaveBeenCalledTimes(1)
  })
})

describe('how it is drawn', () => {
  it('fills its block\'s body and sits in its middle, so an empty block is no taller than a full one', () => {
    const { container } = show({})
    const box = container.firstElementChild as HTMLElement
    for (const c of ['h-full', 'py-6', 'justify-center']) expect(box.className.split(' '), c).toContain(c)
    expect(box.className).not.toContain('py-12')
  })

  it('lets the chart place it in its own box', () => {
    const { container } = show({}, { className: 'py-0' })
    const box = container.firstElementChild as HTMLElement
    expect(box.className.split(' ')).toContain('py-0')
    expect(box.className.split(' ')).not.toContain('py-6')
  })

  it('draws every link as a quiet text link, never the filled orange button', () => {
    show({ filtered: true, clearFilters: () => {} })
    const link = screen.getByRole('button', { name: 'Clear filter' })
    expect(link.className).toContain('text-brand-ink')
    expect(link.className).not.toContain('bg-brand-orange')
  })
})

describe('no dashboard block asks for the install any more', () => {
  const ROOT = path.resolve(__dirname, '../../..')
  const dir = path.join(ROOT, 'components/dashboard')
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.tsx'))
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1')

  it('the install prompt lives in the banner and nowhere else on the dashboard', () => {
    const offenders = files.filter((name) => name !== 'InstallBanner.tsx' && /Install tracking script/.test(strip(fs.readFileSync(path.join(dir, name), 'utf8'))))
    // A scan that reads nothing proves nothing: the dashboard has dozens of components.
    expect(files.length).toBeGreaterThan(20)
    expect(offenders).toEqual([])
  })

  it('every empty block is written with the new words: what it counts, and what it will show', () => {
    const calls: string[] = []
    const bad: string[] = []
    for (const name of files) {
      const src = strip(fs.readFileSync(path.join(dir, name), 'utf8'))
      // A call runs to the `/>` on a line of its own: its icon is an element too, and closes earlier on its line.
      for (const m of src.matchAll(/<CardEmptyState\b[\s\S]*?\n\s*\/>/g)) {
        calls.push(name)
        if (!/\bkind=/.test(m[0]) || !/\bfresh=/.test(m[0]) || /\b(title|description|action|publicTitle)=/.test(m[0])) bad.push(name)
      }
    }
    // Sources 3, Locations 2, Technology, Pages, Outbound, the Pages block's Outbound tab, Events, scroll depth,
    // and the chart.
    expect(calls.length).toBe(12)
    expect(bad).toEqual([])
  })

  it('every block hands realtime to its empty state, the chart included', () => {
    // A block that forgets it says "Try a longer range." in a window that is always the last five minutes, beside
    // blocks that read their realtime line. The scroll depth card did, until this was written.
    const without: string[] = []
    let calls = 0
    for (const name of files) {
      const src = strip(fs.readFileSync(path.join(dir, name), 'utf8'))
      for (const m of src.matchAll(/<CardEmptyState\b[\s\S]*?\n\s*\/>/g)) {
        calls++
        if (!/\blive=/.test(m[0])) without.push(name)
      }
    }
    expect(calls).toBe(12)
    expect(without).toEqual([])
    // And nothing on the dashboard writes the realtime line by hand: it is said in one place, on a known zero.
    const byHand = files.filter((name) => name !== 'CardEmptyState.tsx' && /REALTIME_EMPTY_LINE/.test(strip(fs.readFileSync(path.join(dir, name), 'utf8'))))
    expect(byHand).toEqual([])
  })

  it('none of the old lines is left', () => {
    const OLD = ["Nobody's linked to you yet", 'Waiting for page views', "Your first visitor hasn't arrived", 'No devices detected yet', 'come alive', 'light up', 'flows in from around the world', 'meaningful geographic data', 'No UTM data yet', 'No channel data yet', 'No outbound clicks yet', 'No events tracked yet', 'No scrolls recorded yet']
    const left: string[] = []
    for (const name of files) {
      const src = strip(fs.readFileSync(path.join(dir, name), 'utf8'))
      for (const line of OLD) if (src.includes(line)) left.push(`${name}: ${line}`)
    }
    expect(left).toEqual([])
  })
})
