import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'

/**
 * Behavioural contract of the privacy signals (script v1.9.0; before it, v1.6.0's tag switches).
 *
 * A browser sending Do Not Track or Global Privacy Control is HONOURED unless the SITE'S
 * SETTINGS count it. It cannot send a pageview to find out, so it asks for the site's settings
 * first (GET /api/v1/script-settings/<domain>, no body, no referrer) and sends nothing more
 * unless they count it. Any failure respects the signal. The two signals are independent: DNT
 * has no legal force, GPC is a CCPA opt-out signal. The tag's old data-ignore-dnt /
 * data-ignore-gpc switches (and ignoreDnt / ignoreGpc in window.pulseConfig) are ignored.
 * Design: Pulse/docs/plans/14-11-2026-one-tag-settings-from-server-design.md
 *
 * These run the REAL script in a fresh jsdom window per test and record every request it
 * actually makes, so a switch wired to the wrong signal fails here.
 */

const ROOT = join(__dirname, '..')
const SCRIPT = readFileSync(join(ROOT, 'tracker/script.js'), 'utf8')
const SETTINGS_URL = 'http://api.invalid/api/v1/script-settings/smoke-test.invalid'

let dom: JSDOM
let win: any
let doc: Document
let sent: any[] = []
/** What GET /script-settings answers: a settings object, an error body, or a network failure. */
let settingsAnswer: Record<string, unknown> | 'reject'

type Signals = { dnt?: string; gpc?: boolean; webdriver?: boolean }

const defaults = {
  scroll: true, outbound: true, downloads: true, interactions: false,
  clicks: true, copy: true, forms: true, respect_dnt: true, respect_gpc: true,
}

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
    sent.push({ url: u, init, body: init?.body ? JSON.parse(init.body) : null })
    if (u.includes('/api/v1/script-settings/')) {
      if (settingsAnswer === 'reject') throw new TypeError('Failed to fetch')
      const answer = settingsAnswer
      return { json: async () => answer }
    }
    return { json: async () => ({ status: 'queued', id: 'evt-1', c: defaults }) }
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
const settingsRequests = () => sent.filter((r) => r.url.includes('/api/v1/script-settings/'))
/** Exactly one request was made, and it was the settings request, carrying nothing. */
function onlyTheSettingsRequest() {
  expect(sent.map((r) => r.url)).toEqual([SETTINGS_URL])
  expect(sent[0].body).toBeNull()
  expect(sent[0].init?.method ?? 'GET').toBe('GET')
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-14T15:00:00Z'))
  sent = []
  settingsAnswer = defaults
})

afterEach(() => {
  vi.useRealTimers()
  try {
    dom.window.close()
  } catch {}
})

describe('a browser sending no signal', () => {
  it('is tracked, and never asks for the settings', async () => {
    newWindow({})
    installScript()
    await flush()
    expect(pageviews()).toHaveLength(1)
    expect(settingsRequests()).toHaveLength(0)
  })
})

