import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The provider's organization wall switches the session's org context in two
 * places: when it provisions a first workspace, and when a session with
 * workspaces but no context is moved onto the first one. Both must purge the
 * SWR cache the way every other org-context switch does.
 *
 * 🔴 THE BUG THIS GUARDS (PULSE-59). The shared org list
 * (lib/swr/organizations.ts) is keyed by user, not org. A page that fetched it
 * before the wall provisioned holds the empty answer; without the purge the
 * new workspace never reached the user menu and the team-state signal stayed
 * wrong until a full reload.
 *
 * ⚠️ Source-text, like vault-pii-in-context.test.ts: rendering AuthProvider
 * needs half the app mocked, and that measures the mocks.
 */
const SRC = readFileSync(join(__dirname, '../context.tsx'), 'utf8')
  .split('\n')
  .map((l) => l.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/.*$/, ''))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

const PURGE = /swrMutate\(\(\) => true, undefined, \{ revalidate: true \}\)/

function branchAfter(marker: RegExp): string {
  const start = SRC.search(marker)
  expect(start).toBeGreaterThan(-1)
  const rest = SRC.slice(start)
  const end = rest.indexOf('router.refresh()')
  expect(end).toBeGreaterThan(-1)
  return rest.slice(0, end)
}

describe('the organization wall purges the cache when it switches org context', () => {
  it('after provisioning a first workspace', () => {
    expect(branchAfter(/await ensureDefaultOrganization\(\)/)).toMatch(PURGE)
  })

  it('after moving a session with no context onto its first workspace', () => {
    expect(branchAfter(/switchContext\(firstOrg\.organization_id\)/)).toMatch(PURGE)
  })
})
