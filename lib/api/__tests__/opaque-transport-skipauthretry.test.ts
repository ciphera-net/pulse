import { describe, it, expect, vi, beforeEach } from 'vitest'

// Part (a): the tessera OPAQUE transport's defaultPost MUST tag every POST with
// skipAuthRetry:true. Public OPAQUE endpoints are unauthenticated — a 401 means a
// bad password / require_2fa, NOT an expired access token — so the auto-refresh
// retry has to be suppressed, otherwise it burns the single-use OPAQUE login state.
//
// makeOpaqueTransport imports { authFetch } from '@/lib/api/client', so we replace
// that module with a spy and inspect the exact options defaultPost passes.
vi.mock('@/lib/api/client', () => ({ authFetch: vi.fn() }))

import { authFetch } from '@/lib/api/client'
import { makeOpaqueTransport } from '@/lib/auth/tessera/transport'

const authFetchSpy = vi.mocked(authFetch)

describe('OPAQUE transport defaultPost — skipAuthRetry', () => {
  beforeEach(() => authFetchSpy.mockReset())

  it('posts loginStart with method POST + skipAuthRetry:true', async () => {
    authFetchSpy.mockResolvedValue({ login_id: 'lid', response_b64: 'resp' })
    const transport = makeOpaqueTransport({ blindIndex: 'bi', mode: 'login' })

    await transport.loginStart({ requestB64: 'req', credentialId: 'cid' })

    expect(authFetchSpy).toHaveBeenCalledTimes(1)
    const [path, options] = authFetchSpy.mock.calls[0]
    expect(path).toBe('/auth/opaque/login/start')
    expect(options).toMatchObject({ method: 'POST', skipAuthRetry: true })
  })

  it('posts loginFinish with method POST + skipAuthRetry:true', async () => {
    authFetchSpy.mockResolvedValue({ user_id: 'u1', session_key_b64: 'sk' })
    const transport = makeOpaqueTransport({ blindIndex: 'bi', mode: 'login' })

    await transport.loginFinish({ loginId: 'lid', finalizationB64: 'fin' })

    expect(authFetchSpy).toHaveBeenCalledTimes(1)
    const [path, options] = authFetchSpy.mock.calls[0]
    expect(path).toBe('/auth/opaque/login/finish')
    expect(options).toMatchObject({ method: 'POST', skipAuthRetry: true })
  })

  it('posts registerStart with method POST + skipAuthRetry:true', async () => {
    authFetchSpy.mockResolvedValue({ credential_id: 'sc', response_b64: 'resp' })
    const transport = makeOpaqueTransport({ blindIndex: 'bi', mode: 'settings' })

    await transport.registerStart({ requestB64: 'req', credentialId: 'cid' })

    const [path, options] = authFetchSpy.mock.calls[0]
    expect(path).toBe('/auth/opaque/register/start')
    expect(options).toMatchObject({ method: 'POST', skipAuthRetry: true })
  })
})
