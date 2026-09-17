import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'

/**
 * Behavioural contract of the identity anchor (script v1.4.0,
 * Pulse/docs/plans/17-09-2026-identity-anchor-design.md).
 *
 * The server derives a visitor from the client IP, and the IP is not stable inside one
 * browsing session: dual-stack clients alternate addresses per connection, IPv6 privacy
 * extensions rotate them, and people move between networks. Measured on production, one
 * click became two "visitors" and one customer became five in a day. The tab therefore
 * tells the server which pageview it is a continuation of — `anchor_id`, the server-issued
 * id of the most recent pageview — and the server inherits that pageview's identity.
 *
 * These run the REAL script in a fresh jsdom window per test and assert on the request
 * bodies the script actually sends. A string assertion on the source ("anchor_id appears
 * twice") would pass with the field wired to the wrong value; these would not.
 */

const ROOT = join(__dirname, '..')
const SCRIPT = readFileSync(join(ROOT, 'tracker/script.js'), 'utf8')

let dom: JSDOM
let win: any
let doc: Document
let sent: any[] = []
let nextEventId = 1

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
      sent.push(body)
      return { json: async () => ({ status: 'queued', id: `evt-${nextEventId++}` }) }
    }
    return { json: async () => ({}) }
  })
  win.Blob = class CapturedBlob {
    parts: any[]
    constructor(parts: any[]) {
      this.parts = parts
    }
  }
  Object.defineProperty(win.navigator, 'sendBeacon', { configurable: true, value: vi.fn(() => true) })
}

function installScript() {
  const tag = doc.createElement('script')
  tag.setAttribute('data-domain', 'smoke-test.invalid')
  tag.setAttribute('data-api', 'http://api.invalid')
  doc.head.appendChild(tag)
  win.eval(SCRIPT)
}

async function flush(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms)
}

const pageviews = () => sent.filter((b) => !b.name)
const customEvents = () => sent.filter((b) => !!b.name)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-17T09:00:00Z'))
  sent = []
  nextEventId = 1
  newWindow()
})

afterEach(() => {
  vi.useRealTimers()
  try {
    dom.window.close()
  } catch {}
})

describe('identity anchor', () => {
  it('the first pageview in a tab carries no anchor — there is nothing to continue', async () => {
    installScript()
    await flush()
    expect(pageviews()).toHaveLength(1)
    expect(pageviews()[0]).not.toHaveProperty('anchor_id')
  })

  it('a custom event carries the id the server gave the current page', async () => {
    installScript()
    await flush()
    win.pulse.track('outbound_link', { url: 'https://elsewhere.invalid/' })
    await flush()
    expect(customEvents()).toHaveLength(1)
    expect(customEvents()[0].anchor_id).toBe('evt-1')
  })

  it('the next pageview carries the previous one as its anchor, then becomes the anchor itself', async () => {
    installScript()
    await flush()
    win.history.pushState({}, '', '/pricing')
    await flush()
    expect(pageviews()).toHaveLength(2)
    // * Page 2 names page 1 — this is what lets the server keep one identity across
    // * an address change between the two loads.
    expect(pageviews()[1].anchor_id).toBe('evt-1')
    // * And from now on the tab anchors to page 2: most recent, not first, so continuity
    // * is transitive and a refused (stale) anchor self-heals at the next pageview.
    win.pulse.track('signup_click')
    await flush()
    expect(customEvents()[0].anchor_id).toBe('evt-2')
  })

  it('the anchor survives a reload of the same tab — the reloaded document continues the visit', async () => {
    // * A reload is a FRESH document over the SAME sessionStorage. jsdom cannot share
    // * storage between windows, so the reload is modelled the way the engagement suite
    // * models the refresh-dedup record: seed what the previous document would have left.
    win.sessionStorage.setItem('ciphera_anchor', 'evt-prev')
    installScript()
    await flush()
    expect(pageviews()).toHaveLength(1)
    expect(pageviews()[0].anchor_id).toBe('evt-prev')
    // * And this document's own pageview becomes the anchor for what follows.
    expect(win.sessionStorage.getItem('ciphera_anchor')).toBe('evt-1')
  })

  it('a new tab has no anchor — nothing crosses tabs and nothing outlives one', async () => {
    installScript()
    await flush()
    win.pulse.track('x')
    await flush()
    expect(customEvents()[0].anchor_id).toBe('evt-1')
    // * A second window is a second tab: its own sessionStorage, empty.
    newWindow()
    installScript()
    await flush()
    const fresh = sent[sent.length - 1]
    expect(fresh).not.toHaveProperty('anchor_id')
  })

  it('never touches localStorage or cookies', async () => {
    installScript()
    await flush()
    win.pulse.track('x')
    await flush()
    // * sessionStorage is the ONLY storage the anchor may use. (A prototype spy would
    // * also see sessionStorage writes — Storage is one prototype in jsdom — so the
    // * assertion is on what localStorage actually holds.)
    expect(win.localStorage.length).toBe(0)
    expect(doc.cookie).toBe('')
    expect(win.sessionStorage.getItem('ciphera_anchor')).toBe('evt-1')
  })

  it('still sends when sessionStorage is unavailable — the anchor is a convenience, never a dependency', async () => {
    Object.defineProperty(win, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: storage disabled')
      },
    })
    installScript()
    await flush()
    win.pulse.track('x')
    await flush()
    expect(pageviews()).toHaveLength(1)
    expect(customEvents()).toHaveLength(1)
    // * Without storage the in-memory anchor still works within the document.
    expect(customEvents()[0].anchor_id).toBe('evt-1')
  })
})
