import apiRequest from './client'

export interface Setup2FAResponse {
  secret: string
  qr_code: string
}

export interface Verify2FAResponse {
  message: string
  recovery_codes: string[]
}

export interface RegenerateCodesResponse {
  recovery_codes: string[]
}

export async function setup2FA(): Promise<Setup2FAResponse> {
  return apiRequest<Setup2FAResponse>('/auth/2fa/setup', {
    method: 'POST',
  })
}

export async function verify2FA(code: string): Promise<Verify2FAResponse> {
  return apiRequest<Verify2FAResponse>('/auth/2fa/verify', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export async function disable2FA(): Promise<void> {
  return apiRequest<void>('/auth/2fa/disable', {
    method: 'POST',
  })
}

export async function regenerateRecoveryCodes(): Promise<RegenerateCodesResponse> {
  return apiRequest<RegenerateCodesResponse>('/auth/2fa/recovery', {
    method: 'POST',
  })
}
