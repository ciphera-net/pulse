import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * On load, AuthProvider asks Pulse's /me which team this device is on and, when
 * the device's cookie is missing or stale, aligns it with activateTeam — whose
 * first step tells Ciphera ID (the bridge kept until Phase 5 of option E).
 *
 * 🔴 A failed bridge must not leave the device with NO team. On a first load
 * there is no cookie to fall back to, so the outer catch would set the active
 * team to null and every team-scoped request would answer TEAM_REQUIRED. Pulse
 * decides the team from the header regardless of what ID was told, so the team
 * /me chose is kept locally when only the bridge failed.
 *
 * Source-text, like org-wall-cache-purge.test.ts and vault-pii-in-context.test.ts:
 * rendering AuthProvider needs half the app mocked, and that measures the mocks.
 */
const SRC = readFileSync(join(__dirname, '../context.tsx'), 'utf8')
  .split('\n')
  .map((l) => l.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/.*$/, ''))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

describe('the load-time team alignment survives a failed bridge to Ciphera ID', () => {
  it('wraps the bridge in its own try and keeps the chosen team in its catch', () => {
    const at = SRC.search(/await activateTeam\(active\)/)
    expect(at).toBeGreaterThan(-1)
    const before = SRC.slice(Math.max(0, at - 120), at)
    expect(before).toMatch(/try \{\s*$/)
    const after = SRC.slice(at, at + 400)
    const catchAt = after.search(/\} catch \(\w+\) \{/)
    expect(catchAt).toBeGreaterThan(-1)
    expect(after.slice(catchAt)).toMatch(/setActiveTeamAction\(active\)/)
  })

  it('still sets the chosen team after the bridge, whatever it answered', () => {
    const at = SRC.search(/await activateTeam\(active\)/)
    const after = SRC.slice(at, at + 700)
    expect(after).toMatch(/setActiveTeam\(active\)/)
  })
})
