import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'

/**
 * The site owner's two links on Privacy (script v1.8.0): ?pulse-ignore=on stops counting this browser on the site,
 * ?pulse-ignore=off counts it again, and each does only that. Until 1.8.0 every load with `pulse-ignore` ANYWHERE
 * in its query flipped the flag, so a reload, a bookmark or a restored tab undid the choice, and a campaign tag that
 * merely contained the words flipped it too.
 *
 * These run the REAL scripts in a fresh jsdom window per test: they count the requests the core sends, read what it
 * leaves in localStorage, and read the note it asks for (script.note.js, run on its own at the bottom).
 * Audit: Pulse/docs/audits/06-11-2026-exclude-own-visits.md
 */

const ROOT = join(__dirname, '..')
const SCRIPT = readFileSync(join(ROOT, 'tracker/script.js'), 'utf8')
const NOTE = readFileSync(join(ROOT, 'tracker/script.note.js'), 'utf8')

let dom: JSDOM
let win: any
let doc: Document
let sent: any[] = []

type Options = { gpc?: boolean; refuse?: boolean; flag?: boolean }

function newWindow(query: string, { gpc = false, refuse = false, flag = false }: Options = {}) {
  dom = new JSDOM('<!doctype html><html><head></head><body><h1>Home</h1></body></html>', {
    url: 'https://owner-site.invalid/' + query,
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  })
  win = dom.window
  doc = win.document
  win.setTimeout = globalThis.setTimeout
  win.clearTimeout = globalThis.clearTimeout
  win.setInterval = globalThis.setInterval
  win.clearInterval = globalThis.clearInterval
  win.Date = globalThis.Date
  win.fetch = vi.fn(async (u: string, init: any) => {
    sent.push({ url: u, body: init?.body ? JSON.parse(init.body) : null })
    return { json: async () => ({ status: 'queued', id: 'evt-1' }) }
  })
  Object.defineProperty(win.navigator, 'sendBeacon', { configurable: true, value: vi.fn(() => true) })
  Object.defineProperty(win.navigator, 'globalPrivacyControl', { configurable: true, value: gpc ? true : undefined })
  Object.defineProperty(win.navigator, 'webdriver', { configurable: true, value: false })
  // A browser that kept the owner's earlier choice (the flag as 1.7 and 1.8 both write it).
  if (flag) win.localStorage.setItem('pulse_ignore', 'true')
  if (refuse) {
    const refuseWrite = () => {
      throw new win.DOMException('The quota has been exceeded.', 'QuotaExceededError')
    }
    win.Storage.prototype.setItem = refuseWrite
    win.Storage.prototype.removeItem = refuseWrite
  }
}

function installScript(attrs: Record<string, string> = {}) {
  const tag = doc.createElement('script')
  tag.setAttribute('data-domain', 'owner-site.invalid')
  tag.setAttribute('data-api', 'http://api.invalid')
  for (const [k, v] of Object.entries(attrs)) tag.setAttribute(k, v)
  doc.head.appendChild(tag)
  win.eval(SCRIPT)
}

async function flush(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms)
}

const pageviews = () => sent.filter((r) => r.url.endsWith('/api/v1/events') && r.body && !r.body.name)
const flag = () => win.localStorage.getItem('pulse_ignore')
const notes = () => [...doc.querySelectorAll('script[data-note]')] as HTMLScriptElement[]

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-06T12:00:00Z'))
  sent = []
})

afterEach(() => {
  vi.useRealTimers()
  try {
    dom.window.close()
  } catch {}
})

describe('Stop counting me (?pulse-ignore=on)', () => {
  it('sets the flag, sends nothing, and asks for the note', async () => {
    newWindow('?pulse-ignore=on')
    installScript()
    await flush(60_000)
    expect(flag()).toBe('true')
    expect(sent).toHaveLength(0)
    expect(notes().map((n) => n.getAttribute('data-note'))).toEqual(['on'])
  })

  it('opened again (a reload, a bookmark, a restored tab), it keeps counting off: 1.7 flipped it back', async () => {
    newWindow('?pulse-ignore=on', { flag: true })
    installScript()
    await flush(60_000)
    expect(flag()).toBe('true')
    expect(sent).toHaveLength(0)
    expect(notes().map((n) => n.getAttribute('data-note'))).toEqual(['on'])
  })

  it('the link before 1.8.0, a bare ?pulse-ignore, also stops counting, every time', async () => {
    newWindow('?pulse-ignore', { flag: true })
    installScript()
    await flush(60_000)
    expect(flag()).toBe('true')
    expect(sent).toHaveLength(0)
  })

  it('a later plain load of the site sends nothing', async () => {
    newWindow('', { flag: true })
    installScript()
    await flush(60_000)
    expect(sent).toHaveLength(0)
    expect(notes()).toHaveLength(0)
  })
})

