import apiRequest, { ApiError, type SendOptions } from './client'

/**
 * A browser signed in to the account (ciphera-id device identity, migration
 * 079). This replaced two lists: "trusted devices" (one row per IP address —
 * 37 identical "Chrome on macOS" rows on one account) and "active sessions"
 * (one row per refresh token, 263 on one account, every row "Unknown device"
 * because this API read fields the server never sent). Now every row is a
 * browser, and signing one out ends every session it holds, in every app.
 */
export interface Device {
  id: string
  display_hint: string
  is_current: boolean
  /** Sessions minted before device identity existed, grouped by browser label
   *  and fingerprint rather than a real device. Age out on their own. */
  legacy: boolean
  /** Client ids with a live session on this browser: "id" is Ciphera ID
   *  itself, "pulse-app" Pulse, "warden" Warden, "link" Link. */
  apps: string[]
  signed_in_at: string
  last_active_at: string
  sessions: number
  first_seen_at: string
  last_seen_at: string
}

export interface DevicesResponse {
  devices: Device[]
  /** False when this browser could not be named. "Sign out of every other
   *  device" must stay hidden then: without knowing what to spare it would
   *  sign the caller out of the browser they are using. */
  current_device_known: boolean
}

export async function listDevices(): Promise<DevicesResponse> {
  return apiRequest<DevicesResponse>('/auth/user/devices')
}

export interface SignOutDeviceResult {
  message: string
  sessions_revoked: number
  /** True when the signed-out browser was the one making this request. */
  this_device: boolean
}

export async function signOutDevice(deviceId: string, send: SendOptions = {}): Promise<SignOutDeviceResult> {
  return apiRequest<SignOutDeviceResult>(`/auth/user/devices/${deviceId}`, {
    method: 'DELETE',
    keepalive: send.keepalive,
  })
}

export interface SignOutOthersResult {
  message: string
  sessions_revoked: number
}

/**
 * Ends every session on the account except this browser's. Refused with 409
 * `current_device_unknown` when this browser cannot be named.
 */
export async function signOutOtherDevices(): Promise<SignOutOthersResult> {
  return apiRequest<SignOutOthersResult>('/auth/user/devices/sign-out-others', {
    method: 'POST',
  })
}

/** True for the 409 signOutOtherDevices refuses with when this browser isn't
 *  recognised yet. */
export function isCurrentDeviceUnknown(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    err.status === 409 &&
    (err.data as { code?: string } | undefined)?.code === 'current_device_unknown'
  )
}
