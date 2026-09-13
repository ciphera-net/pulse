import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { docsUrl, DOCS_ORIGIN } from '../docs'

describe('docsUrl', () => {
  it('returns the docs home with no path', () => {
    expect(docsUrl()).toBe('https://docs.ciphera.net/pulse')
  })

  it('builds a full URL under the docs origin', () => {
    expect(docsUrl('billing#pageview-limits')).toBe(
      'https://docs.ciphera.net/pulse/billing#pageview-limits',
    )
  })

  it('tolerates a leading slash', () => {
    expect(docsUrl('/csp')).toBe('https://docs.ciphera.net/pulse/csp')
  })

  it('DOCS_ORIGIN carries no trailing slash', () => {
    expect(DOCS_ORIGIN.endsWith('/')).toBe(false)
  })
})

/**
 * SOURCE-TEXT GUARD.
 *
 * Documentation moved from help.ciphera.net/docs/pulse to docs.ciphera.net/pulse
 * on 11-09-2026. help.ciphera.net 308-redirects every old /docs/* URL forever,
 * so a stale link still resolves — but silently costs every reader an extra
 * hop through a host that no longer owns documentation. The only fix that
 * holds is structural: every docs link comes from DOCS_ORIGIN/docsUrl in this
 * file, never a hand-typed literal, so the host can never be half-moved again.
 *
 * This walks app/, components/, lib/ for .ts/.tsx source and fails on any
 * occurrence of the old host+path. Comments are stripped first so the guard
 * cannot be satisfied (or defeated) by prose alone — see the control test.
 *
 * Every file in app/, components/ and lib/ is covered; there is no allowlist.
 */

const FORBIDDEN = 'help.ciphera.net/docs'
const ROOT = join(__dirname, '..', '..')
const SCAN_DIRS = ['app', 'components', 'lib']
const SELF = relative(ROOT, __filename).split('\\').join('/')

/** Removes line and block comments so the guard matches real code, not prose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function sourceFiles(): string[] {
  return SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
    .map((f) => relative(ROOT, f).split('\\').join('/'))
    .filter((f) => f !== SELF)
}

describe('every docs link comes from lib/docs.ts', () => {

  it('finds no hand-typed help.ciphera.net/docs URL anywhere', () => {
    const offenders = sourceFiles()
      .filter((rel) => stripComments(readFileSync(join(ROOT, rel), 'utf8')).includes(FORBIDDEN))

    expect(
      offenders,
      `these files hand-type the old docs host instead of importing from lib/docs.ts: ${offenders.join(', ')}`,
    ).toEqual([])
  })

  it('control: the guard would catch a literal if one were written', () => {
    const sample = "const OLD_DOCS_URL = 'https://help.ciphera.net/docs/pulse/csp' // not a real link"
    expect(stripComments(sample)).toContain(FORBIDDEN)
    expect(stripComments('// https://help.ciphera.net/docs/pulse is just an example')).not.toContain(
      FORBIDDEN,
    )
  })
})
