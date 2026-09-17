import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * A4 — the arrow-returning reset hook.
 *
 * vitest calls a function RETURNED from beforeEach/afterEach/beforeAll/afterAll
 * as post-test cleanup. `mockReset()` / `mockClear()` / `mockRestore()` all
 * RETURN the mock they were called on, so `beforeEach(() => m.mockReset())`
 * hands vitest that mock as its own cleanup function — it runs a second time,
 * un-awaited, after every test. Harmless while the mock's implementation
 * resolves; the moment it ever rejects, that rejection is a handled error
 * inside vitest's own cleanup step and fails a test that has nothing to do
 * with it. The fix is a block body: `beforeEach(() => { m.mockReset() })`,
 * whose arrow returns `undefined`.
 *
 * Scope: every settings test file, walked recursively —
 * components/settings/** and app/settings/**. Comments are stripped first: a
 * source-text guard that fires on its own explanatory prose (this file's
 * header quotes the exact shape) is either loosened until it stops firing on
 * comments, or wrong the day someone writes a comment about the bug.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..')
const GUARD_FILE = join(__dirname, 'reset-hook-shape.test.ts')

const ROOTS = [
  join(__dirname, '..'), // components/settings
  join(REPO_ROOT, 'app', 'settings'),
]

/**
 * Strips // and /* *\/ comments before the shape is checked, so the guard
 * cannot be tripped — or satisfied — by prose describing it.
 *
 * Line comments go first: a `//` comment can itself contain `/*` in ordinary
 * text (this file's own docblock does, a few lines up), and stripping block
 * comments first would read that as an opening delimiter and swallow real
 * code beneath it. Block-comment removal keeps the comment's newlines so line
 * numbers computed on the stripped text still match the original file.
 */
function stripComments(src: string): string {
  const withoutLineComments = src
    .split('\n')
    .map((line) => line.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
    .join('\n')
  return withoutLineComments.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ''))
}

// The returned mock runs as cleanup: an expression-bodied arrow whose body IS
// the reset/clear/restore call hands vitest the mock itself as its afterEach.
// A block body `{ ... }` returns undefined and is fine — it is excluded on
// purpose by requiring the body to start with an identifier, not `{`.
const RESET_HOOK_RE =
  /\b(beforeEach|afterEach|beforeAll|afterAll)\(\s*\(\)\s*=>\s*[\w$.]+?\.mock(Reset|Clear|Restore)\(\)\s*\)/g

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (/\.test\.tsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
}

const FILES = ROOTS.flatMap((root) => {
  const found: string[] = []
  walk(root, found)
  return found
}).filter((f) => f !== GUARD_FILE)

describe('A4: no settings test hands vitest the mock as its own cleanup', () => {
  it('has files to check', () => {
    // An empty list would make every case below pass vacuously — a moved or
    // renamed directory would silently retire the guard instead of failing it.
    expect(FILES.length).toBeGreaterThan(10)
  })

  it.each(FILES)('%s', (full) => {
    const src = stripComments(readFileSync(full, 'utf8'))
    const matches = [...src.matchAll(RESET_HOOK_RE)]
    const rel = relative(REPO_ROOT, full)
    const locations = matches.map((m) => `${rel}:${src.slice(0, m.index).split('\n').length}`)
    expect(locations, 'hands vitest the mock as its own cleanup — wrap it in a block body').toEqual([])
  })

  describe('regex fixtures (the shape itself, not this repo\'s files)', () => {
    it('catches the expression-bodied arrow', () => {
      const hits = [...'beforeEach(() => updateSite.mockClear())'.matchAll(RESET_HOOK_RE)]
      expect(hits).toHaveLength(1)
    })

    it('does not catch a block-bodied arrow', () => {
      const hits = [...'beforeEach(() => { updateSite.mockClear() })'.matchAll(RESET_HOOK_RE)]
      expect(hits).toHaveLength(0)
    })

    it('does not catch the same shape written in a comment', () => {
      const src = stripComments('// beforeEach(() => updateSite.mockClear())\nconst x = 1')
      const hits = [...src.matchAll(RESET_HOOK_RE)]
      expect(hits).toHaveLength(0)
    })

    it('also catches the afterEach / mockReset / mockRestore variants', () => {
      expect([...'afterEach(() => hook.mockReset())'.matchAll(RESET_HOOK_RE)]).toHaveLength(1)
      expect([...'beforeAll(() => spy.mockRestore())'.matchAll(RESET_HOOK_RE)]).toHaveLength(1)
    })
  })
})
