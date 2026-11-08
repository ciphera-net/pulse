// @vitest-environment node
//
// The directory as lib/team-names/api.ts reads it (design §6.2): a row of mine carries its recipient,
// the recipient key id, the name tag and sealed_hash, the SHA-256 of the row as the server stores it,
// each at its exact size. A row of mine with any of them missing or the wrong size is dropped with a
// coded warning, so the reconcile treats it as missing and seals afresh. The email directory (§16.3)
// is read with the same discipline, and its writes answer as the names' do.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }))
vi.mock('@/lib/api/client', async (importActual) => ({ ...(await importActual<object>()), default: apiRequest }))

import { fetchDirectory, fetchEmailDirectory, publishKey, resetKey, withdrawEmails, writeEmails } from '../api'
import { ApiError } from '@/lib/api/client'

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

describe('the key routes', () => {
  const key = { publicKey: bytes(65, 4), sealedPrivateKey: bytes(219, 5) }
  const KEY_ROW = { key_id: b64(bytes(32, 6)), public_key: b64(bytes(65, 4)), sealed_private_key: b64(bytes(219, 5)) }

  it('POST /me/team-key sends no proof, and takes the client\'s refresh-and-retry like any other request (R72)', async () => {
    apiRequest.mockResolvedValueOnce(KEY_ROW)
    // Even handed a token, the first key's POST carries none.
    await publishKey({ ...key, reauthToken: 'tmk-token' } as Parameters<typeof publishKey>[0])
    expect(apiRequest).toHaveBeenCalledTimes(1)
    const [path, options] = apiRequest.mock.calls[0]
    expect(path).toBe('/me/team-key')
    expect(options).toMatchObject({ method: 'POST', skipAuthRetry: false })
    expect(JSON.parse(options.body)).toEqual({ public_key: KEY_ROW.public_key, sealed_private_key: KEY_ROW.sealed_private_key })
  })

  it('PUT /me/team-key carries the reset\'s proof and never takes the client\'s refresh-and-retry on a 401', async () => {
    apiRequest.mockResolvedValueOnce(KEY_ROW)
    await resetKey({ ...key, reauthToken: 'tmk-token' })
    expect(apiRequest).toHaveBeenCalledTimes(1)
    const [path, options] = apiRequest.mock.calls[0]
    expect(path).toBe('/me/team-key')
    expect(options).toMatchObject({ method: 'PUT', skipAuthRetry: true })
    expect(JSON.parse(options.body)).toMatchObject({ reauth_token: 'tmk-token' })
  })

  it('reads a 401 reauth_required on the reset as the proof refused, so it asks for the password again', async () => {
    apiRequest.mockRejectedValueOnce(new ApiError('Session expired', 401, { error: 'reauth_required' }))
    await expect(resetKey({ ...key, reauthToken: 'tmk-token' })).rejects.toMatchObject({ code: 'team_names/reauth_required' })
  })

  it('reads any other refusal as a failed request, keeping its cause', async () => {
    const refused = new ApiError('Bad request', 400, { error: 'invalid_key' })
    apiRequest.mockRejectedValueOnce(refused)
    await expect(publishKey(key)).rejects.toMatchObject({ code: 'team_names/request_failed', cause: refused })
  })
})

