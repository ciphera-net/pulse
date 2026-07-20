import apiRequest, { ApiError } from './client'

interface OwnsOrgsBody {
  error: 'owns_organizations'
  message?: string
  organizations: Array<{
    id: string
    name: string
    slug: string
    member_count: number
    other_admins: number
    action_required: 'transfer_ownership' | 'delete_workspace'
  }>
}

function isOwnsOrgsBody(b: unknown): b is OwnsOrgsBody {
  if (!b || typeof b !== 'object') return false
  const obj = b as Record<string, unknown>
  return obj.error === 'owns_organizations' && Array.isArray(obj.organizations)
}

export async function deleteAccount(password: string): Promise<void> {
  // This goes to ciphera-id
  try {
    await apiRequest<void>('/auth/user', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    })
  } catch (err) {
    // * B.1 D1: server returns HTTP 409 with a structured list of organizations
    // * the user must transfer or delete before their account can be removed.
    // * Reformat into a human-readable message naming each blocking workspace
    // * so the toast/error surface is actionable instead of showing the
    // * generic server message.
    // * NOTE: Pulse's ApiError stores the parsed body on `.data` (id-frontend
    // * uses `.body`) — this is the only divergence from id-frontend's port.
    if (err instanceof ApiError && err.status === 409 && isOwnsOrgsBody(err.data)) {
      const orgs = err.data.organizations
      const lines = orgs.map((o) => {
        const verb =
          o.action_required === 'transfer_ownership' ? 'transfer ownership' : 'delete workspace'
        return `• ${o.name} — ${verb}`
      })
      const summary =
        orgs.length === 1
          ? `You own 1 workspace that must be resolved first:`
          : `You own ${orgs.length} workspaces that must be resolved first:`
      throw new ApiError(
        `${summary}\n${lines.join('\n')}\n\nGo to Settings → Organizations.`,
        409,
        err.data,
      )
    }
    throw err
  }
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
