import { describe, it, expect } from 'vitest'
import { shouldProvisionWorkspace } from '../organization'

/**
 * A new account gets a workspace made for it, so nobody meets a "name your
 * organisation" form before seeing the product. Exactly one person must NOT:
 * somebody arriving on an invite link, who is seconds from belonging to
 * somebody else's workspace and would otherwise be left owning a stray one
 * forever, named after nothing they chose.
 *
 * The server cannot make this call — only Pulse knows an invite is pending —
 * so this rule is ours to keep, and it is tested rather than trusted.
 */
describe('shouldProvisionWorkspace', () => {
  it('does not provision for someone on their way to accept an invite', () => {
    expect(shouldProvisionWorkspace('/join/abc123')).toBe(false)
    expect(shouldProvisionWorkspace('/join')).toBe(false)
  })

  it('provisions for every ordinary destination', () => {
    for (const target of ['/', '/sites', '/settings/account/general', '/sites/new']) {
      expect(shouldProvisionWorkspace(target)).toBe(true)
    }
  })

  it('provisions when there is no destination at all', () => {
    // The common case: an organic signup with nothing stored and no ?returnTo.
    expect(shouldProvisionWorkspace(null)).toBe(true)
    expect(shouldProvisionWorkspace(undefined)).toBe(true)
    expect(shouldProvisionWorkspace('')).toBe(true)
  })

  it('is not fooled by a path that merely mentions joining', () => {
    // Only the /join route is the invite flow. A sites page about "joins"
    // or a workspace whose slug starts with "join" is an ordinary landing.
    expect(shouldProvisionWorkspace('/sites/joined-up')).toBe(true)
    expect(shouldProvisionWorkspace('/settings/organization/members')).toBe(true)
  })
})
