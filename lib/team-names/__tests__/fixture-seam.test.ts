// @vitest-environment node
//
// The made-up team (./fixtures/madeUpTeam.ts) is the TEST-ONLY seam through which the surface tests and the browser
// check of the built pages draw a team that does not exist: the check answers the team-names routes, the members, the
// log and the vault with it at the network, so the build runs unchanged. Nothing the app ships may reach it, which
// this proves the way the HPKE ephemeral-key seam's test does: no file outside a test imports it, and none carries
// one of its made-up ids or names.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AMARA, FORMER_NAME, GONE, JONAS, LENA, MAREN, MADE_UP_PEOPLE, MY_EMAIL, MY_NAME, TOMAS } from './fixtures/madeUpTeam'

const root = fileURLToPath(new URL('../../../', import.meta.url))

/** Every source file the app is built from: no test, no test folder, no fixture. */
function appSources(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (entry === '__tests__') continue
        walk(full)
      } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry)) {
        out.push(full)
      }
    }
  }
  for (const top of ['app', 'components', 'lib', 'hooks']) walk(join(root, top))
  return out
}

describe('the made-up team', () => {
  it('is imported by tests only', () => {
    const files = appSources()
    expect(files.length).toBeGreaterThan(100)
    const offenders = files.filter((f) => /__tests__\/fixtures|madeUpTeam/.test(readFileSync(f, 'utf8'))).map((f) => relative(root, f))
    expect(offenders).toEqual([])
  })

  it('leaves no made-up id or name in anything the app is built from', () => {
    const made = [MAREN, AMARA, JONAS, LENA, TOMAS, GONE, ...MADE_UP_PEOPLE.flatMap((p) => Object.values(p.names)), FORMER_NAME, MY_NAME, MY_EMAIL]
      .filter((v): v is string => typeof v === 'string' && v !== 'Pulse')
    const needles = [...new Set(made.flatMap((v) => (/^[0-9a-f-]{36}$/.test(v) ? [v, v.slice(0, 8)] : [v])))]
    const offenders: string[] = []
    for (const f of appSources()) {
      const body = readFileSync(f, 'utf8')
      for (const n of needles) if (body.includes(n)) offenders.push(`${relative(root, f)}: ${n}`)
    }
    expect(offenders).toEqual([])
  })
})