describe('the team-emails routes (design §16.3)', () => {
  const D = 'd4d4d4d4-0000-4000-8000-000000000004'
  const key = (id: string) => ({ user_id: id, public_key: b64(bytes(65, 4)) })
  const forMeRow = (overrides: Record<string, unknown> = {}) => ({ sender_id: C, sender_key_id: b64(bytes(32, 5)), recipient_key_id: b64(bytes(32, 6)), sealed: b64(bytes(594, 7)), ...overrides })
  const emailMine = (overrides: Record<string, unknown> = {}) => ({ recipient_id: B, recipient_key_id: b64(bytes(32, 1)), email_tag: b64(bytes(16, 2)), sealed_hash: b64(bytes(32, 3)), ...overrides })

  it('reads the keys, the recipients, the rows for me and mine, past every cache, at its own path', async () => {
    apiRequest.mockResolvedValueOnce({ keys: [key(B), key(C)], recipients: [{ user_id: B }], for_me: [forMeRow()], mine: [emailMine()] })
    const warn = vi.fn()
    const answer = await fetchEmailDirectory(TEAM.toUpperCase(), warn)
    expect(apiRequest).toHaveBeenCalledWith(`/organizations/${TEAM}/team-emails`, { cache: 'no-store' })
    expect(answer).toEqual({
      kind: 'directory',
      directory: {
        keys: [{ userId: B, publicKey: bytes(65, 4) }, { userId: C, publicKey: bytes(65, 4) }],
        recipients: [B],
        forMe: [{ senderId: C, senderKeyId: bytes(32, 5), recipientKeyId: bytes(32, 6), sealed: bytes(594, 7) }],
        mine: [{ recipientId: B, recipientKeyId: bytes(32, 1), emailTag: bytes(16, 2), sealedHash: bytes(32, 3) }],
      },
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it.each([
    ['a recipient that is not a uuid', { recipients: [{ user_id: 'not-a-uuid' }, { user_id: D }] }, (d: { recipients: string[] }) => expect(d.recipients).toEqual([D])],
    ['an email tag of 15 bytes', { mine: [emailMine({ email_tag: b64(bytes(15, 2)) }), emailMine({ recipient_id: C })] }, (d: { mine: { recipientId: string }[] }) => expect(d.mine.map((r) => r.recipientId)).toEqual([C])],
    ['an email tag of 17 bytes', { mine: [emailMine({ email_tag: b64(bytes(17, 2)) }), emailMine({ recipient_id: C })] }, (d: { mine: { recipientId: string }[] }) => expect(d.mine.map((r) => r.recipientId)).toEqual([C])],
    ['a name tag where the email tag goes', { mine: [emailMine({ email_tag: undefined, name_tag: b64(bytes(16, 2)) }), emailMine({ recipient_id: C })] }, (d: { mine: { recipientId: string }[] }) => expect(d.mine.map((r) => r.recipientId)).toEqual([C])],
    ['a sealed hash of 31 bytes', { mine: [emailMine({ sealed_hash: b64(bytes(31, 3)) }), emailMine({ recipient_id: C })] }, (d: { mine: { recipientId: string }[] }) => expect(d.mine.map((r) => r.recipientId)).toEqual([C])],
    ['a key of 64 bytes', { keys: [{ user_id: B, public_key: b64(bytes(64, 4)) }, key(C)] }, (d: { keys: { userId: string }[] }) => expect(d.keys.map((k) => k.userId)).toEqual([C])],
    ['a row for me with no sender key id', { for_me: [forMeRow({ sender_key_id: undefined }), forMeRow({ sender_id: D })] }, (d: { forMe: { senderId: string }[] }) => expect(d.forMe.map((r) => r.senderId)).toEqual([D])],
  ] as const)('drops %s, with one coded warning, and keeps the rest', async (_what, overrides, check) => {
    apiRequest.mockResolvedValueOnce({ keys: [], recipients: [], for_me: [], mine: [], ...overrides })
    const warn = vi.fn()
    const answer = await fetchEmailDirectory(TEAM, warn)
    if (answer.kind !== 'directory') throw new Error(answer.kind)
    check(answer.directory as never)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toBe('team_names/malformed')
  })

  it.each([
    ['recipients', { keys: [], for_me: [], mine: [] }],
    ['a list that is null', { keys: [], recipients: null, for_me: [], mine: [] }],
    ['keys', { recipients: [], for_me: [], mine: [] }],
  ])('refuses an answer without %s', async (_what, body) => {
    apiRequest.mockResolvedValueOnce(body)
    await expect(fetchEmailDirectory(TEAM, vi.fn())).rejects.toMatchObject({ code: 'team_names/invalid_response' })
  })

  it('answers too_large over 500 members, unavailable for the router\'s 404, and a failed request otherwise', async () => {
    apiRequest.mockRejectedValueOnce(new ApiError('Unprocessable', 422, { error: 'too_large' }))
    expect(await fetchEmailDirectory(TEAM, vi.fn())).toEqual({ kind: 'too_large' })
    apiRequest.mockResolvedValueOnce({ error: 'too_large' })
    expect(await fetchEmailDirectory(TEAM, vi.fn())).toEqual({ kind: 'too_large' })
    apiRequest.mockRejectedValueOnce(new ApiError('Not found', 404))
    expect(await fetchEmailDirectory(TEAM, vi.fn())).toEqual({ kind: 'unavailable' })
    const down = new ApiError('Server error', 503)
    apiRequest.mockRejectedValueOnce(down)
    await expect(fetchEmailDirectory(TEAM, vi.fn())).rejects.toMatchObject({ code: 'team_names/request_failed', cause: down })
    await expect(fetchEmailDirectory('not-a-team', vi.fn())).rejects.toMatchObject({ code: 'team_names/invalid_id' })
  })

  it('writes the entries as the server reads them, and answers a 409 as a conflict to read again on', async () => {
    const entry = { recipientId: B, recipientKeyId: bytes(32, 1), senderKeyId: bytes(32, 2), emailTag: bytes(16, 3), sealed: bytes(594, 4) }
    apiRequest.mockResolvedValueOnce(null)
    expect(await writeEmails(TEAM, [entry])).toEqual({ kind: 'written' })
    const [path, options] = apiRequest.mock.calls[0]
    expect(path).toBe(`/organizations/${TEAM}/team-emails`)
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({
      entries: [{ recipient_id: B, recipient_key_id: b64(bytes(32, 1)), sender_key_id: b64(bytes(32, 2)), email_tag: b64(bytes(16, 3)), sealed: b64(bytes(594, 4)) }],
    })
    apiRequest.mockRejectedValueOnce(new ApiError('Conflict', 409, { error: 'entries_refused', refused: [{ recipient_id: B, reason: 'not_admin' }] }))
    expect(await writeEmails(TEAM, [entry])).toEqual({ kind: 'conflict' })
    const limited = new ApiError('Too many', 429)
    apiRequest.mockRejectedValueOnce(limited)
    await expect(writeEmails(TEAM, [entry])).rejects.toMatchObject({ code: 'team_names/request_failed', cause: limited })
  })

  it('takes every address row back with DELETE /me/team-emails', async () => {
    apiRequest.mockResolvedValueOnce(null)
    await withdrawEmails()
    expect(apiRequest).toHaveBeenCalledWith('/me/team-emails', { method: 'DELETE' })
    apiRequest.mockRejectedValueOnce(new ApiError('Server error', 500))
    await expect(withdrawEmails()).rejects.toMatchObject({ code: 'team_names/request_failed' })
  })
})
