import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'

/**
 * Behavioural contract of the send retry (script v1.10.0).
 *
 * On 17-11-2026 the cluster's ingress load balancer was deleted for 23 minutes and every
 * pageview and custom event sent in that time was lost: the tracker sent each once and
 * dropped it on any failure. Since 1.10.0 a send that fails before an answer, or is answered
 * 408, 429 or 5xx, goes out again while the page stays open, with the gaps doubling from 2 s
 * up to 5 minutes, until the event is 30 minutes old. Every event carries a fresh random
 * `idempotency_key`, which the server keeps for an hour and answers a repeat of without
 * storing it, so a retry can never count an event twice. An event without a key (no
 * crypto.randomUUID) is never retried.
 *
 * These run the REAL script in a fresh jsdom window per test and assert on the requests it
 * actually sends, as tracker-anchor.test.ts does.
 */

const ROOT = join(__dirname, '..')
const SCRIPT = readFileSync(join(ROOT, 'tracker/script.js'), 'utf8')

type Outcome = 'reject' | number
let dom: JSDOM
let win: any
let doc: Document
let sent: { at: number; body: any }[] = []
// * What the next /api/v1/events requests meet, in order; once it is empty every request is
// * answered 202 with a fresh id.
let script: Outcome[] = []
let nextEventId = 1
let start = 0

function newWindow() {
  dom = new JSDOM('<!doctype html><html><head></head><body><h1>Home</h1></body></html>', {
    url: 'https://smoke-test.invalid/',
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
    if (!url.endsWith('/api/v1/events')) return { status: 202, json: async () => ({}) }
    const body = JSON.parse(init.body)
    sent.push({ at: Date.now() - start, body })
    const outcome = script.length ? script.shift()! : 202
    if (outcome === 'reject') throw new TypeError('Failed to fetch')
    if (outcome >= 400) return { status: outcome, json: async () => ({ error: 'refused' }) }
    return { status: outcome, json: async () => ({ status: 'queued', id: `evt-${nextEventId++}` }) }
  })
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

const pageviews = () => sent.filter((s) => !s.body.name)
const customEvents = () => sent.filter((s) => !!s.body.name)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-17T10:36:00Z'))
  start = Date.now()
  sent = []
  script = []
  nextEventId = 1
  newWindow()
})

afterEach(() => {
  vi.useRealTimers()
  try {
    dom.window.close()
  } catch {}
})

describe('send retry', () => {
  it('every event carries its own fresh idempotency key', async () => {
    installScript()
    await flush()
    win.pulse.track('signup')
    win.pulse.track('signup')
    await flush()
    const keys = sent.map((s) => s.body.idempotency_key)
    expect(keys).toHaveLength(3)
    for (const k of keys) expect(k).toMatch(UUID)
    expect(new Set(keys).size).toBe(3)
  })

  it('a pageview that cannot be delivered goes out again with the same key, and the page is taken up once it lands', async () => {
    script = ['reject', 'reject']
    installScript()
    await flush()
    expect(pageviews()).toHaveLength(1)
    await flush(2000)
    expect(pageviews()).toHaveLength(2)
    await flush(4000)
    expect(pageviews()).toHaveLength(3)
    const keys = new Set(pageviews().map((s) => s.body.idempotency_key))
    expect(keys.size).toBe(1)
    // * The third send was answered: the page's id is now the anchor a custom event carries.
    win.pulse.track('signup')
    await flush()
    expect(customEvents()).toHaveLength(1)
    expect(customEvents()[0].body.anchor_id).toBe('evt-1')
  })

  it.each([500, 502, 503, 504, 429, 408])('an answer of %i is sent again', async (status) => {
    script = [status]
    installScript()
    await flush()
    await flush(2000)
    expect(pageviews()).toHaveLength(2)
    expect(pageviews()[1].body.idempotency_key).toBe(pageviews()[0].body.idempotency_key)
  })

  it.each([400, 402, 403, 404, 413])('an answer of %i is final', async (status) => {
    script = [status]
    installScript()
    await flush()
    await flush(40 * 60 * 1000)
    expect(pageviews()).toHaveLength(1)
  })

  it('the gaps double from 2 s up to 5 minutes, and the event is dropped once it is 30 minutes old', async () => {
    script = Array(40).fill('reject')
    installScript()
    await flush()
    await flush(60 * 60 * 1000)
    const at = pageviews().map((s) => s.at / 1000)
    expect(at).toEqual([0, 2, 6, 14, 30, 62, 126, 254, 510, 810, 1110, 1410, 1710, 2010])
    expect(new Set(pageviews().map((s) => s.body.idempotency_key)).size).toBe(1)
  })

  it('a custom event is sent again with its key, and is not confused with the pageview', async () => {
    installScript()
    await flush()
    script = ['reject']
    win.pulse.track('signup', { plan: 'pro' })
    await flush()
    await flush(2000)
    expect(customEvents()).toHaveLength(2)
    expect(customEvents()[1].body).toEqual(customEvents()[0].body)
    expect(customEvents()[1].body.idempotency_key).not.toBe(pageviews()[0].body.idempotency_key)
    expect(pageviews()).toHaveLength(1)
  })

  it('without crypto.randomUUID an event has no key and is never sent again', async () => {
    Object.defineProperty(win.crypto, 'randomUUID', { configurable: true, value: undefined })
    script = ['reject', 'reject']
    installScript()
    await flush()
    win.pulse.track('signup')
    await flush(40 * 60 * 1000)
    expect(sent).toHaveLength(2)
    for (const s of sent) expect(s.body).not.toHaveProperty('idempotency_key')
  })

  it('a pageview answered after the visitor moved on is kept, but does not become the new page', async () => {
    script = ['reject']
    installScript()
    await flush()
    win.history.pushState({}, '', '/pricing')
    await flush()
    // * /pricing was answered at once (evt-1); the first page's retry lands after it (evt-2).
    await flush(2000)
    expect(pageviews()).toHaveLength(3)
    win.pulse.track('signup')
    await flush()
    expect(customEvents()[0].body.anchor_id).toBe('evt-1')
  })
})