describe('Count me again (?pulse-ignore=off)', () => {
  it('clears the flag, counts this visit, and asks for the note', async () => {
    newWindow('?pulse-ignore=off', { flag: true })
    installScript()
    await flush()
    expect(flag()).toBeNull()
    expect(pageviews()).toHaveLength(1)
    expect(notes().map((n) => n.getAttribute('data-note'))).toEqual(['off'])
  })

  it('opened again, it stays counting: 1.7 flipped it off', async () => {
    newWindow('?pulse-ignore=off')
    installScript()
    await flush()
    expect(flag()).toBeNull()
    expect(pageviews()).toHaveLength(1)
  })
})

describe('only the parameter itself, with a value it knows', () => {
  it.each([['?pulse-ignore=maybe'], ['?pulse-ignore=true'], ['?utm_campaign=pulse-ignore-test'], ['?q=pulse-ignore']])(
    '%s changes nothing and says nothing',
    async (query) => {
      newWindow(query)
      installScript()
      await flush()
      expect(flag()).toBeNull()
      expect(pageviews()).toHaveLength(1)
      expect(notes()).toHaveLength(0)
    },
  )

  it('an unknown value leaves a set flag alone too', async () => {
    newWindow('?pulse-ignore=maybe', { flag: true })
    installScript()
    await flush(60_000)
    expect(flag()).toBe('true')
    expect(sent).toHaveLength(0)
  })
})

describe('nothing fails silently', () => {
  it('a browser that refuses the write is told so, and its visit counts', async () => {
    newWindow('?pulse-ignore=on', { refuse: true })
    installScript()
    await flush()
    expect(pageviews()).toHaveLength(1)
    expect(notes().map((n) => n.getAttribute('data-note'))).toEqual(['refused'])
  })

  it('Count me again in such a browser says counted, which it is', async () => {
    newWindow('?pulse-ignore=off', { refuse: true })
    installScript()
    await flush()
    expect(pageviews()).toHaveLength(1)
    expect(notes().map((n) => n.getAttribute('data-note'))).toEqual(['off'])
  })

  it('a browser sending Global Privacy Control is told why, and its storage stays untouched', async () => {
    newWindow('?pulse-ignore=on', { gpc: true })
    installScript()
    await flush(60_000)
    expect(flag()).toBeNull()
    expect(sent).toHaveLength(0)
    expect(notes().map((n) => n.getAttribute('data-note'))).toEqual(['signal'])
  })

  it('a GPC browser opening the site plainly is asked for no note', async () => {
    newWindow('', { gpc: true })
    installScript()
    await flush(60_000)
    expect(notes()).toHaveLength(0)
  })
})

describe('where the note comes from', () => {
  it('beside the script that asked for it, a pinned version included', async () => {
    newWindow('?pulse-ignore=on')
    installScript({ src: 'https://js.ciphera.net/v1.8.0/script.js' })
    await flush()
    expect(notes()[0].src).toBe('https://js.ciphera.net/v1.8.0/script.note.js')
  })

  it('from js.ciphera.net when the tag has no address (an inline or tag-manager install)', async () => {
    newWindow('?pulse-ignore=on')
    installScript()
    await flush()
    expect(notes()[0].src).toBe('https://js.ciphera.net/script.note.js')
  })
})

describe('script.note.js', () => {
  function runNote(state: string | null) {
    newWindow('')
    const tag = doc.createElement('script')
    if (state !== null) tag.setAttribute('data-note', state)
    doc.head.appendChild(tag)
    Object.defineProperty(doc, 'currentScript', { configurable: true, get: () => tag })
    win.eval(NOTE)
  }
  const box = () => doc.querySelector('pulse-note')?.shadowRoot?.querySelector('[role="status"]') as HTMLElement | null

  it.each([
    ['on', "Pulse won't count your visits to owner-site.invalid in this browser.", 'rgb(138, 138, 138)'],
    ['off', 'Pulse counts your visits to owner-site.invalid in this browser again.', 'rgb(253, 94, 15)'],
    ['refused', "This browser didn't let Pulse save that, so your visits to owner-site.invalid still count.", 'rgb(253, 94, 15)'],
    ['signal', "This browser asks sites not to track it, so Pulse doesn't count it on owner-site.invalid.", 'rgb(138, 138, 138)'],
  ])('%s: one line, fixed on the page, its dot grey when not counted and orange when counted', (state, text, dot) => {
    runNote(state)
    const b = box()
    expect(b?.textContent).toBe(text)
    expect(b?.style.position).toBe('fixed')
    expect((b?.firstElementChild as HTMLElement).style.backgroundColor).toBe(dot)
  })

  it.each([['maybe'], [null]])('%s draws nothing', (state) => {
    runNote(state)
    expect(doc.querySelector('pulse-note')).toBeNull()
  })

  it('goes after 8 seconds', async () => {
    runNote('on')
    await flush(7_900)
    expect(box()).not.toBeNull()
    await flush(200)
    expect(doc.querySelector('pulse-note')).toBeNull()
  })

  it('goes on a click', () => {
    runNote('on')
    box()!.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    expect(doc.querySelector('pulse-note')).toBeNull()
  })
})
