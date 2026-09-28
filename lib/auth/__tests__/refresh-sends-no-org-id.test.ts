import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * PULSE OWNS TEAM WRITES NOW (Phase 5, PULSE-92). `app/api/auth/refresh/route.ts`
 * never forwards `organization_id` to id-backend any more — its own tests pin
 * that. This file pins the OTHER half: the browser must stop sending an
 * `org_id` to that route in the first place.
 *
 * 🔴 Before this, `refreshToken()` still read the cached user's `org_id` and
 * put it on every refresh POST — harmless today only because the route
 * discards it, but it means nothing watching outbound client traffic (rather
 * than only what the route forwards upstream) can ever observe "nothing sends
 * organization_id any more" converge to zero, and it is dead plumbing for a
 * mechanism (`switchContext`/the ID bridge) this phase deleted everywhere else.
 *
 * ⚠️ Source-text, same reason as vault-pii-in-context.test.ts: `AuthProvider`
 * is not renderable without standing up half the app, and mocking that would
 * measure the mocks.
 */
describe('refreshToken sends no org_id to /api/auth/refresh', () => {
  const SRC = readFileSync(join(__dirname, '../context.tsx'), 'utf8')
    .split('\n')
    .map((l) => l.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')

  const refreshFn = SRC.slice(
    SRC.indexOf('const refreshToken = useCallback'),
    SRC.indexOf('const login = ('),
  )

  it('does not read a cached org_id to send with the refresh', () => {
    expect(refreshFn).not.toMatch(/lastOrgId/)
  })

  it('never puts org_id on the POST body', () => {
    expect(refreshFn).not.toMatch(/org_id/)
  })

  it('posts only the device signals', () => {
    expect(refreshFn).toMatch(/body:\s*JSON\.stringify\(signals\(\)\)/)
  })
})
