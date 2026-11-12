import { describe, it, expect, vi, beforeEach } from 'vitest'

// performOpaqueReauth must drive the SAME OPAQUE ceremony as login but against the
// dedicated re-auth endpoint (basePath '/auth/reauth'), and return the server-minted
// reauth_token from the finish body — WITHOUT decrypting any vault.
//
// We keep the REAL makeOpaqueTransport (so the basePath wiring + finish capture are
// exercised end-to-end) and mock only:
//   - '@/lib/api/client' authFetch → per-path canned bodies (asserts the exact paths)
//   - './init' ensureTessera → no-op
//   - '@ciphera-net/tessera' Tessera → a stand-in whose login() calls the transport's
//     loginStart/loginFinish, then attempts getWrap('opaque') and throws when absent,
//     faithfully reproducing the real SDK's "no opaque VMK wrap" post-ceremony throw.
//
// The impl returns a benign {} for any unrecognised path (never throws) so a stray
// vitest-internal invocation can't manufacture an unhandled rejection; the assertions
// inspect the RECORDED calls instead.

vi.mock('@/lib/api/client', () => ({ authFetch: vi.fn() }))
vi.mock('../init', () => ({ ensureTessera: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@ciphera-net/tessera', () => {
  class Tessera {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transport: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(t: any) {
      this.transport = t
    }
    async login() {
      await this.transport.loginStart({ requestB64: 'req', credentialId: 'cid' })
      await this.transport.loginFinish({ loginId: 'lid', finalizationB64: 'fin' })
      // Real SDK behaviour: after the AKE it opens the vault. The re-auth endpoint
      // returns no wrap, so this throws — AFTER reauth_token was captured on finish.
      const wrap = await this.transport.getWrap({ credentialId: 'cid', method: 'opaque' })
      if (!wrap) throw new Error('tessera: no opaque VMK wrap for this account')
      return { vault: {} }
    }
  }
  return { Tessera }
})

import { authFetch } from '@/lib/api/client'
import { performOpaqueReauth, performSessionOpaqueReauth, performTeamKeyReauth } from '../opaque-reauth'

const authFetchSpy = vi.mocked(authFetch)

describe('performOpaqueReauth', () => {
  beforeEach(() => authFetchSpy.mockClear())

  it('posts start/finish to /auth/reauth/* and returns the minted token', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authFetchSpy.mockImplementation(async (...args: any[]) => {
      const path = args[0]
      if (path === '/auth/reauth/start') return { login_id: 'lid', response_b64: 'resp' }
      if (path === '/auth/reauth/finish') return { reauth_token: 'tok-abc123' }
      return {}
    })

    const token = await performOpaqueReauth({
      email: 'user@example.com',
      password: 'hunter2',
      blindIndex: 'bi-123',
      purpose: 'del',
    })

    expect(token).toBe('tok-abc123')
    const paths = authFetchSpy.mock.calls.map((c) => c[0])
    expect(paths).toContain('/auth/reauth/start')
    expect(paths).toContain('/auth/reauth/finish')
    // Never touches the primary login endpoints.
    expect(paths.some((p) => typeof p === 'string' && p.includes('/auth/opaque/login'))).toBe(false)
  })

  it('throws (loud-fail) when the finish body carries no reauth_token', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authFetchSpy.mockImplementation(async (...args: any[]) => {
      const path = args[0]
      if (path === '/auth/reauth/start') return { login_id: 'lid', response_b64: 'resp' }
      if (path === '/auth/reauth/finish') return {} // mint failed → no token
      return {}
    })

    await expect(
      performOpaqueReauth({ email: 'user@example.com', password: 'hunter2', blindIndex: 'bi-123', purpose: 'del' })
    ).rejects.toThrow()
  })

  it('re-throws a ceremony failure (bad password → finish rejects) with no token', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authFetchSpy.mockImplementation(async (...args: any[]) => {
      const path = args[0]
      if (path === '/auth/reauth/start') return { login_id: 'lid', response_b64: 'resp' }
      if (path === '/auth/reauth/finish') throw new Error('bad password 401')
      return {}
    })

    await expect(
      performOpaqueReauth({ email: 'user@example.com', password: 'wrong', blindIndex: 'bi-123', purpose: 'del' })
    ).rejects.toThrow('bad password 401')
  })
})

/**
 * The team-names proof (design §6.3, R57): the session ceremony with purpose `tmk`. Ciphera ID
 * stores "<purpose>:<userID>" with the token, so only pulse-backend's consume for this person and
 * this purpose can spend it.
 */
describe('performSessionOpaqueReauth with purpose tmk', () => {
  beforeEach(() => authFetchSpy.mockClear())

  it('rides "tmk" on the finish body, sends no blind index, and returns the token', async () => {
    const sent: Record<string, unknown> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authFetchSpy.mockImplementation(async (...args: any[]) => {
      const path = args[0]
      const body = args[1]?.body ? JSON.parse(args[1].body) : {}
      if (path === '/auth/reauth/start') {
        sent.blindIndex = body.blind_index
        return { login_id: 'lid', response_b64: 'resp' }
      }
      if (path === '/auth/reauth/finish') {
        sent.purpose = body.purpose
        return { reauth_token: 'tmk-tok' }
      }
      return {}
    })
    await expect(performSessionOpaqueReauth({ password: 'hunter2', purpose: 'tmk' })).resolves.toBe('tmk-tok')
    expect(sent).toEqual({ blindIndex: '', purpose: 'tmk' })
  })
})

/**
 * The reset's ceremony also answers what Ciphera ID knows of the person's vault-proof key (team names design §17.5):
 * whether it holds one, and a ticket to register one, which the reset uses on its way (§17.7).
 */
describe('performTeamKeyReauth', () => {
  beforeEach(() => authFetchSpy.mockClear())

  function wireFinish(finish: Record<string, unknown>, sent: Record<string, unknown> = {}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authFetchSpy.mockImplementation(async (...args: any[]) => {
      const path = args[0]
      const body = args[1]?.body ? JSON.parse(args[1].body) : {}
      if (path === '/auth/reauth/start') return { login_id: 'lid', response_b64: 'resp' }
      if (path === '/auth/reauth/finish') {
        sent.purpose = body.purpose
        return finish
      }
      return {}
    })
  }

  it('rides "tmk" and returns the token with what the answer said about the proof key', async () => {
    const sent: Record<string, unknown> = {}
    wireFinish({ reauth_token: 'tmk-tok', vault_proof_registered: false, vault_proof_ticket: 'the-ticket' }, sent)
    await expect(performTeamKeyReauth({ password: 'hunter2' })).resolves.toEqual({
      reauthToken: 'tmk-tok',
      proofKey: { registered: false, ticket: 'the-ticket' },
    })
    expect(sent.purpose).toBe('tmk')
  })

  it('reads an answer without the fields as one that says nothing, and no ticket', async () => {
    wireFinish({ reauth_token: 'tmk-tok' })
    await expect(performTeamKeyReauth({ password: 'hunter2' })).resolves.toEqual({
      reauthToken: 'tmk-tok',
      proofKey: { registered: null, ticket: null },
    })
  })

  it('still refuses to resolve without a token', async () => {
    wireFinish({ vault_proof_registered: true, vault_proof_ticket: 'the-ticket' })
    await expect(performTeamKeyReauth({ password: 'hunter2' })).rejects.toThrow()
  })
})
