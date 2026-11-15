import { describe, it, expect } from 'vitest'
import {
  eventLabels,
  eventName,
  isAutomatic,
  orderKeys,
  people,
  percent,
  propertyName,
  propertyValueRows,
  readPropertyValue,
  splitEvents,
} from '@/lib/dashboard/events'
import type { GoalCountStat } from '@/lib/api/stats'

// The Events block's names and numbers (lib/dashboard/events.ts), pure. What is pinned: the automatic events are
// told from the site's own and named; a goal is a row under its own name (R37); a list never draws a name twice,
// and never merges two events; the share's rounding; the rows of a property's values merge what reads the same.

const row = (event_name: string, count: number, visitors?: number, display_name?: string | null): GoalCountStat => ({ event_name, count, visitors, display_name })

describe('which events Pulse writes by itself, and what each is called', () => {
  it('names the tracker\'s, the server\'s and the interactions script\'s events, and any new name under `pulse_`', () => {
    expect(['outbound_link', 'file_download', '404', 'pulse_click', 'pulse_copy', 'pulse_form_submit', 'pulse_scroll_new'].every(isAutomatic)).toBe(true)
    expect(['signup', 'add_to_cart', 'pulsed', 'outbound'].some(isAutomatic)).toBe(false)
    expect(eventName(row('outbound_link', 1))).toBe('Outbound clicks')
    expect(eventName(row('404', 1))).toBe('Pages not found')
    expect(eventName(row('pulse_click', 1))).toBe('Clicks')
  })

  it('makes a stored name readable, and draws the cap\'s fold row as a word', () => {
    expect(eventName(row('add_to_cart', 1))).toBe('Add to cart')
    expect(eventName(row('(other)', 1))).toBe('Other')
  })

  it('a goal is the event under the name it was given (R37), and an empty name is no name', () => {
    expect(eventName(row('signup', 1, 1, 'Signed up'))).toBe('Signed up')
    expect(eventName(row('outbound_link', 1, 1, 'Partner clicks'))).toBe('Partner clicks')
    expect(eventName(row('signup', 1, 1, '  '))).toBe('Signup')
    expect(eventName(row('signup', 1, 1, null))).toBe('Signup')
  })

  it('answers a name that is a property of every object as a name, never with what the object holds', () => {
    for (const name of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(isAutomatic(name), name).toBe(false)
      expect(typeof eventName(row(name, 1)), name).toBe('string')
      expect(typeof propertyName('outbound_link', name), name).toBe('string')
    }
    expect(eventName(row('constructor', 1))).toBe('Constructor')
  })
})

describe('a list draws a name once, and a row stays one event', () => {
  it('two events whose names read the same each read their stored name', () => {
    const labels = eventLabels([row('Signup', 9), row('signup', 4), row('purchase', 2)])
    expect([...labels.entries()]).toEqual([['Signup', 'Signup'], ['signup', 'signup'], ['purchase', 'Purchase']])
  })

  it('a goal named like another event\'s stored name, and the fold row beside an event called "other"', () => {
    const labels = eventLabels([row('register', 9, 9, 'Sign up'), row('sign_up', 4), row('(other)', 3), row('other', 1)])
    expect(new Set(labels.values()).size).toBe(4)
    expect(labels.get('register')).toBe('register')
    expect(labels.get('sign_up')).toBe('sign_up')
    expect(labels.get('(other)')).toBe('(other)')
    expect(labels.get('other')).toBe('other')
  })

  it('a stored name that falls back onto another row\'s name sends that row to its stored name too', () => {
    // "Signup" and "signup" read alike and fall back; the goal named "signup" then reads like the second.
    const labels = eventLabels([row('Signup', 9), row('signup', 4), row('register', 2, 2, 'signup')])
    expect(new Set(labels.values()).size).toBe(3)
    expect(labels.get('register')).toBe('register')
  })

  it('leaves a list with nothing alike as it reads', () => {
    const labels = eventLabels([row('signup', 9, 9, 'Signed up'), row('add_to_cart', 4)])
    expect([...labels.values()]).toEqual(['Signed up', 'Add to cart'])
  })
})

