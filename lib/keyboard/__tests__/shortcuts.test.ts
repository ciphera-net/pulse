import { afterEach, describe, expect, it, vi } from 'vitest'
import { PERIOD_PRESETS } from '@/lib/constants/periods'
import {
  CUSTOM_RANGE_KEY,
  FILTER_KEY,
  RANGE_KEYS,
  REALTIME_KEY,
  isPageShortcut,
  keyCap,
  ownsArrows,
  rowForKey,
  somethingIsOpen,
} from '@/lib/keyboard/shortcuts'

vi.mock('@/lib/tour/constants', () => ({ isTourActive: vi.fn(() => false) }))
import { isTourActive } from '@/lib/tour/constants'

afterEach(() => {
  vi.mocked(isTourActive).mockReturnValue(false)
  document.body.innerHTML = ''
})

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  Object.defineProperty(e, 'target', { value: target })
  return e
}

describe('the range keys', () => {
  it('name only rows the menu has, Plausible\'s letters', () => {
    const rows = new Set(PERIOD_PRESETS.map((p) => p.key))
    for (const row of Object.keys(RANGE_KEYS)) expect(rows.has(row)).toBe(true)
    expect(RANGE_KEYS).toEqual({ today: 'd', yesterday: 'e', '7': 'w', '30': 't', '3m': 'n', '12m': 'l', all: 'a', month: 'm', 'last-month': 'p', year: 'y' })
    // Last year has no Plausible letter.
    expect(RANGE_KEYS['last-year']).toBeUndefined()
  })

  it('never share a letter with each other or with the page\'s other keys', () => {
    const letters = [...Object.values(RANGE_KEYS), CUSTOM_RANGE_KEY, REALTIME_KEY, FILTER_KEY, 'g', ',', '?']
    expect(new Set(letters).size).toBe(letters.length)
  })

  it('find their row whatever the case, and nothing for another key', () => {
    expect(rowForKey('w')).toBe('7')
    expect(rowForKey('W')).toBe('7')
    expect(rowForKey('a')).toBe('all')
    expect(rowForKey('f')).toBeNull()
    expect(rowForKey('ArrowLeft')).toBeNull()
  })

  it('show as a capital', () => {
    expect(keyCap('w')).toBe('W')
    expect(keyCap('Esc')).toBe('Esc')
  })
})

describe('isPageShortcut', () => {
  it('takes a bare key on the page', () => {
    expect(isPageShortcut(press('w'))).toBe(true)
    expect(isPageShortcut(press('W', { shiftKey: true }))).toBe(true)
  })

  it('refuses ⌘, Ctrl and Alt, a held key, and a press already handled', () => {
    expect(isPageShortcut(press('w', { metaKey: true }))).toBe(false)
    expect(isPageShortcut(press('w', { ctrlKey: true }))).toBe(false)
    expect(isPageShortcut(press('w', { altKey: true }))).toBe(false)
    expect(isPageShortcut(press('w', { repeat: true }))).toBe(false)
    const handled = press('d')
    handled.preventDefault()
    expect(isPageShortcut(handled)).toBe(false)
  })

  it('refuses a letter typed into a field', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      const el = document.createElement(tag)
      document.body.appendChild(el)
      expect(isPageShortcut(press('w', {}, el))).toBe(false)
    }
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(isPageShortcut(press('w', {}, editable))).toBe(false)
  })

  it('refuses everything while the product tour owns the screen', () => {
    vi.mocked(isTourActive).mockReturnValue(true)
    expect(isPageShortcut(press('w'))).toBe(false)
  })
})

describe('ownsArrows and somethingIsOpen', () => {
  it('finds a control that moves with the arrows itself', () => {
    document.body.innerHTML = '<div data-own-arrows><button id="in">step</button></div><button id="out">x</button>'
    expect(ownsArrows(document.getElementById('in'))).toBe(true)
    expect(ownsArrows(document.getElementById('out'))).toBe(false)
    expect(ownsArrows(null)).toBe(false)
  })

  it('sees an open menu, panel or dialog', () => {
    document.body.innerHTML = '<button aria-expanded="false">menu</button>'
    expect(somethingIsOpen()).toBe(false)
    document.body.innerHTML = '<button aria-expanded="true">menu</button>'
    expect(somethingIsOpen()).toBe(true)
    document.body.innerHTML = '<div role="dialog"></div>'
    expect(somethingIsOpen()).toBe(true)
  })
})
