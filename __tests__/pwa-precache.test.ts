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

async function load() {
  await import('../next.config')
  if (!captured.options) throw new Error('next.config.ts did not call the PWA plugin')
  return { pwa: captured.options }
}

const requireHere = createRequire(import.meta.url)
const pwaRequire = createRequire(requireHere.resolve('@ducanh2912/next-pwa'))
// The plugin's own glob library, resolved from the plugin.
const fastGlob = pwaRequire('fast-glob') as { sync: (patterns: string[], options: { cwd: string }) => string[] }

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
  for (const f of ['script.js', 'script-sri.json', 'script-versions.json', 'favicon.ico', 'manifest.json']) {
    fs.writeFileSync(join(dir, f), 'x')
  }
  return dir
}

describe('the service worker precache', () => {
  it('leaves out the tracker files', async () => {
    const { pwa } = await load()
    const selected = precached(await fakePublic(), pwa.publicExcludes as string[])
    expect(selected).not.toContain('script.js')
    expect(selected).not.toContain('script-sri.json')
    expect(selected).not.toContain('script-versions.json')
    // Control: ordinary public files are still precached.
    expect(selected).toEqual(expect.arrayContaining(['favicon.ico', 'manifest.json']))
  })

  it('control: an entry without its leading ! excludes nothing', async () => {
    const selected = precached(await fakePublic(), ['script.js'])
    expect(selected).toContain('script.js')
  })
})
