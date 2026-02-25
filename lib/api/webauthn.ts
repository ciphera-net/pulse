/**
 * WebAuthn / Passkey API client for settings (list, register, delete).
 */

import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser'
import apiRequest from './client'

export interface BeginRegistrationResponse {
  sessionId: string
  creationOptions: {
    publicKey: Record<string, unknown>
    mediation?: string
  }
}

export interface PasskeyCredential {
  id: string
  createdAt: string
}

export interface ListPasskeysResponse {
  credentials: PasskeyCredential[]
}

export async function registerPasskey(): Promise<void> {
  const { sessionId, creationOptions } = await apiRequest<BeginRegistrationResponse>(
    '/auth/webauthn/register/begin',
    { method: 'POST' }
  )
  const optionsJSON = creationOptions?.publicKey
  if (!optionsJSON) {
    throw new Error('Invalid registration options')
  }
  const response = await startRegistration({
    optionsJSON: optionsJSON as unknown as PublicKeyCredentialCreationOptionsJSON,
  })
  await apiRequest<{ message: string }>('/auth/webauthn/register/finish', {
    method: 'POST',
    body: JSON.stringify({ sessionId, response }),
  })
}

export async function listPasskeys(): Promise<ListPasskeysResponse> {
  return apiRequest<ListPasskeysResponse>('/auth/webauthn/credentials', {
    method: 'GET',
  })
}

export async function deletePasskey(credentialId: string): Promise<void> {
  return apiRequest<void>(
    `/auth/webauthn/credentials/${encodeURIComponent(credentialId)}`,
    { method: 'DELETE' }
  )
}
