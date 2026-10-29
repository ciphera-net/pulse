import apiRequest from './client'

/**
 * POST /auth/user/avatar-seed on Ciphera ID (PUL-21): replaces the account's
 * avatar seed with a fresh random one and returns it. There is no body: the
 * server generates the seed, so a client can never choose one (a chosen seed
 * could copy a teammate's avatar). An `/auth` path goes to Ciphera ID with the
 * session's Bearer token, like every other account call.
 */
export async function regenerateAvatarSeed(): Promise<string> {
  const res = await apiRequest<{ avatar_seed?: string }>('/auth/user/avatar-seed', { method: 'POST' })
  if (!res?.avatar_seed) throw new Error("Couldn't generate a new avatar. Try again.")
  return res.avatar_seed
}
