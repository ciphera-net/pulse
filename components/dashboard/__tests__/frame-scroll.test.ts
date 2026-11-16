import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// `.frame-scroll` is a rule of the app's own stylesheet, not a Tailwind utility: nothing generates it, so deleting it
// leaves every user with a capped height and nothing that scrolls. That happened on 16-11-2026 (#1034 took the rule
// away with the Events block's list, and the Filter menu's 50 rows ran 1,328 px out of its 472 px box over the page).
// A class like this is held here, in both directions, for as long as anything uses it.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '../../..')
const css = fs.readFileSync(path.join(ROOT, 'styles/globals.css'), 'utf8')
const users = ['components', 'app'].flatMap((top) =>
  (fs.readdirSync(path.join(ROOT, top), { recursive: true }) as string[])
    .filter((name) => /\.tsx?$/.test(name) && !name.includes('__tests__'))
    .map((name) => path.join(top, name))
    .filter((name) => /\bframe-scroll\b/.test(fs.readFileSync(path.join(ROOT, name), 'utf8'))),
)

describe('.frame-scroll', () => {
  it('has users today: the Filter menu\'s list', () => {
    expect(users).toContain(path.join('components', 'dashboard', 'filter', 'search', 'SearchFilter.tsx'))
  })

  it('is defined in the stylesheet, and it scrolls', () => {
    const rule = css.match(/\.frame-scroll\s*\{([^}]*)\}/)
    expect(rule, 'styles/globals.css must define .frame-scroll while a component uses it').not.toBeNull()
    expect(rule![1]).toMatch(/overflow-y:\s*auto/)
    expect(rule![1]).toMatch(/overscroll-behavior:\s*contain/)
  })
})