describe('privacy signals are honoured unless the site counts them', () => {
  it('Do Not Track asks for the settings and, on a site that respects it, sends nothing else', async () => {
    newWindow({ dnt: '1' })
    installScript()
    await flush(60_000)
    onlyTheSettingsRequest()
  })

  it('Global Privacy Control asks for the settings and, on a site that respects it, sends nothing else', async () => {
    newWindow({ gpc: true })
    installScript()
    await flush(60_000)
    onlyTheSettingsRequest()
  })

  it('the settings request sends no referrer and asks for no credentials', async () => {
    newWindow({ dnt: '1' })
    installScript()
    await flush()
    expect(settingsRequests()[0].init?.referrerPolicy).toBe('no-referrer')
    expect(settingsRequests()[0].init?.credentials).toBeUndefined()
  })

  it('a site that counts Do Not Track browsers counts one', async () => {
    settingsAnswer = { ...defaults, respect_dnt: false }
    newWindow({ dnt: '1' })
    installScript()
    await flush()
    expect(settingsRequests()).toHaveLength(1)
    expect(pageviews()).toHaveLength(1)
  })

  it('a site that counts GPC browsers counts one', async () => {
    settingsAnswer = { ...defaults, respect_gpc: false }
    newWindow({ gpc: true })
    installScript()
    await flush()
    expect(pageviews()).toHaveLength(1)
  })

  it('counting Do Not Track does NOT count a browser that also sends GPC', async () => {
    settingsAnswer = { ...defaults, respect_dnt: false }
    newWindow({ dnt: '1', gpc: true })
    installScript()
    await flush(60_000)
    onlyTheSettingsRequest()
  })

  it('counting GPC does NOT count a browser that also sends Do Not Track', async () => {
    settingsAnswer = { ...defaults, respect_gpc: false }
    newWindow({ dnt: '1', gpc: true })
    installScript()
    await flush(60_000)
    onlyTheSettingsRequest()
  })

  it('a site that counts both counts a browser sending both', async () => {
    settingsAnswer = { ...defaults, respect_dnt: false, respect_gpc: false }
    newWindow({ dnt: '1', gpc: true })
    installScript()
    await flush()
    expect(pageviews()).toHaveLength(1)
  })

  it('doNotTrack "0" or "unspecified" is not the signal', async () => {
    newWindow({ dnt: 'unspecified' })
    installScript()
    await flush()
    expect(settingsRequests()).toHaveLength(0)
    expect(pageviews()).toHaveLength(1)
  })
})

describe('any failure respects the signal', () => {
  it('a failed settings request sends nothing else', async () => {
    settingsAnswer = 'reject'
    newWindow({ gpc: true })
    installScript()
    await flush(60_000)
    onlyTheSettingsRequest()
  })

  it('an error answer (the 503 body) sends nothing else', async () => {
    settingsAnswer = { error: 'Settings unavailable' }
    newWindow({ dnt: '1' })
    installScript()
    await flush(60_000)
    onlyTheSettingsRequest()
  })

  it('only an explicit false counts: a missing or truthy-looking value respects the signal', async () => {
    settingsAnswer = { ...defaults, respect_dnt: 'false' }
    newWindow({ dnt: '1' })
    installScript()
    await flush(60_000)
    onlyTheSettingsRequest()
  })
})

describe('the tag no longer decides', () => {
  it('data-ignore-dnt / data-ignore-gpc on the tag are ignored', async () => {
    newWindow({ dnt: '1', gpc: true })
    installScript({ 'data-ignore-dnt': '', 'data-ignore-gpc': 'true' })
    await flush(60_000)
    onlyTheSettingsRequest()
  })

  it('ignoreDnt / ignoreGpc in window.pulseConfig are ignored', async () => {
    newWindow({ dnt: '1', gpc: true })
    installScript({}, { ignoreGpc: true, ignoreDnt: true })
    await flush(60_000)
    onlyTheSettingsRequest()
  })

  it('the domain and API address still come from the tag or window.pulseConfig', async () => {
    newWindow({ dnt: '1' })
    win.pulseConfig = { domain: 'smoke-test.invalid', api: 'http://api.invalid' }
    const tag = doc.createElement('script')
    doc.head.appendChild(tag)
    win.eval(SCRIPT)
    await flush()
    expect(settingsRequests().map((r) => r.url)).toEqual([SETTINGS_URL])
  })
})

describe('the other exits', () => {
  it('automation (navigator.webdriver) asks for nothing at all, even on a site that counts signals', async () => {
    settingsAnswer = { ...defaults, respect_dnt: false, respect_gpc: false }
    newWindow({ webdriver: true, gpc: true, dnt: '1' })
    installScript()
    await flush(60_000)
    expect(sent).toHaveLength(0)
  })

  it('a respected signal leaves ?pulse-ignore storage untouched, as it always did', async () => {
    newWindow({ gpc: true }, 'http://smoke-test.invalid/?pulse-ignore')
    installScript()
    await flush()
    expect(win.localStorage.getItem('pulse_ignore')).toBeNull()
  })

  it('a counted signal goes on to honour the owner’s own opt-out flag', async () => {
    settingsAnswer = { ...defaults, respect_gpc: false }
    newWindow({ gpc: true })
    win.localStorage.setItem('pulse_ignore', 'true')
    installScript()
    await flush(60_000)
    onlyTheSettingsRequest()
  })
})
