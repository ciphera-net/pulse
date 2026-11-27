import { describe, expect, it, beforeEach } from 'vitest'
import { DEFAULT_LAYOUT, isDefaultLayout, widgets, widgetsMode, useWidgetsState, type Placed } from '../store'
import { WIDGETS } from '../registry'
import { VIEWS } from '../compact'
import { KEY_NUMBERS } from '../keyNumbers'
import { drawable } from '../WidgetsFrame'
import { MOVE_TRAVEL_PX, mayReorder } from '../WidgetGrid'
import { renderHook } from '@testing-library/react'

// The server checks a layout's shape (pulse-backend internal/api/dashboard_layout.go): these are its patterns, so a
// layout this dashboard builds is never refused.
const SERVER_ID = /^[a-z][a-z0-9-]{0,31}(:[1-9][0-9]{0,2})?$/
const SERVER_VIEW = /^[a-z][a-z0-9_]{0,31}$/
const SERVER_SIZES = ['s', 'm', 'l', 'xl', 'row']

const draft = () => renderHook(() => useWidgetsState()).result.current.draft

describe('the registry', () => {
  it('names every widget, view and size in the shape the server stores', () => {
    for (const w of WIDGETS) {
      expect(w.id, w.id).toMatch(SERVER_ID)
      if (w.multi) expect(`${w.id}:12`, w.id).toMatch(SERVER_ID)
      for (const size of w.sizes) expect(SERVER_SIZES).toContain(size)
      expect(w.sizes).toContain(w.size)
    }
    for (const views of Object.values(VIEWS)) for (const v of views) expect(v.value).toMatch(SERVER_VIEW)
    for (const k of KEY_NUMBERS) expect(k.value).toMatch(SERVER_VIEW)
  })

  it('draws today\'s dashboard as the default layout', () => {
    expect(drawable(DEFAULT_LAYOUT)).toEqual(DEFAULT_LAYOUT)
  })
})

describe('a saved layout', () => {
  it('drops a widget this build does not know, a second copy of a single widget and a repeated id', () => {
    const saved: Placed[] = [
      { id: 'chart', size: 'xl' }, { id: 'retired-widget', size: 's' }, { id: 'performance', size: 's' }, { id: 'funnels:2', size: 's' },
      { id: 'numbers:2', size: 'row' }, { id: 'chart', size: 'l' },
    ]
    // Performance draws at Wide only, so its Small falls back to Wide (F2): retiring a size never removes a widget.
    expect(drawable(saved)).toEqual([{ id: 'chart', size: 'xl' }, { id: 'performance', size: 'm' }, { id: 'funnels:2', size: 's' }])
  })

  it('is the standard dashboard when it is today\'s order and sizes, with nothing chosen', () => {
    expect(isDefaultLayout(DEFAULT_LAYOUT.map((p) => ({ ...p })))).toBe(true)
    expect(isDefaultLayout([...DEFAULT_LAYOUT].reverse())).toBe(false)
    expect(isDefaultLayout(DEFAULT_LAYOUT.map((p, i) => (i === 1 ? { ...p, view: 'channels' } : p)))).toBe(false)
  })
})

