import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'

/**
 * The tracker takes its options from the SITE'S SETTINGS (script v1.9.0), never from its tag.
 *
 * Every pageview's answer carries them as `c`; the script applies scroll depth, outbound links
 * and downloads from them, loads the interactions companion when they turn interactions on, and
 * publishes them as window.pulse.c for the companion. Until the first answer the defaults apply.
 * The flags earlier tags carry (data-no-scroll, data-no-outbound, data-no-downloads) are ignored.
 * Design: Pulse/docs/plans/14-11-2026-one-tag-settings-from-server-design.md
 *
 * The REAL script in a fresh jsdom window per test; every request it makes is recorded.
 */

const SCRIPT = readFileSync(join(__dirname, '..', 'tracker/script.js'), 'utf8')

const defaults = {
  scroll: true, outbound: true, downloads: true, interactions: false,
  clicks: true, copy: true, forms: true, respect_dnt: true, respect_gpc: true,
}

let dom: JSDOM
let win: any
let doc: Document
let events: any[] = []
let beacons: any[] = []
/** The settings the next pageview answers with. */
let answer: Record<string, unknown> = defaults
let nextId = 1

function newWindow() {
  dom = new JSDOM('<!doctype html><html><head></head><body><h1>Home</h1></body></html>', {
    url: 'http://smoke-test.invalid/',
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
  win.fetch = vi.fn(async (url: string, init: any) => {
    const body = init?.body ? JSON.parse(init.body) : null
    if (url.endsWith('/api/v1/events')) {
      events.push(body)
      const c = answer
      return { json: async () => ({ status: 'queued', id: `evt-${nextId++}`, c }) }
    }
    if (url.endsWith('/api/v1/engagement')) beacons.push(body)
    return { json: async () => ({}) }
  })
  win.Blob = class CapturedBlob {
    parts: any[]
    constructor(parts: any[]) {
      this.parts = parts
    }
  }
  Object.defineProperty(win.navigator, 'sendBeacon', {
    configurable: true,
    value: vi.fn((_url: string, blob: any) => {
      beacons.push(JSON.parse(String(blob.parts[0])))
      return true
    }),
  })
}

function installScript(attrs: Record<string, string> = {}) {
  const tag = doc.createElement('script')
  tag.setAttribute('data-domain', 'smoke-test.invalid')
  tag.setAttribute('data-api', 'http://api.invalid')
  tag.setAttribute('src', 'https://js.ciphera.net/script.js')
  for (const [k, v] of Object.entries(attrs)) tag.setAttribute(k, v)
  doc.head.appendChild(tag)
  win.eval(SCRIPT)
}

async function flush(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms)
}

function click(href: string, extra = '') {
  doc.body.insertAdjacentHTML('beforeend', `<a href="${href}" ${extra}>link</a>`)
  const links = doc.querySelectorAll('a')
  ;(links[links.length - 1] as HTMLAnchorElement).dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }))
}

const named = (name: string) => events.filter((e) => e.name === name)
const companions = () => [...doc.querySelectorAll('script[src$="script.interactions.js"]')] as HTMLScriptElement[]

/** Scroll, then let the early engagement beacon go out, and return the latest one. */
async function scrolledBeacon() {
  win.dispatchEvent(new win.Event('scroll'))
  await flush(4000)
  expect(beacons.length).toBeGreaterThan(0)
  return beacons[beacons.length - 1]
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-14T15:00:00Z'))
  events = []
  beacons = []
  answer = defaults
  nextId = 1
  newWindow()
})

afterEach(async () => {
  await flush(0)
  vi.useRealTimers()
  win = null
  doc = null as any
})

describe('scroll depth', () => {
  it('is sent when the site has it on', async () => {
    installScript()
    await flush()
    expect((await scrolledBeacon()).scroll_depth).toBe(100)
  })

  it('is withheld when the site switches it off', async () => {
    answer = { ...defaults, scroll: false }
    installScript()
    await flush()
    expect((await scrolledBeacon()).scroll_depth).toBeUndefined()
  })

  it('still counts as evidence of a person when withheld: the beacon goes out', async () => {
    answer = { ...defaults, scroll: false }
    installScript()
    await flush()
    const b = await scrolledBeacon()
    expect(b.event_id).toBe('evt-1')
  })
})

