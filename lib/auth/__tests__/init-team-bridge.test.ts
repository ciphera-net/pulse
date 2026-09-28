import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * On load, AuthProvider asks Pulse's /me which team this device is on and, when
 * the device's cookie is missing or stale, aligns it with activateTeam — which
 * sets the in-memory active team before it can fail (Phase 5, PULSE-92: the
 * bridge to Ciphera ID that used to run first was deleted).
 *
 * 🔴 A failed cookie write must not leave the device with NO team. activateTeam
 * sets the in-memory active team synchronously, before its only `await` (the
 * cookie action) can reject, so a failure here is never fatal to the load —
 * only logged.
 *
 * Source-text, like org-wall-cache-purge.test.ts and vault-pii-in-context.test.ts:
 * rendering AuthProvider needs half the app mocked, and that measures the mocks.
 */
const SRC = readFileSync(join(__dirname, '../context.tsx'), 'utf8')
  .split('\n')
  .map((l) => l.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/.*$/, ''))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

describe('the load-time team alignment survives a failed cookie write', () => {
  it('wraps activateTeam in its own try and only logs in its catch', () => {
    const at = SRC.search(/await activateTeam\(active\)/)
    expect(at).toBeGreaterThan(-1)
    const before = SRC.slice(Math.max(0, at - 120), at)
    expect(before).toMatch(/try \{\s*$/)
    const after = SRC.slice(at, at + 400)
    const catchAt = after.search(/\} catch \(\w+\) \{/)
    expect(catchAt).toBeGreaterThan(-1)
    expect(after.slice(catchAt)).toMatch(/logger\.error\(/)
  })

  it('still sets the chosen team after activateTeam, whatever it answered', () => {
    const at = SRC.search(/await activateTeam\(active\)/)
    const after = SRC.slice(at, at + 700)
    expect(after).toMatch(/setActiveTeam\(active\)/)
  })
})
