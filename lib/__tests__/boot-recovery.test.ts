// A page that loaded without its files recovers by itself (lib/boot-recovery.ts; audit
// 16-11-2026-blank-dashboard-and-performance-reports.md §7). The inline script is run here with
// `location`, `fetch` and `navigator` passed in as fakes (they shadow the globals inside it), and the
// real jsdom window's events and fake timers drive it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BOOT_CHECK_AFTER_LOAD_MS,
  BOOT_CHECK_LATEST_MS,
  BOOT_PROBE_FIRST_WAIT_MS,
  BOOT_RELOAD_KEY,
  BOOT_RELOAD_LIMIT,
  BOOT_RELOAD_WINDOW_MS,
  bootRecoveryScript,
  isStaticFile,
  probeUrl,
  recentReloads,
  stylesMissing,
} from '../boot-recovery'

const CHUNK = 'https://ciphera-app-static.b-cdn.net/pulse/_next/static/chunks/app-123.js'
const SHEET = 'https://ciphera-app-static.b-cdn.net/pulse/_next/static/css/abc.css'

type Fakes = { reload: ReturnType<typeof vi.fn>; fetch: ReturnType<typeof vi.fn>; navigator: { onLine: boolean } }

function run(opts: { online?: boolean; fetchOk?: boolean[] } = {}): Fakes {
  const answers = [...(opts.fetchOk ?? [true])]
  const fakes: Fakes = {
    reload: vi.fn(),
    fetch: vi.fn(() => ((answers.length > 1 ? answers.shift() : answers[0]) ? Promise.resolve({}) : Promise.reject(new TypeError('Failed to fetch')))),
    navigator: { onLine: opts.online ?? true },
  }
  const location = { reload: fakes.reload, origin: 'https://pulse.ciphera.net' }
  new Function('location', 'fetch', 'navigator', bootRecoveryScript())(location, fakes.fetch, fakes.navigator)
  return fakes
}

function addFile(tag: 'script' | 'link', url: string): HTMLElement {
  const el = document.createElement(tag)
  if (tag === 'script') (el as HTMLScriptElement).src = url
  else {
    ;(el as HTMLLinkElement).rel = 'stylesheet'
    ;(el as HTMLLinkElement).href = url
  }
  document.head.appendChild(el)
  return el
}

function fail(el: HTMLElement) {
  el.dispatchEvent(new Event('error'))
}

function load() {
  window.dispatchEvent(new Event('load'))
}

/** Every pending timer and every settled promise, a few rounds over. */
async function settle(ms: number) {
  for (let i = 0; i < 8; i++) {
    await vi.advanceTimersByTimeAsync(ms / 8)
  }
}

let listeners: { type: string; fn: EventListenerOrEventListenerObject; capture?: boolean }[] = []
const realAdd = window.addEventListener.bind(window)

beforeEach(() => {
  vi.useFakeTimers()
  document.head.innerHTML = ''
  document.body.removeAttribute('style')
  sessionStorage.clear()
  listeners = []
  // Keep track of what each run adds to the shared window, so runs cannot hear each other.
  vi.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => {
    listeners.push({ type, fn, capture: typeof o === 'boolean' ? o : o?.capture })
    realAdd(type, fn, o)
  })
})

