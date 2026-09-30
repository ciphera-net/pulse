import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'

/**
 * The engagement beacon's TRANSPORT is pinned (script v1.6.1, PULSE-169).
 *
 * Browsers type a navigator.sendBeacon request as "ping", and EasyPrivacy's
 * `*$ping,third-party` (on by default in uBlock Origin and Brave) cancels every third-party
 * ping. sendBeacon still reports success, so nothing noticed: engagement was lost for every
 * ad-blocking visitor, and Cerberus then convicted those visits as zero-engagement bots.
 * A keepalive fetch is typed "fetch" and survives unload, so it is the primary transport.
 * These tests fail if the tracker ever goes back to sendBeacon where fetch keepalive exists.
 */

const ROOT = join(__dirname, '..')
const SCRIPT = readFileSync(join(ROOT, 'tracker/script.js'), 'utf8')

let dom: JSDOM
let win: any
let fetchCalls: Array<{ url: string; init: any }> = []
let beaconCalls: string[] = []

function newWindow(opts: { keepalive: boolean; sendBeacon: boolean }) {
  dom = new JSDOM('<!doctype html><html><head></head><body><h1>Home</h1><div style="height:5000px"></div></body></html>', {
    url: 'http://smoke-test.invalid/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  })
  win = dom.window
  win.setTimeout = globalThis.setTimeout
  win.clearTimeout = globalThis.clearTimeout
  win.setInterval = globalThis.setInterval
  win.clearInterval = globalThis.clearInterval
  win.Date = globalThis.Date
  win.fetch = vi.fn(async (url: string, init: any) => {
    fetchCalls.push({ url, init })
    return { json: async () => ({ status: 'queued', id: 'evt-1' }) }
  })
  win.Blob = class CapturedBlob {
    parts: any[]
    constructor(parts: any[]) {
      this.parts = parts
    }
  }
  // * Feature detection reads `'keepalive' in Request.prototype`.
  win.Request = opts.keepalive ? class { get keepalive() { return false } } : class {}
  Object.defineProperty(win.navigator, 'sendBeacon', {
    configurable: true,
    value: opts.sendBeacon
      ? vi.fn((url: string) => {
          beaconCalls.push(url)
          return true
        })
      : undefined,
  })
}

function installScript() {
  const tag = win.document.createElement('script')
  tag.setAttribute('data-domain', 'smoke-test.invalid')
  tag.setAttribute('data-api', 'http://api.invalid')
  win.document.head.appendChild(tag)
  win.eval(SCRIPT)
}

// * Engage the visitor (input + scroll), then let the early beacon (3.5 s) fire.
async function engageAndWait() {
  await vi.advanceTimersByTimeAsync(0)
  win.document.dispatchEvent(new win.MouseEvent('mousemove'))
  win.document.dispatchEvent(new win.Event('scroll'))
  await vi.advanceTimersByTimeAsync(4000)
  win.dispatchEvent(new win.Event('pagehide'))
  await vi.advanceTimersByTimeAsync(0)
}

const engagementFetches = () => fetchCalls.filter((c) => c.url.endsWith('/api/v1/engagement'))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-30T19:00:00Z'))
  fetchCalls = []
  beaconCalls = []
})

afterEach(() => {
  vi.useRealTimers()
  try {
    dom.window.close()
  } catch {}
})

describe('engagement transport', () => {
  it('uses fetch with keepalive where the engine supports it, and never sendBeacon', async () => {
    newWindow({ keepalive: true, sendBeacon: true })
    installScript()
    await engageAndWait()
    expect(engagementFetches().length).toBeGreaterThan(0)
    for (const c of engagementFetches()) {
      expect(c.init.keepalive).toBe(true)
      expect(c.init.method).toBe('POST')
    }
    expect(beaconCalls).toHaveLength(0)
  })

  it('falls back to sendBeacon only where fetch keepalive is unavailable', async () => {
    newWindow({ keepalive: false, sendBeacon: true })
    installScript()
    await engageAndWait()
    expect(beaconCalls.length).toBeGreaterThan(0)
    expect(engagementFetches()).toHaveLength(0)
  })

  it('uses fetch when neither keepalive nor sendBeacon exists', async () => {
    newWindow({ keepalive: false, sendBeacon: false })
    installScript()
    await engageAndWait()
    expect(engagementFetches().length).toBeGreaterThan(0)
  })
})