describe('outbound links and downloads', () => {
  it('both are recorded on a site with them on', async () => {
    installScript()
    await flush()
    click('https://elsewhere.invalid/page')
    click('/files/report.pdf')
    expect(named('outbound_link')).toHaveLength(1)
    expect(named('file_download')).toHaveLength(1)
  })

  it('outbound off sends no outbound_link, and downloads still go', async () => {
    answer = { ...defaults, outbound: false }
    installScript()
    await flush()
    click('https://elsewhere.invalid/page')
    click('/files/report.pdf')
    expect(named('outbound_link')).toHaveLength(0)
    expect(named('file_download')).toHaveLength(1)
  })

  it('downloads off sends no file_download for a file on the site', async () => {
    answer = { ...defaults, downloads: false }
    installScript()
    await flush()
    click('/files/report.pdf')
    click('https://elsewhere.invalid/page')
    expect(named('file_download')).toHaveLength(0)
    expect(named('outbound_link')).toHaveLength(1)
  })

  it('until the first answer arrives the defaults apply', async () => {
    answer = { ...defaults, outbound: false }
    installScript()
    click('https://elsewhere.invalid/before-the-answer')
    expect(named('outbound_link')).toHaveLength(1)
    await flush()
    click('https://elsewhere.invalid/after-the-answer')
    expect(named('outbound_link')).toHaveLength(1)
  })

  it('a later pageview’s answer applies a change made in the dashboard', async () => {
    installScript()
    await flush()
    answer = { ...defaults, outbound: false }
    win.history.pushState({}, '', '/next')
    await flush()
    click('https://elsewhere.invalid/page')
    expect(named('outbound_link')).toHaveLength(0)
  })
})

describe('the old tag flags are ignored', () => {
  it('data-no-outbound, data-no-downloads and data-no-scroll on the tag change nothing', async () => {
    installScript({ 'data-no-outbound': '', 'data-no-downloads': '', 'data-no-scroll': '' })
    await flush()
    click('https://elsewhere.invalid/page')
    click('/files/report.pdf')
    expect(named('outbound_link')).toHaveLength(1)
    expect(named('file_download')).toHaveLength(1)
    expect((await scrolledBeacon()).scroll_depth).toBe(100)
  })
})

describe('interactions', () => {
  it('no companion loads while the site has interactions off', async () => {
    installScript()
    await flush()
    expect(companions()).toHaveLength(0)
  })

  it('the companion loads from beside this script once the settings turn interactions on', async () => {
    answer = { ...defaults, interactions: true }
    installScript()
    await flush()
    expect(companions().map((s) => s.src)).toEqual(['https://js.ciphera.net/script.interactions.js'])
    // * It carries no flags of its own: it reads the settings the core publishes.
    expect([...companions()[0].attributes].map((a) => a.name)).toEqual(['src'])
  })

  it('loads once, however many pageviews follow', async () => {
    answer = { ...defaults, interactions: true }
    installScript()
    await flush()
    win.history.pushState({}, '', '/second')
    await flush()
    win.history.pushState({}, '', '/third')
    await flush()
    expect(events.filter((e) => !e.name)).toHaveLength(3)
    expect(companions()).toHaveLength(1)
  })

  it('the settings are published as window.pulse.c for the companion', async () => {
    answer = { ...defaults, interactions: true, copy: false }
    installScript()
    await flush()
    expect(win.pulse.c).toEqual(answer)
  })

  it('carries this tag’s nonce, for a CSP that requires one', async () => {
    answer = { ...defaults, interactions: true }
    const tag = doc.createElement('script')
    tag.setAttribute('data-domain', 'smoke-test.invalid')
    tag.setAttribute('data-api', 'http://api.invalid')
    tag.setAttribute('src', 'https://js.ciphera.net/script.js')
    tag.nonce = 'n0nce'
    doc.head.appendChild(tag)
    win.eval(SCRIPT)
    await flush()
    expect(companions()[0].nonce).toBe('n0nce')
  })
})
