import apiRequest from './client'

export interface TrustedDevice {
  id: string
  display_hint: string
  first_seen_at: string
  last_seen_at: string
  is_current: boolean
}

export async function getUserDevices(): Promise<{ devices: TrustedDevice[] }> {
  return apiRequest<{ devices: TrustedDevice[] }>('/auth/user/devices')
}

export async function removeDevice(deviceId: string): Promise<void> {
  return apiRequest<void>(`/auth/user/devices/${deviceId}`, {
    method: 'DELETE',
  })
}
