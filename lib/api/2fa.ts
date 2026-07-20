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

// Disable 2FA is a pure second-factor operation: id-backend's Disable2FAHandler
// validates a TOTP code OR a single-use recovery code and IGNORES the password
// field entirely (totp.go:246-298). Send only the second factor — the derived
// `_passwordDerived` from Facet is intentionally unused (kept in the signature so
// the shared component's callback shape is satisfied).
export async function disable2FA(_passwordDerived: string, secondFactor: { totp_code?: string; recovery_code?: string }): Promise<void> {
  return apiRequest<void>('/auth/2fa/disable', {
    method: 'POST',
    body: JSON.stringify({ ...secondFactor }),
  })
}

// Recovery-code regeneration requires a TOTP code (RegenerateRecoveryCodesHandler,
// totp.go:302-368 — password is bound-but-unused). Mirrors disable2FA's 2-arg
// shape; only the second factor is sent. The backend's regenerate path accepts a
// TOTP code only (no recovery_code field), so `recovery_code` here is a no-op.
export async function regenerateRecoveryCodes(_passwordDerived: string, secondFactor: { totp_code?: string; recovery_code?: string }): Promise<RegenerateCodesResponse> {
  return apiRequest<RegenerateCodesResponse>('/auth/2fa/recovery', {
    method: 'POST',
    body: JSON.stringify({ ...secondFactor }),
  })
}
