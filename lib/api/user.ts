import apiRequest from './client'

export async function deleteAccount(password: string): Promise<void> {
  // This goes to ciphera-auth
  return apiRequest<void>('/auth/user', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  })
}

export interface Session {
  id: string
  client_ip: string
  user_agent: string
  created_at: string
  expires_at: string
  is_current: boolean
}

export async function getUserSessions(): Promise<{ sessions: Session[] }> {
  // Current session is identified server-side via the httpOnly refresh token cookie
  return apiRequest<{ sessions: Session[] }>('/auth/user/sessions')
}

export async function revokeSession(sessionId: string): Promise<void> {
  return apiRequest<void>(`/auth/user/sessions/${sessionId}`, {
    method: 'DELETE',
  })
}

export interface UserPreferences {
  email_notifications: {
    new_file_received: boolean
    file_downloaded: boolean
    login_alerts: boolean
    password_alerts: boolean
    two_factor_alerts: boolean
  }
}

export async function updateUserPreferences(preferences: UserPreferences): Promise<void> {
  return apiRequest<void>('/auth/user/preferences', {
    method: 'PUT',
    body: JSON.stringify(preferences),
  })
}

export async function updateDisplayName(displayName: string): Promise<void> {
  return apiRequest<void>('/auth/user/display-name', {
    method: 'PUT',
    body: JSON.stringify({ display_name: displayName }),
  })
}
