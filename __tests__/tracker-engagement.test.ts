import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'

/**
 * Behavioural contract of the tracker's engagement measurement (script v1.2.0,
 * 04-09-2026). The audit that produced it is
 * Pulse/docs/audits/04-09-2026-visit-duration-audit.md: the previous script reported
 * wall-clock time since load as "duration" — a sleeping laptop counted, a tab left open
 * overnight counted, a 3.5-second timer that fired after 17 minutes of freeze counted
 * the 17 minutes — and it minted a pageview for a query-string rewrite and for a
 * document nobody had looked at.
 *
 * The real script runs here in a FRESH jsdom window per test, on fake timers and a fake
 * clock. Every case below is a shape the old script got wrong, stated as the number it
 * must now send.
 *
 * Why a window per test and not the shared jsdom environment: the tracker installs
 * document listeners, a MutationObserver and a patched history, none of which a test
 * can uninstall. Under one shared window every earlier instance keeps answering
 * pageshow, visibilitychange and pushState, and the counts below become the sum of
 * every test that ran before.
 */

const ROOT = join(__dirname, '..')
const SCRIPT = readFileSync(join(ROOT, 'tracker/script.js'), 'utf8')

type Beacon = { url: string; body: any }

let dom: JSDOM
let win: any
let doc: Document
let hidden = false
let pageviews: any[] = []
let beacons: Beacon[] = []
let nextEventId = 1

function setHidden(next: boolean) {
  hidden = next
  doc.dispatchEvent(new win.Event('visibilitychange'))
}

function newWindow() {
  dom = new JSDOM('<!doctype html><html><head></head><body><h1>Home</h1></body></html>', {
    url: 'http://smoke-test.invalid/',
    pretendToBeVisual: true,
    // * Without this, window.eval is the outer realm's eval and the script would install
    // * itself into the shared test window instead of this one.
    runScripts: 'outside-only',
  })
  win = dom.window
  doc = win.document

  // * The script resolves timers, the clock and the network from its window; hand it the
  // * faked globals so vi.advanceTimersByTimeAsync drives it.
  win.setTimeout = globalThis.setTimeout
  win.clearTimeout = globalThis.clearTimeout
  win.setInterval = globalThis.setInterval
  win.clearInterval = globalThis.clearInterval
  win.Date = globalThis.Date
  win.fetch = vi.fn(async (url: string, init: any) => {
    const body = init?.body ? JSON.parse(init.body) : null
    if (url.endsWith('/api/v1/events')) {
      pageviews.push(body)
      return { json: async () => ({ status: 'queued', id: `evt-${nextEventId++}` }) }
    }
    if (url.endsWith('/api/v1/engagement')) {
      beacons.push({ url, body })
      return { json: async () => ({}) }
    }
    return { json: async () => ({}) }
  })
  // * The script wraps every beacon in a Blob; a capturing stand-in keeps the JSON
  // * readable synchronously.
  win.Blob = class CapturedBlob {
    parts: any[]
    constructor(parts: any[]) {
      this.parts = parts
    }
  }
  Object.defineProperty(win.navigator, 'sendBeacon', {
    configurable: true,
    value: vi.fn((url: string, blob: any) => {
      let body: any = null
      try {
        body = JSON.parse(String(blob.parts[0]))
      } catch {
        body = null
      }
      beacons.push({ url, body })
      return true
    }),
  })
  Object.defineProperty(doc, 'hidden', { configurable: true, get: () => hidden })
  Object.defineProperty(doc, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') })
}

function installScript(opts: { hidden?: boolean } = {}) {
  hidden = opts.hidden ?? false
  const tag = doc.createElement('script')
  tag.setAttribute('data-domain', 'smoke-test.invalid')
  tag.setAttribute('data-api', 'http://api.invalid')
  doc.head.appendChild(tag)
  // * Run the IIFE in the window's global scope, exactly as a <script src> would.
  win.eval(SCRIPT)
}

async function flush(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms)
}

function lastBeacon(): Beacon {
  if (beacons.length === 0) throw new Error('no beacon was sent')
  return beacons[beacons.length - 1]
}

function activity() {
  doc.dispatchEvent(new win.Event('mousemove'))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-04T02:00:00Z'))
  pageviews = []
  beacons = []
  nextEventId = 1
  newWindow()
})

afterEach(async () => {
  // * Let pending timers and observer callbacks settle, then drop the window without
  // * closing it: jsdom's MutationObserver can still deliver after close(), and the
  // * tracker's URL check reads location on a window that no longer has one — noise on
  // * stderr, never a failure. Twelve unreferenced windows are cheaper than that noise.
  await flush(0)
  vi.useRealTimers()
  win = null
  doc = null as any
})