describe('Customize', () => {
  beforeEach(() => widgets.cancelEdit())

  it('changes nothing outside Customize: the layout is the team\'s, and only Done saves it', () => {
    widgets.remove('chart')
    widgets.add('live', 's')
    expect(draft()).toBeNull()
  })

  it('edits a copy, moves by press, resizes and removes', () => {
    widgets.startEdit(DEFAULT_LAYOUT)
    widgets.move(0, 1)
    expect(draft()?.slice(0, 2).map((p) => p.id)).toEqual(['sources', 'chart'])
    widgets.setSize('chart', 'm')
    expect(draft()?.find((p) => p.id === 'chart')?.size).toBe('m')
    widgets.remove('chart')
    expect(draft()?.some((p) => p.id === 'chart')).toBe(false)
    expect(DEFAULT_LAYOUT[0]).toEqual({ id: 'chart', size: 'xl' })
    widgets.cancelEdit()
    expect(draft()).toBeNull()
  })

  it('adds a widget once, and a Funnels widget as often as asked, each its own instance', () => {
    widgets.startEdit([])
    widgets.add('live', 's')
    widgets.add('live', 's')
    widgets.add('funnels', 's', { multi: true })
    widgets.add('funnels', 'm', { multi: true, funnel: '5b0f0c1e-2c55-4a59-9a43-0a7f6f1d2e3c' })
    expect(draft()?.map((p) => p.id)).toEqual(['live', 'funnels', 'funnels:2'])
    expect(draft()?.[2].funnel).toBe('5b0f0c1e-2c55-4a59-9a43-0a7f6f1d2e3c')
    widgets.setFunnel('funnels:2', '')
    expect(draft()?.[2]).toEqual({ id: 'funnels:2', size: 'm' })
  })

  it('resets the draft to today\'s dashboard', () => {
    widgets.startEdit([{ id: 'live', size: 's' }])
    widgets.reset()
    expect(isDefaultLayout(draft() ?? [])).toBe(true)
  })
})

describe('which frame a page draws', () => {
  const saved: Placed[] = [{ id: 'chart', size: 'l' }]
  it.each([
    ['a member, /me on its way', { isPublic: false, flag: null, answered: false, saved: null }, { on: false, ready: true }],
    ['a member of a team not in the beta', { isPublic: false, flag: false, answered: false, saved: null }, { on: false, ready: true }],
    ['a member of a beta team, the layout on its way', { isPublic: false, flag: true, answered: false, saved: null }, { on: true, ready: false }],
    ['a member of a beta team with no layout saved', { isPublic: false, flag: true, answered: true, saved: null }, { on: true, ready: true }],
    ['a share link, the layout on its way', { isPublic: true, flag: false, answered: false, saved: null }, { on: false, ready: false }],
    ['a share link of a team with no layout, or not in the beta', { isPublic: true, flag: false, answered: true, saved: null }, { on: false, ready: true }],
    ['a share link of a team with a layout', { isPublic: true, flag: false, answered: true, saved }, { on: true, ready: true }],
  ] as const)('%s', (_name, input, want) => {
    expect(widgetsMode({ ...input, saved: input.saved as Placed[] | null })).toEqual(want)
  })
})

describe('a drag never loops (the black page of 24-11-2026)', () => {
  const base = { activeId: 'chart', pushedId: null as string | null, lastMoveAt: null as { x: number; y: number } | null }
  it('moves on the first pass over another widget', () => {
    expect(mayReorder({ ...base, overId: 'pages', delta: { x: 0, y: 40 } })).toBe(true)
  })
  it('never moves over itself, or back over the widget it just pushed aside', () => {
    expect(mayReorder({ ...base, overId: 'chart', delta: { x: 0, y: 40 } })).toBe(false)
    expect(mayReorder({ ...base, overId: 'pages', pushedId: 'pages', delta: { x: 0, y: 400 } })).toBe(false)
  })
  it('does not move again under a still pointer, even when the layout put another widget under it', () => {
    // The move just made at this delta put Sources under the pointer; the pointer has not moved.
    expect(mayReorder({ ...base, overId: 'sources', pushedId: 'pages', lastMoveAt: { x: 0, y: 40 }, delta: { x: 0, y: 40 } })).toBe(false)
    expect(mayReorder({ ...base, overId: 'sources', pushedId: 'pages', lastMoveAt: { x: 0, y: 40 }, delta: { x: 10, y: 50 } })).toBe(false)
  })
  it('moves again once the pointer has travelled far enough', () => {
    expect(mayReorder({ ...base, overId: 'sources', pushedId: 'pages', lastMoveAt: { x: 0, y: 40 }, delta: { x: 0, y: 40 + MOVE_TRAVEL_PX } })).toBe(true)
  })
})
