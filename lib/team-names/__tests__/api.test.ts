// @vitest-environment node
//
// The directory as lib/team-names/api.ts reads it (design §6.2): a row of mine carries its recipient,
// the recipient key id, the name tag and sealed_hash, the SHA-256 of the row as the server stores it,
// each at its exact size. A row of mine with any of them missing or the wrong size is dropped with a
// coded warning, so the reconcile treats it as missing and seals afresh.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }))
vi.mock('@/lib/api/client', async (importActual) => ({ ...(await importActual<object>()), default: apiRequest }))

import { fetchDirectory } from '../api'

const TEAM = '7e7e7e7e-0000-4000-8000-000000000001'
const B = 'b2b2b2b2-0000-4000-8000-000000000002'
const C = 'c3c3c3c3-0000-4000-8000-000000000003'
const bytes = (n: number, fill: number) => new Uint8Array(n).fill(fill)
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64')

function mineRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { recipient_id: B, recipient_key_id: b64(bytes(32, 1)), name_tag: b64(bytes(16, 2)), sealed_hash: b64(bytes(32, 3)), ...overrides }
}

beforeEach(() => {
  apiRequest.mockReset()
})

describe('fetchDirectory: the rows of mine', () => {
  it('reads sealed_hash at exactly 32 bytes, and asks past every cache', async () => {
    apiRequest.mockResolvedValueOnce({ keys: [], for_me: [], mine: [mineRow()] })
    const warn = vi.fn()
    const answer = await fetchDirectory(TEAM, warn)
    expect(apiRequest).toHaveBeenCalledWith(`/organizations/${TEAM}/team-names`, { cache: 'no-store' })
    expect(answer).toEqual({
      kind: 'directory',
      directory: { keys: [], forMe: [], mine: [{ recipientId: B, recipientKeyId: bytes(32, 1), nameTag: bytes(16, 2), sealedHash: bytes(32, 3) }] },
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it.each([
    ['31 bytes', { sealed_hash: b64(bytes(31, 3)) }],
    ['33 bytes', { sealed_hash: b64(bytes(33, 3)) }],
    ['absent, with the enc the old shape carried in its place', { sealed_hash: undefined, enc: b64(bytes(65, 4)) }],
    ['not base64', { sealed_hash: 'not*base64' }],
  ])('drops a row whose sealed_hash is %s, with a coded warning', async (_what, overrides) => {
    apiRequest.mockResolvedValueOnce({ keys: [], for_me: [], mine: [mineRow(overrides), mineRow({ recipient_id: C })] })
    const warn = vi.fn()
    const answer = await fetchDirectory(TEAM, warn)
    expect(answer.kind === 'directory' && answer.directory.mine.map((r) => r.recipientId)).toEqual([C])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('team_names/malformed', { userId: B })
  })
})
