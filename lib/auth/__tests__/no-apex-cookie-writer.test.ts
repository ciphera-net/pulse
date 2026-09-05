import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A source-level guard for the one attribute that IS per-app sessions S3.
 *
 * Every cookie Pulse writes is host-only on its own origin. The way that stops
 * being true is one `domain:` in one options object, and nothing else notices:
 * the cookie sets, the app renders, the tests that mock the cookie store see a
 * value and never an attribute. So the SOURCE is read here, comments stripped
 * first — a source guard that matches its own prohibition in a comment is
 * vacuous either way (it fires on the explanation, or is loosened until it
 * fires on nothing).
 *
 * Scope: the files that write or delete session cookies, plus the route gate.
 * If a new writer appears, add it here — a writer this list does not know about
 * is exactly the case this guard exists for.
 */

const ROOT = join(__dirname, '..', '..', '..')

const COOKIE_WRITERS = [
  'app/actions/auth.ts',
  'app/api/auth/refresh/route.ts',
  'lib/auth/session-cookies.ts',
  'lib/auth/id-session.server.ts',
  'lib/auth/context.tsx',
  'middleware.ts',
]

/** Removes line and block comments so a guard cannot be satisfied or tripped by prose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'))

describe('S3: nothing Pulse writes is an apex cookie', () => {
  it('the old apex helper is gone', () => {
    expect(existsSync(join(ROOT, 'lib/utils/cookies.ts'))).toBe(false)
  })

  it.each(COOKIE_WRITERS)('%s sets no cookie `domain`', (rel) => {
    const src = read(rel)
    expect(src, `${rel} carries a domain attribute`).not.toMatch(/\bdomain\s*:/)
    // A cookie-domain literal starts with the dot; a hostname (pulse-staging.ciphera.net) does not.
    expect(src, `${rel} names the apex cookie domain`).not.toMatch(/['"`]\.ciphera\.net/)
  })

  it.each(['app/actions/auth.ts', 'app/api/auth/refresh/route.ts', 'lib/auth/session-cookies.ts'])(
    '%s writes only pulse_* cookie names',
    (rel) => {
      const src = read(rel)
      // A set/delete of an apex NAME through the cookie store, as code (the
      // hand-built Cookie header in id-session.server.ts is a request header,
      // not a write, and is scoped out of this list on purpose).
      expect(src).not.toMatch(/\.(set|delete)\(\s*\{?\s*(name\s*:\s*)?['"](access_token|refresh_token|csrf_token)['"]/)
    },
  )

  it('the route gate reads Pulse\'s own cookies, never the apex names', () => {
    const src = read('middleware.ts')
    expect(src).toMatch(/cookies\.has\('pulse_access'\)/)
    expect(src).toMatch(/cookies\.has\('pulse_refresh'\)/)
    expect(src).not.toMatch(/cookies\.has\('(access_token|refresh_token)'\)/)
  })

  it('the browser never clears the apex csrf_token any more (that is the ceremony\'s)', () => {
    const src = read('lib/auth/context.tsx')
    expect(src).not.toMatch(/document\.cookie\s*=\s*['"`]csrf_token=/)
  })

  it('control: the guard sees a domain when one is there', () => {
    expect(stripComments("store.set('x', 'y', { domain: '.ciphera.net' }) // domain: none")).toMatch(/\bdomain\s*:/)
    expect(stripComments('/* domain: nope */ const a = 1')).not.toMatch(/\bdomain\s*:/)
  })
})
