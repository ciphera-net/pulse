// @vitest-environment node
//
// What the service worker may keep, read from the REAL next.config.ts.
//
// 🔴 next-pwa's `publicExcludes` entries are fast-glob patterns appended after
// its own `**/*`, so an entry without a leading `!` excludes nothing. The
// tracker's three entries were written without one and the tracker was
// precached all along (measured 27-09-2026). This test runs the plugin's own
// fast-glob over the plugin's own pattern list, so a bare entry fails it.
//
// The analytics-import worker (/workers/import.js) must never be served stale
// after a deploy (design §3.12b M2-n): not precached, not answered from the
// runtime cache — next-pwa's defaults answer every `*.js` StaleWhileRevalidate —
// and covered by the `no-cache, must-revalidate` header rule. Each has a
// control proving the check can fail.

import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const captured: { options: Record<string, unknown> | null } = { options: null }

vi.mock('@ducanh2912/next-pwa', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@ducanh2912/next-pwa')
  return {
    ...actual,
    default: (options: Record<string, unknown>) => {
      captured.options = options
      return (config: unknown) => config
    },
  }
})

// next.config.ts writes public/build-id.json when it is loaded.
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return { ...actual, writeFileSync: vi.fn() }
})

type RuntimeRule = {
  urlPattern: RegExp | string | ((ctx: { url: URL; request: Request; sameOrigin: boolean }) => boolean)
  handler: string
  options?: { cacheName?: string }
}

async function load() {
  const config = (await import('../next.config')).default as unknown as {
    headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]>
  }
  if (!captured.options) throw new Error('next.config.ts did not call the PWA plugin')
  return { config, pwa: captured.options }
}

const requireHere = createRequire(import.meta.url)
const pwaRequire = createRequire(requireHere.resolve('@ducanh2912/next-pwa'))
// The plugin's own glob library, resolved from the plugin.
const fastGlob = pwaRequire('fast-glob') as { sync: (patterns: string[], options: { cwd: string }) => string[] }
const defaultRuntimeCaching = (pwaRequire('@ducanh2912/next-pwa') as { runtimeCaching: RuntimeRule[] }).runtimeCaching

/** The plugin's precache selection (its createContext: `**\/*`, its own excludes, then ours). */
function precached(publicDir: string, publicExcludes: string[]): string[] {
  return fastGlob.sync(
    [
      '**/*',
      '!{workbox,fallback,swe-worker,worker}-*.js',
      '!{workbox,fallback,swe-worker,worker}-*.js.map',
      '!sw.js',
      '!sw.js.map',
      ...publicExcludes,
    ],
    { cwd: publicDir },
  )
}

async function fakePublic(): Promise<string> {
  const fs = await vi.importActual<typeof import('fs')>('fs')
  const dir = fs.mkdtempSync(join(tmpdir(), 'pwa-public-'))
  fs.mkdirSync(join(dir, 'workers'))
  for (const f of ['script.js', 'script-sri.json', 'script-versions.json', 'workers/import.js', 'favicon.ico', 'manifest.json']) {
    fs.writeFileSync(join(dir, f), 'x')
  }
  return dir
}

/** The plugin's merge (resolveRuntimeCaching): ours first, then each default not sharing a cache name. */
function effectiveRuntimeCaching(custom: RuntimeRule[] | undefined, extend: boolean): RuntimeRule[] {
  if (!custom) return defaultRuntimeCaching
  if (!extend) return custom
  const names = new Set(custom.map((r) => r.options?.cacheName).filter(Boolean))
  return [...custom, ...defaultRuntimeCaching.filter((r) => !r.options?.cacheName || !names.has(r.options.cacheName))]
}

/** The first rule that answers `href` from the app's own origin (workbox: first match wins). */
function routeFor(rules: RuntimeRule[], href: string): RuntimeRule | null {
  const url = new URL(href)
  for (const r of rules) {
    const p = r.urlPattern
    if (p instanceof RegExp ? p.test(href) : typeof p === 'function' ? p({ url, request: new Request(href), sameOrigin: true }) : false) {
      return r
    }
  }
  return null
}

describe('the service worker precache', () => {
  it('leaves out the tracker files and the import worker', async () => {
    const { pwa } = await load()
    const selected = precached(await fakePublic(), pwa.publicExcludes as string[])
    expect(selected).not.toContain('script.js')
    expect(selected).not.toContain('script-sri.json')
    expect(selected).not.toContain('script-versions.json')
    expect(selected).not.toContain('workers/import.js')
    // Control: ordinary public files are still precached.
    expect(selected).toEqual(expect.arrayContaining(['favicon.ico', 'manifest.json']))
  })

  it('control: an entry without its leading ! excludes nothing', async () => {
    const selected = precached(await fakePublic(), ['script.js', 'workers/**'])
    expect(selected).toContain('script.js')
    expect(selected).toContain('workers/import.js')
  })
})

describe('the import worker is never served stale', () => {
  const WORKER = 'https://pulse.ciphera.net/workers/import.js'

  it('goes to the network, not the runtime cache', async () => {
    const { pwa } = await load()
    const workbox = pwa.workboxOptions as { runtimeCaching?: RuntimeRule[] } | undefined
    const rules = effectiveRuntimeCaching(workbox?.runtimeCaching, pwa.extendDefaultRuntimeCaching === true)
    expect(routeFor(rules, WORKER)?.handler).toBe('NetworkOnly')
    // Every default rule survives: the tracker's own cache behaviour is unchanged.
    for (const d of defaultRuntimeCaching) expect(rules).toContain(d)
  })

  it('control: with the defaults alone it would be answered from cache first', () => {
    expect(routeFor(defaultRuntimeCaching, WORKER)).toMatchObject({ handler: 'StaleWhileRevalidate' })
  })

  it('is covered by the no-cache, must-revalidate header rule', async () => {
    const { config } = await load()
    const rules = await config.headers()
    const matching = rules.filter((r) => new RegExp(`^${r.source}$`).test('/workers/import.js'))
    const cacheControl = matching.flatMap((r) => r.headers).find((h) => h.key === 'Cache-Control')
    expect(cacheControl?.value).toBe('no-cache, must-revalidate')
    // Control: a content-hashed chunk is not under that rule.
    const chunk = rules.filter((r) => new RegExp(`^${r.source}$`).test('/_next/static/chunks/app.js'))
    expect(chunk.flatMap((r) => r.headers).some((h) => h.key === 'Cache-Control')).toBe(false)
  })
})