afterEach(() => {
  for (const l of listeners) window.removeEventListener(l.type, l.fn, l.capture)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the helpers', () => {
  it('knows the page’s own build files on any host', () => {
    expect(isStaticFile(CHUNK)).toBe(true)
    expect(isStaticFile('https://pulse.ciphera.net/_next/static/css/a.css')).toBe(true)
    expect(isStaticFile('https://js.ciphera.net/script.js')).toBe(false)
    expect(isStaticFile('https://pulse.ciphera.net/sites')).toBe(false)
  })

  it('calls the styles missing only when the body has no background', () => {
    expect(stylesMissing('')).toBe(true)
    expect(stylesMissing('rgba(0, 0, 0, 0)')).toBe(true)
    expect(stylesMissing('transparent')).toBe(true)
    expect(stylesMissing('rgb(10, 10, 10)')).toBe(false)
    expect(stylesMissing('rgb(255, 255, 255)')).toBe(false)
    expect(stylesMissing('rgba(10, 10, 10, 0.5)')).toBe(false)
    expect(stylesMissing('rgba(0, 0, 0, 0.0)')).toBe(true)
  })

  it('counts only readable reload times inside the window', () => {
    const now = 1_000_000_000
    expect(recentReloads(JSON.stringify([now - 1000, now - BOOT_RELOAD_WINDOW_MS - 1, 'x', now + 5]), now, BOOT_RELOAD_WINDOW_MS)).toEqual([now - 1000])
    expect(recentReloads('not json', now, BOOT_RELOAD_WINDOW_MS)).toEqual([])
    expect(recentReloads('{"a":1}', now, BOOT_RELOAD_WINDOW_MS)).toEqual([])
    expect(recentReloads(null, now, BOOT_RELOAD_WINDOW_MS)).toEqual([])
  })

  it('makes a request no cache holds', () => {
    expect(probeUrl(CHUNK, 7)).toBe(`${CHUNK}?boot-probe=7`)
    expect(probeUrl(`${CHUNK}?v=1`, 7)).toBe(`${CHUNK}?v=1&boot-probe=7`)
  })
})

