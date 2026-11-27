import { describe, expect, it, beforeEach, vi } from 'vitest'
import { toast } from '@ciphera-net/facet'
import type { DeferredAction } from '@ciphera-net/facet-hold'
import { ApiError } from '@/lib/api/client'
import { layoutConflict, type TeamLayout } from '@/lib/api/dashboardLayout'
import type { GoalCountStat } from '@/lib/api/stats'
import { DEFAULT_LAYOUT, deferDone, isDefaultLayout, widgets, widgetsMode, useWidgetsState, type Placed } from '../store'
import { eventFor } from '../EventTile'
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
    expect(isDefaultLayout(DEFAULT_LAYOUT.map((p, i) => (i === 1 ? { ...p, event: 'signup' } : p)))).toBe(false)
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
    widgets.startEdit('site-1', DEFAULT_LAYOUT, '')
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
    widgets.startEdit('site-1', [], '')
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
    widgets.startEdit('site-1', [{ id: 'live', size: 's' }], '')
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

// The state as a page reads it, outside React.
const now = () => renderHook(() => useWidgetsState()).result.current

describe('Done waits on the Undo bar (review I4, owner W21)', () => {
  const site = 'site-1'
  const moved: Placed[] = [{ id: 'sources', size: 'l' }, { id: 'chart', size: 'xl' }]
  let action: DeferredAction | null = null
  const defer = (a: DeferredAction) => { action = a }
  const io = () => ({ save: vi.fn(async (): Promise<TeamLayout> => ({ layout: moved, revision: 'r2' })), landed: vi.fn(async () => undefined) })
  const arrange = (on = site) => { widgets.startEdit(on, [{ id: 'chart', size: 'xl' }, { id: 'sources', size: 'l' }], 'r1'); widgets.move(0, 1) }
  beforeEach(() => { widgets.cancelEdit(); action = null; vi.restoreAllMocks() })

  it('closes Customize at once and draws the draft while the bar counts down; Undo sends nothing', () => {
    const w = io()
    arrange()
    deferDone(site, defer, w)
    expect(now().editing).toBeNull()
    expect(now().pending).toEqual({ siteId: site, layout: moved })
    expect(action?.message).toBe('Layout saved for your team')
    action?.onUndo?.()
    expect(now().pending).toBeNull()
    expect(w.save).not.toHaveBeenCalled()
  })

  it('sends the draft with the revision Customize started from, in the same tick when the page is left', async () => {
    const w = io()
    arrange()
    deferDone(site, defer, w)
    const sent = action!.commit({ keepalive: true })
    // 🔴 keepalive: the request must start before anything awaits (apiRequest's team-gate note).
    expect(w.save).toHaveBeenCalledWith(moved, { base: 'r1', keepalive: true })
    await action!.onCommitted?.(await sent)
    expect(w.landed).toHaveBeenCalledWith({ layout: moved, revision: 'r2' })
    expect(now().pending).toBeNull()
  })

  it('opens Customize again on the draft with theirs when someone else saved meanwhile (I3)', () => {
    const errorToast = vi.spyOn(toast, 'error').mockImplementation(() => '')
    arrange()
    deferDone(site, defer, io())
    const theirs = [{ id: 'pages', size: 'l' }]
    action!.onError?.(new ApiError('Someone else changed this layout.', 409, { code: 'layout_changed', layout: theirs, revision: 'r9' }))
    const s = now()
    expect(s.editing).toBe(site)
    expect(s.draft).toEqual(moved)
    expect(s.conflict).toEqual({ layout: theirs, revision: 'r9' })
    expect(s.base).toBe('r1')
    expect(s.pending).toBeNull()
    expect(errorToast).not.toHaveBeenCalled()
  })

  it('opens Customize again with the reason on any other failure, and says so wherever the reader is', () => {
    const errorToast = vi.spyOn(toast, 'error').mockImplementation(() => '')
    arrange()
    deferDone(site, defer, io())
    action!.onError?.(new ApiError('Server error', 500))
    expect(now().editing).toBe(site)
    expect(now().error).toMatch(/could not be saved/)
    expect(now().conflict).toBeNull()
    expect(errorToast).toHaveBeenCalledOnce()
  })

  it('leaves another site\'s Customize alone when the save fails meanwhile', () => {
    vi.spyOn(toast, 'error').mockImplementation(() => '')
    arrange()
    deferDone(site, defer, io())
    widgets.startEdit('site-2', [{ id: 'live', size: 's' }], '')
    action!.onError?.(new ApiError('Server error', 500))
    expect(now().editing).toBe('site-2')
    expect(now().draft).toEqual([{ id: 'live', size: 's' }])
    expect(now().error).toBeNull()
  })

  it('moves a Customize opened while the save waited onto the revision the save made', async () => {
    arrange()
    deferDone(site, defer, io())
    widgets.startEdit(site, moved, 'r1')
    await action!.onCommitted?.({ layout: moved, revision: 'r2' })
    expect(now().base).toBe('r2')
  })
})

describe('a save someone else beat (I3)', () => {
  it('reads theirs from the 409, and nothing from any other refusal', () => {
    const layout = [{ id: 'chart', size: 'l' }]
    expect(layoutConflict(new ApiError('x', 409, { code: 'layout_changed', layout, revision: '17' }))).toEqual({ layout, revision: '17' })
    expect(layoutConflict(new ApiError('x', 409, { code: 'layout_changed', layout: null, revision: '' }))).toEqual({ layout: null, revision: '' })
    expect(layoutConflict(new ApiError('x', 409, { code: 'something_else' }))).toBeNull()
    expect(layoutConflict(new ApiError('x', 500, { code: 'layout_changed' }))).toBeNull()
    expect(layoutConflict(new Error('offline'))).toBeNull()
  })
})

describe('an event tile', () => {
  const events = [{ event_name: 'signup', count: 5, visitors: 4 }, { event_name: 'purchase', count: 9, visitors: 7 }] as GoalCountStat[]
  it('shows its own event, and with none of it in the range shows it at zero under its own name', () => {
    expect(eventFor(events, 'signup')?.count).toBe(5)
    expect(eventFor(events, 'newsletter')).toMatchObject({ event_name: 'newsletter', count: 0, visitors: 0 })
  })
  it('starts on the event fired most when it names none, and on nothing when the site has none', () => {
    expect(eventFor(events, undefined)?.event_name).toBe('purchase')
    expect(eventFor([], undefined)).toBeNull()
  })
})