describe('the two tabs and their order', () => {
  it('splits the site\'s own events from the automatic ones, each by visitors, then events, ties in the server\'s order', () => {
    const { own, automatic } = splitEvents([
      row('outbound_link', 70, 30),
      row('zeta', 10, 10),
      row('signup', 120, 80),
      row('add_to_cart', 300, 60),
      row('alpha', 10, 10),
      row('beta', 12, 10),
      row('404', 5, 5),
    ])
    expect(own.map((r) => r.event_name)).toEqual(['signup', 'add_to_cart', 'beta', 'zeta', 'alpha'])
    expect(automatic.map((r) => r.event_name)).toEqual(['outbound_link', '404'])
  })

  it('counts who did it from the server\'s visitors, or from the count where an older answer has none', () => {
    expect(people(row('signup', 12, 7))).toBe(7)
    expect(people(row('signup', 12))).toBe(12)
  })
})

describe('the share a row prints', () => {
  it('one decimal under ten, none from ten, rounding first', () => {
    expect(percent(20, 400)).toBe('5.0%')
    expect(percent(80, 400)).toBe('20%')
    expect(percent(996, 10000)).toBe('10%')
    expect(percent(99, 1000)).toBe('9.9%')
  })

  it('never a nought that rounding made, and nothing over no total', () => {
    expect(percent(0, 400)).toBe('0%')
    expect(percent(1, 4000)).toBe('<0.1%')
    expect(percent(5, 0)).toBeNull()
  })
})

describe('a property\'s name and its order', () => {
  it('gives the tracker\'s own keys a word, and makes a site\'s keys readable', () => {
    expect(propertyName('outbound_link', 'url')).toBe('Link')
    expect(propertyName('outbound_link', 'page_path')).toBe('Page')
    // A site's own event is not the tracker's: its `url` is its own word.
    expect(propertyName('signup', 'url')).toBe('Url')
    expect(propertyName('signup', 'plan_name')).toBe('Plan name')
  })

  it('puts an automatic event\'s keys in reading order, and keeps the server\'s for a site\'s own', () => {
    const keys = [{ key: 'page_path', count: 9 }, { key: 'url', count: 9 }, { key: 'custom', count: 3 }]
    expect(orderKeys('outbound_link', keys).map((k) => k.key)).toEqual(['url', 'page_path', 'custom'])
    expect(orderKeys('signup', keys).map((k) => k.key)).toEqual(['page_path', 'url', 'custom'])
  })
})

describe('the rows of a property\'s values', () => {
  it('reads a link without its scheme, its www. and a closing slash, with its host for the icon', () => {
    expect(readPropertyValue('https://www.Shop.example/cart/')).toEqual({ label: 'Shop.example/cart', host: 'shop.example' })
    expect(readPropertyValue('pro')).toEqual({ label: 'pro', host: null })
    expect(readPropertyValue('https://')).toEqual({ label: 'https://', host: null })
  })

  it('values that read the same are one row with their events added up, ranked again', () => {
    const rows = propertyValueRows([
      { value: 'https://docs.example/start', count: 7 },
      { value: 'https://www.shop.example/cart', count: 6 },
      { value: 'http://shop.example/cart/', count: 3 },
      { value: 'shop.example/cart', count: 2 },
    ])
    expect(rows.map((r) => [r.label, r.count, r.host])).toEqual([
      ['shop.example/cart', 9, 'shop.example'],
      ['docs.example/start', 7, 'docs.example'],
      // A plain value never merges into a link: the link carries its icon.
      ['shop.example/cart', 2, null],
    ])
    expect(rows[0].value).toBe('https://www.shop.example/cart')
    expect(rows[0].values).toEqual(['https://www.shop.example/cart', 'http://shop.example/cart/'])
  })

  it('keeps the server\'s order when nothing reads the same', () => {
    const rows = propertyValueRows([{ value: 'pro', count: 5 }, { value: 'team', count: 5 }, { value: 'free', count: 9 }])
    expect(rows.map((r) => r.value)).toEqual(['pro', 'team', 'free'])
  })
})
