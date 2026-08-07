import apiRequest from '@/lib/api/client'

/**
 * An issued API key, as the server is willing to describe it.
 *
 * There is no `token` field and there never will be one: the server stores only
 * a SHA-256 digest, so the token exists in readable form exactly once — in the
 * response to createApiKey — and cannot be recovered afterwards.
 */
export interface ApiKey {
  id: string
  name: string
  key_prefix: string
  key_last4: string
  role_id: string
  scope_all_sites: boolean
  site_ids: string[]
  expires_at: string
  /** null means never used — not a zero date, and not the creation time. */
  last_used_at: string | null
  /** null means live. */
  revoked_at: string | null
  created_at: string
}

export interface CreateApiKeyResponse {
  api_key: ApiKey
  /** Shown once, then unrecoverable. */
  token: string
  warning: string
}

export type ApiKeyExpiry = 30 | 90 | 365

export const listApiKeys = () =>
  apiRequest<{ api_keys: ApiKey[] }>('/api-keys')

export const createApiKey = (data: {
  name: string
  role_id: string
  expires_in_days: ApiKeyExpiry
  scope_all_sites: boolean
  site_ids: string[]
}) =>
  apiRequest<CreateApiKeyResponse>('/api-keys', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const revokeApiKey = (keyId: string) =>
  apiRequest<{ revoked: boolean }>(`/api-keys/${keyId}`, { method: 'DELETE' })

/**
 * Live means usable right now. Revocation wins over a future expiry, matching
 * the server's APIKey.IsLive so the badge cannot disagree with the API.
 */
export function isApiKeyLive(key: ApiKey): boolean {
  if (key.revoked_at) return false
  return new Date(key.expires_at).getTime() > Date.now()
}

export function apiKeyStatus(key: ApiKey): 'revoked' | 'expired' | 'live' {
  if (key.revoked_at) return 'revoked'
  if (new Date(key.expires_at).getTime() <= Date.now()) return 'expired'
  return 'live'
}
