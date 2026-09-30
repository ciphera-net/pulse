import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'

/**
 * Behavioural contract of the privacy-signal switches (script v1.6.0, PULSE-164).
 *
 * A browser sending Do Not Track or Global Privacy Control is HONOURED BY DEFAULT: the
 * script exits before sending anything. A site owner can switch either signal off, one at
 * a time, in their own tag (data-ignore-dnt / data-ignore-gpc, or ignoreDnt / ignoreGpc
 * in window.pulseConfig). DNT has no legal force; GPC is a CCPA opt-out signal, so the
 * two are independent.
 *
 * These run the REAL script in a fresh jsdom window per test and count the requests it
 * actually sends, so a switch wired to the wrong signal fails here.
 */

const ROOT = join(__dirname, '..')
const SCRIPT = readFileSync(join(ROOT, 'tracker/script.js'), 'utf8')

let dom: JSDOM
let win: any
let doc: Document
let sent: any[] = []

type Signals = { dnt?: string; gpc?: boolean; webdriver?: boolean }

function newWindow(signals: Signals, url = 'http://smoke-test.invalid/') {
  dom = new JSDOM('<!doctype html><html><head></head><body><h1>Home</h1></body></html>', {
    url,
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
  win.Blob = class CapturedBlob {
    parts: any[]
    constructor(parts: any[]) {
      this.parts = parts
    }
  }
  Object.defineProperty(win.navigator, 'sendBeacon', { configurable: true, value: vi.fn(() => true) })
  Object.defineProperty(win.navigator, 'doNotTrack', { configurable: true, value: signals.dnt ?? null })
  Object.defineProperty(win.navigator, 'globalPrivacyControl', { configurable: true, value: signals.gpc ?? undefined })
  Object.defineProperty(win.navigator, 'webdriver', { configurable: true, value: signals.webdriver ?? false })
}

function installScript(attrs: Record<string, string> = {}, pulseConfig?: Record<string, unknown>) {
  if (pulseConfig) win.pulseConfig = pulseConfig
  const tag = doc.createElement('script')
  tag.setAttribute('data-domain', 'smoke-test.invalid')
  tag.setAttribute('data-api', 'http://api.invalid')
  for (const [k, v] of Object.entries(attrs)) tag.setAttribute(k, v)
  doc.head.appendChild(tag)
  win.eval(SCRIPT)
}

async function flush(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms)
}

const pageviews = () => sent.filter((r) => r.url.endsWith('/api/v1/events') && r.body && !r.body.name)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-30T19:00:00Z'))
  sent = []
})

afterEach(() => {
  vi.useRealTimers()
  try {
    dom.window.close()
  } catch {}
})

describe('privacy signals are honoured by default', () => {
  it('a browser sending no signal is tracked', async () => {
    newWindow({})
    installScript()
    await flush()
    expect(pageviews()).toHaveLength(1)
  })

  it.each(['1', 'yes'])('Do Not Track (%s) sends nothing at all', async (dnt) => {
    newWindow({ dnt })
    installScript()
    await flush(60_000)
    expect(sent).toHaveLength(0)
  })

  it('Global Privacy Control sends nothing at all', async () => {
    newWindow({ gpc: true })
    installScript()
    await flush(60_000)
    expect(sent).toHaveLength(0)
  })

  it('an honoured signal exits before ?pulse-ignore touches localStorage, as it always did', async () => {
    newWindow({ gpc: true }, 'http://smoke-test.invalid/?pulse-ignore')
    installScript()
    await flush()
    expect(win.localStorage.getItem('pulse_ignore')).toBeNull()
  })
})

describe('a site owner can switch each signal off, independently', () => {
  it('data-ignore-gpc tracks a GPC browser', async () => {
    newWindow({ gpc: true })
    installScript({ 'data-ignore-gpc': '' })
    await flush()
    expect(pageviews()).toHaveLength(1)
  })

  it('data-ignore-dnt tracks a DNT browser', async () => {
    newWindow({ dnt: '1' })
    installScript({ 'data-ignore-dnt': '' })
    await flush()
    expect(pageviews()).toHaveLength(1)
  })

  it('data-ignore-gpc does NOT switch off Do Not Track', async () => {
    newWindow({ dnt: '1', gpc: true })
    installScript({ 'data-ignore-gpc': '' })
    await flush(60_000)
    expect(sent).toHaveLength(0)
  })

  it('data-ignore-dnt does NOT switch off GPC', async () => {
    newWindow({ dnt: '1', gpc: true })
    installScript({ 'data-ignore-dnt': '' })
    await flush(60_000)
    expect(sent).toHaveLength(0)
  })

  it('both switches together track a browser sending both signals', async () => {
    newWindow({ dnt: '1', gpc: true })
    installScript({ 'data-ignore-dnt': '', 'data-ignore-gpc': 'true' })
    await flush()
    expect(pageviews()).toHaveLength(1)
  })

  it('window.pulseConfig works for tag managers (ignoreGpc / ignoreDnt)', async () => {
    newWindow({ dnt: '1', gpc: true })
    installScript({}, { ignoreGpc: true, ignoreDnt: true })
    await flush()
    expect(pageviews()).toHaveLength(1)
  })

  it('a truthy-looking pulseConfig string does not count: only the boolean true switches it off', async () => {
    newWindow({ gpc: true })
    installScript({}, { ignoreGpc: 'false' })
    await flush(60_000)
    expect(sent).toHaveLength(0)
  })
})

describe('an explicit false keeps the signal honoured (framework rendering trap)', () => {
  // * Some frameworks render a false prop as data-x="false", which is PRESENT to
  // * hasAttribute(). For a switch that reduces privacy, present-but-false must not count.
  it.each(['false', 'FALSE', '0', 'no', 'off', ' false '])('data-ignore-gpc="%s" still honours GPC', async (v) => {
    newWindow({ gpc: true })
    installScript({ 'data-ignore-gpc': v })
    await flush(60_000)
    expect(sent).toHaveLength(0)
  })

  it('data-ignore-dnt="false" still honours Do Not Track', async () => {
    newWindow({ dnt: '1' })
    installScript({ 'data-ignore-dnt': 'false' })
    await flush(60_000)
    expect(sent).toHaveLength(0)
  })
})

describe('the other exits are untouched by the switches', () => {
  it('automation (navigator.webdriver) is still skipped with both switches on', async () => {
    newWindow({ webdriver: true, gpc: true, dnt: '1' })
    installScript({ 'data-ignore-dnt': '', 'data-ignore-gpc': '' })
    await flush(60_000)
    expect(sent).toHaveLength(0)
  })
})