describe('pageviews are people seeing pages', () => {
  it('a document that loads hidden sends nothing until it becomes visible', async () => {
    installScript({ hidden: true })
    await flush(10_000)
    expect(pageviews).toHaveLength(0)
    expect(beacons).toHaveLength(0)

    setHidden(false)
    await flush(10)
    expect(pageviews).toHaveLength(1)
    expect(pageviews[0].domain).toBe('smoke-test.invalid')
  })

  it('a query-string-only URL rewrite is not a pageview; a path change is', async () => {
    installScript()
    await flush(10)
    expect(pageviews).toHaveLength(1)

    win.history.replaceState({}, '', '/?metric=avg_duration')
    win.history.pushState({}, '', '/?metric=bounce_rate&filters=x')
    win.history.pushState({}, '', '/#section')
    await flush(6_000)
    expect(pageviews).toHaveLength(1)

    win.history.pushState({}, '', '/about')
    await flush(10)
    expect(pageviews).toHaveLength(2)
    expect(pageviews[1].url).toContain('/about')
  })

  it('a back-forward-cache restore is a new pageview', async () => {
    installScript()
    await flush(10)
    expect(pageviews).toHaveLength(1)

    win.dispatchEvent(new win.Event('pagehide'))
    await flush(6_000)
    const ev = new win.Event('pageshow')
    Object.defineProperty(ev, 'persisted', { value: true })
    win.dispatchEvent(ev)
    await flush(10)
    expect(pageviews).toHaveLength(2)
  })

  it('installing the script twice tracks once', async () => {
    installScript()
    installScript()
    await flush(10)
    expect(pageviews).toHaveLength(1)
  })

  it('a reload inside the dedup window adopts the previous pageview instead of going dark', async () => {
    win.sessionStorage.setItem('ciphera_last_pv', JSON.stringify({ p: '/', t: Date.now() - 1000, id: 'evt-prev', e: 4 }))
    installScript()
    await flush(10)
    expect(pageviews).toHaveLength(0)

    activity()
    await flush(20_000)
    const b = lastBeacon()
    expect(b.body.event_id).toBe('evt-prev')
    // * The previous document's 4 s carry over, so the total keeps growing.
    expect(b.body.engaged_duration).toBeGreaterThanOrEqual(20)
  })
})

describe('time on page is engaged time', () => {
  it('every beacon carries engaged_duration alongside the wall-clock', async () => {
    installScript()
    await flush(10)
    activity()
    await flush(21_000)
    const b = lastBeacon()
    expect(b.body.event_id).toBe('evt-1')
    expect(b.body.duration).toBeGreaterThanOrEqual(19)
    expect(b.body.engaged_duration).toBeGreaterThanOrEqual(19)
    expect(b.body.engaged_duration).toBeLessThanOrEqual(b.body.duration)
    expect(b.body.visible_duration).toBeGreaterThanOrEqual(b.body.engaged_duration)
  })

  it('a sleeping machine adds at most one tick, never the gap', async () => {
    installScript()
    await flush(10)
    activity()
    await flush(10_000)

    // * Sleep: the clock jumps an hour with no timer firing in between.
    vi.setSystemTime(Date.now() + 3600_000)
    await flush(1_000)
    setHidden(true)
    const b = lastBeacon()
    expect(b.body.duration).toBeGreaterThanOrEqual(3600)
    expect(b.body.engaged_duration).toBeLessThanOrEqual(13)
    expect(b.body.visible_duration).toBeLessThanOrEqual(13)
  })

  it('the early beacon that fires late reports engaged time, not the freeze', async () => {
    installScript()
    await flush(10)
    activity()
    await flush(1_000)
    // * The tab freezes one second in and thaws 1035 s later; the 3.5 s timer fires then.
    vi.setSystemTime(Date.now() + 1035_000)
    await flush(3_000)
    const b = lastBeacon()
    expect(b.body.duration).toBeGreaterThanOrEqual(1035)
    expect(b.body.engaged_duration).toBeLessThanOrEqual(5)
  })

  it('a page nobody engaged with sends no beacon at all', async () => {
    installScript({ hidden: true })
    await flush(10)
    setHidden(false)
    await flush(1)
    setHidden(true)
    await flush(30_000)
    expect(pageviews).toHaveLength(1)
    expect(beacons).toHaveLength(0)
  })

  it('a hidden tab accrues nothing and sends no heartbeat', async () => {
    installScript()
    await flush(10)
    activity()
    await flush(10_000)
    const before = beacons.length
    setHidden(true)
    const flushed = lastBeacon()
    await flush(120_000)
    expect(beacons.length).toBe(before + 1)
    expect(flushed.body.engaged_duration).toBeLessThanOrEqual(11)

    // * Coming back to the tab resumes the clock on the same pageview.
    setHidden(false)
    activity()
    await flush(20_000)
    const resumed = lastBeacon()
    expect(resumed.body.event_id).toBe(flushed.body.event_id)
    expect(resumed.body.engaged_duration).toBeGreaterThanOrEqual(flushed.body.engaged_duration + 18)
  })

  it('the clock pauses after two minutes without input or scrolling and resumes on activity', async () => {
    installScript()
    await flush(10)
    activity()
    await flush(300_000)
    setHidden(true)
    const paused = lastBeacon().body.engaged_duration
    expect(paused).toBeGreaterThanOrEqual(115)
    expect(paused).toBeLessThanOrEqual(125)

    setHidden(false)
    activity()
    await flush(30_000)
    win.dispatchEvent(new win.Event('pagehide'))
    const resumed = lastBeacon().body.engaged_duration
    expect(resumed).toBeGreaterThanOrEqual(paused + 28)
  })

  it('an SPA navigation finalises the previous page with its engaged time and starts a fresh clock', async () => {
    installScript()
    await flush(10)
    activity()
    await flush(30_000)
    win.history.pushState({}, '', '/next')
    await flush(10)
    const prev = beacons.filter((b) => b.body?.event_id === 'evt-1').pop()!
    expect(prev.body.engaged_duration).toBeGreaterThanOrEqual(29)

    activity()
    await flush(10_000)
    const next = beacons.filter((b) => b.body?.event_id === 'evt-2').pop()!
    expect(next.body.engaged_duration).toBeLessThanOrEqual(11)
    expect(next.body.engaged_duration).toBeGreaterThanOrEqual(1)
  })
})