describe('the recovery', () => {
  it('a page that loaded well is left alone', async () => {
    document.body.style.backgroundColor = 'rgb(10, 10, 10)'
    addFile('link', SHEET)
    addFile('script', CHUNK)
    const f = run()
    load()
    await settle(BOOT_CHECK_LATEST_MS + 60_000)
    expect(f.fetch).not.toHaveBeenCalled()
    expect(f.reload).not.toHaveBeenCalled()
  })

  it('a script that failed: waits for the file to answer, then reloads once', async () => {
    document.body.style.backgroundColor = 'rgb(10, 10, 10)'
    const f = run()
    fail(addFile('script', CHUNK))
    load()
    await settle(BOOT_CHECK_AFTER_LOAD_MS + BOOT_PROBE_FIRST_WAIT_MS + 100)
    expect(f.fetch).toHaveBeenCalledTimes(1)
    expect(String(f.fetch.mock.calls[0][0])).toMatch(/app-123\.js\?boot-probe=\d+$/)
    expect(f.fetch.mock.calls[0][1]).toEqual({ mode: 'no-cors', cache: 'no-store' })
    expect(f.reload).toHaveBeenCalledTimes(1)
    expect(JSON.parse(sessionStorage.getItem(BOOT_RELOAD_KEY) || '[]')).toHaveLength(1)
  })

  it('styles that did not apply count as a failure too (no error event seen)', async () => {
    addFile('link', SHEET)
    const f = run()
    load()
    await settle(BOOT_CHECK_AFTER_LOAD_MS + BOOT_PROBE_FIRST_WAIT_MS + 100)
    expect(String(f.fetch.mock.calls[0]?.[0])).toMatch(/abc\.css\?boot-probe=/)
    expect(f.reload).toHaveBeenCalledTimes(1)
  })

  it('keeps trying while the host does not answer, and reloads only when it does', async () => {
    document.body.style.backgroundColor = 'rgb(10, 10, 10)'
    const f = run({ fetchOk: [false, false, false, true] })
    fail(addFile('link', SHEET))
    load()
    await settle(BOOT_CHECK_AFTER_LOAD_MS + 2_000 + 4_000 + 8_000 + 16_000 + 1_000)
    expect(f.fetch).toHaveBeenCalledTimes(4)
    expect(f.reload).toHaveBeenCalledTimes(1)
  })

  it('offline: waits for the browser to come back online before asking', async () => {
    document.body.style.backgroundColor = 'rgb(10, 10, 10)'
    const f = run({ online: false })
    fail(addFile('script', CHUNK))
    load()
    await settle(60_000)
    expect(f.fetch).not.toHaveBeenCalled()
    f.navigator.onLine = true
    window.dispatchEvent(new Event('online'))
    await settle(1_000)
    expect(f.fetch).toHaveBeenCalledTimes(1)
    expect(f.reload).toHaveBeenCalledTimes(1)
  })

  it(`stops after ${BOOT_RELOAD_LIMIT} reloads in the window`, async () => {
    const now = Date.now()
    sessionStorage.setItem(BOOT_RELOAD_KEY, JSON.stringify(Array.from({ length: BOOT_RELOAD_LIMIT }, (_, i) => now - i * 1000)))
    const f = run()
    fail(addFile('script', CHUNK))
    load()
    await settle(60_000)
    expect(f.fetch).not.toHaveBeenCalled()
    expect(f.reload).not.toHaveBeenCalled()
  })

  it('control: reloads from before the window do not count', async () => {
    sessionStorage.setItem(BOOT_RELOAD_KEY, JSON.stringify([Date.now() - BOOT_RELOAD_WINDOW_MS - 1, Date.now() - BOOT_RELOAD_WINDOW_MS - 2, Date.now() - BOOT_RELOAD_WINDOW_MS - 3]))
    const f = run()
    fail(addFile('script', CHUNK))
    load()
    await settle(BOOT_CHECK_AFTER_LOAD_MS + BOOT_PROBE_FIRST_WAIT_MS + 100)
    expect(f.reload).toHaveBeenCalledTimes(1)
  })

  it('never reloads without sessionStorage, so it cannot loop', async () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('denied')
    })
    const f = run()
    fail(addFile('script', CHUNK))
    load()
    await settle(60_000)
    expect(f.reload).not.toHaveBeenCalled()
  })

  it('a failure after the page settled (a later navigation) is left to the app', async () => {
    document.body.style.backgroundColor = 'rgb(10, 10, 10)'
    const f = run()
    load()
    await settle(BOOT_CHECK_AFTER_LOAD_MS + 100)
    fail(addFile('script', CHUNK))
    await settle(BOOT_CHECK_LATEST_MS + 60_000)
    expect(f.fetch).not.toHaveBeenCalled()
    expect(f.reload).not.toHaveBeenCalled()
  })

  it('without a load event, still checks once the latest time has passed', async () => {
    const f = run()
    fail(addFile('script', CHUNK))
    await settle(BOOT_CHECK_LATEST_MS + BOOT_PROBE_FIRST_WAIT_MS + 1_000)
    expect(f.reload).toHaveBeenCalledTimes(1)
  })

  it('a load event after the latest time does not start a second recovery', async () => {
    const f = run({ fetchOk: [false, true] })
    fail(addFile('script', CHUNK))
    await settle(BOOT_CHECK_LATEST_MS + 500)
    load()
    await settle(BOOT_CHECK_AFTER_LOAD_MS + 2_000 + 4_000 + 1_000)
    expect(f.fetch).toHaveBeenCalledTimes(2)
    expect(f.reload).toHaveBeenCalledTimes(1)
  })

  it('ignores files that are not the page’s own build files', async () => {
    document.body.style.backgroundColor = 'rgb(10, 10, 10)'
    const f = run()
    fail(addFile('script', 'https://js.ciphera.net/script.js'))
    load()
    await settle(60_000)
    expect(f.reload).not.toHaveBeenCalled()
  })
})

describe('the root layout', () => {
  it('renders the recovery inline in <head>', async () => {
    const fs = await vi.importActual<typeof import('fs')>('fs')
    const path = await vi.importActual<typeof import('path')>('path')
    const source = fs.readFileSync(path.resolve(process.cwd(), 'app/layout.tsx'), 'utf8')
    const head = source.slice(source.indexOf('<head>'), source.indexOf('</head>'))
    expect(head).toContain('__html: bootRecoveryScript()')
  })
})
