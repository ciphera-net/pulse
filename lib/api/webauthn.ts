/**
 * WebAuthn / Passkey API client for settings (list, rename, delete).
 *
 * Enrolment does NOT live here. It is a crypto ceremony — OPAQUE re-auth, a VMK
 * re-wrap, a WebAuthn create with the PRF extension — not an HTTP call, and it
 * lives in `lib/auth/tessera/passkey-enrol.ts` next to the other ceremonies.
 * The thin `registerPasskey()` that used to sit here posted `{ sessionId,
 * response }` and nothing else, which against the hardened id-backend handler
 * is a 401 and against the old one wrote a WRAPLESS row: a passkey the user
 * believes is passwordless that can never open their vault.
 */

import apiRequest from './client'

export interface PasskeyCredential {
  id: string
  /** camelCase for Facet's `ProfileSettings`, mapped in `listPasskeys` below. */
  createdAt: string
  display_name?: string | null
  prf_enabled?: boolean
}

export interface ListPasskeysResponse {
  credentials: PasskeyCredential[]
}

/** The wire shape id-backend actually sends (`WebAuthnCredentialInfo`, Go). */
interface PasskeyCredentialWire {
  id: string
  created_at: string
  display_name?: string | null
  prf_enabled?: boolean
}

export async function listPasskeys(): Promise<ListPasskeysResponse> {
  const res = await apiRequest<{ credentials?: PasskeyCredentialWire[] }>('/auth/webauthn/credentials', {
    method: 'GET',
  })
  // 🔴 The date is MAPPED here, not read straight through. id-backend sends
  // `created_at` (snake_case, like every other field it emits); Facet's
  // ProfileSettings prop contract is `createdAt`. Passing the raw body meant
  // `pk.createdAt` was always undefined and every passkey row rendered a blank
  // date — silently, because an empty string is a legal date cell.
  //
  // Mapped in the ADAPTER rather than taught to Facet, deliberately: Facet is a
  // design system consumed by three apps and has no business knowing one
  // backend's wire casing, and teaching it to accept both names would create a
  // second list of field names to keep in sync. This also ships today, where a
  // Facet change would need a publish and a lockfile bump in every consumer
  // before it was live anywhere.
  return {
    credentials: (res?.credentials ?? []).map((c) => ({
      id: c.id,
      createdAt: c.created_at,
      display_name: c.display_name,
      prf_enabled: c.prf_enabled,
    })),
  }
}

export async function deletePasskey(credentialId: string): Promise<void> {
  return apiRequest<void>(`/auth/webauthn/credentials/${encodeURIComponent(credentialId)}`, {
    method: 'DELETE',
  })
}

/** Rename a passkey. The name is the only thing that tells two credentials
 *  apart in the list — the id is a base64url handle and the date is just a date
 *  — so this is what makes a second enrolled device safe to manage. */
export async function renamePasskey(credentialId: string, displayName: string): Promise<void> {
  return apiRequest<void>(`/auth/webauthn/credentials/${encodeURIComponent(credentialId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ display_name: displayName }),
  })
}
