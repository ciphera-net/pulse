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

// Delete authorization is a server-side single-use re-auth token (Slice 4): the
// the caller drives a fresh OPAQUE ceremony against id-backend's dedicated
// `/auth/reauth/*` endpoint, which mints the token bound to the session user. We
// forward that token as `reauth_token`; the delete handler GETDELs it and requires
// `tokenUserID == sessionUserID` before any state mutation. The old `password`
// placeholder (a vestigial `len=64` bind field the handler never read) is retired.
/** One workspace deletion would take with the account, as the server reports it. */
export interface DeletionBlocker {
  id: string
  name: string
  slug: string
  member_count: number
  other_admins: number
  action_required: 'transfer_ownership' | 'delete_workspace'
  promotable_admins: string[]
  /**
   * What the workspace holds.
   *
   * 🔴 `undefined` means the server COULD NOT ASK — never "the workspace is
   * empty". Rendering the two alike would tell somebody they are about to lose
   * nothing, immediately before they lose three sites, so every consumer must
   * branch on it explicitly.
   */
  contents?: {
    site_count: number
    domains: string[]
    plan_id?: string
    subscription_status?: string
  }
}

/**
 * What deleting this account would take with it, read BEFORE anything is typed.
 *
 * 🔑 The same read the refusal uses. Pulse could list its own organizations
 * instead, but then the screen a person agrees to and the check that enforces it
 * would be two answers, free to drift apart.
 */
export async function getDeletionPreview(): Promise<DeletionBlocker[]> {
  const res = await apiRequest<{ organizations?: DeletionBlocker[] }>('/auth/user/deletion-preview')
  return res.organizations ?? []
}

export async function deleteAccount(reauthToken: string, organizationIds: string[] = []): Promise<void> {
  // Loud-fail: never POST an empty token (the ceremony returning "" means the mint
  // failed — the caller must retry a fresh ceremony, not send a blank credential).
  if (!reauthToken) throw new Error('Re-authentication token missing')
  // This goes to ciphera-id
  try {
    await apiRequest<void>('/auth/user', {
      method: 'DELETE',
      // 🔴 The ids are an ECHO of what the person was SHOWN, not a "yes to
      // everything" flag. A workspace that appeared after the panel was drawn is
      // not in this list, so the server refuses again and shows the new one,
      // rather than destroying something nobody agreed to.
      body: JSON.stringify({ reauth_token: reauthToken, delete_organizations: organizationIds }),
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

/**
 * The PUT body. Every key is REQUIRED here on purpose: the write replaces the
 * whole `email_notifications` block, so a partial body silently resets
 * whatever it leaves out.
 *
 * ⚠️ The READ is not this shape. Since ciphera-id#64 id-backend omits a
 * security-alert key it has never been given a value for, so that "never
 * chosen" stays distinguishable from "switched off" — absent means ON and the
 * sender treats it that way. Hydrate a UI from a defaults spread
 * (AccountSecurityAlertsTab does), never by reading one of those keys direct.
 * The auth-context type still declares them required because Facet's
 * ProfileSettings prop type does; that surface has notifications suppressed
 * and never reads them, so it is a naming mismatch rather than a live bug.
 */
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

// 🔴 `updateDisplayName` IS GONE, not merely unused. It POSTed
// `{display_name}` to `PUT /auth/user/display-name`, which requires an
// `encrypted_vault` and treats `display_name` as wire compatibility it never
// reads — so it answered `400 {"error":"Missing required field"}` every single
// time, on both surfaces that called it.
//
// The name lives INSIDE the encrypted vault (migration 045 dropped the column),
// so saving one means re-sealing the vault, which needs the vault key. That now
// exists: `lib/auth/vault-restore.ts` → `saveDisplayName(userId, name)`, and it
// is the only implementation. Leaving this function here "until the callers
// move" is exactly how it stayed broken on two surfaces at once.

// ---------------------------------------------------------------------------
// The two-stage email change (ceremonies design §9/§10).
//
// Stage 1 (`performEmailChangeRequest`, lib/auth/tessera/email-change.ts) is a
// crypto ceremony and lives with the other ceremonies. What is left here is the
// plain session-authed half: asking whether a link is live, killing it, and
// re-mailing it.
// ---------------------------------------------------------------------------

/** A live confirmation link, as the SERVER reports it. */
export interface PendingEmailChange {
  /**
   * When the link dies, absolute and UTC.
   *
   * 🔑 `null` means the server reported a pending change without a horizon.
   * Rendering that as "expires in 0 minutes" would be a countdown the server
   * never gave — say the change is pending and leave the clock out.
   */
  expiresAt: string | null
}

/**
 * Is an email change in flight?
 *
 * 🔴 THREE OUTCOMES, and they must not collapse:
 *   - `null`      — nothing is pending. The server looked and found none.
 *   - an object   — a link is live until `expiresAt`.
 *   - **a throw** — we could not find out. NEVER render this as "nothing
 *     pending": a Redis blip, a 401, or a backend that predates the endpoint
 *     would then tell somebody their change is not in flight while their link
 *     sits live in an inbox.
 *
 * The same discipline `DeletionBlocker.contents` follows for "empty" versus
 * "could not ask", on the same screen.
 */
export async function getPendingEmailChange(): Promise<PendingEmailChange | null> {
  const res = await apiRequest<{ pending?: boolean; expires_at?: string }>(
    '/auth/user/email/pending',
  )
  if (!res?.pending) return null
  return { expiresAt: res.expires_at ?? null }
}

/**
 * Kill the live link server-side. This is a CANCEL, not a dismiss: the mailed
 * link stops working immediately, not merely in this tab. Idempotent — the
 * server answers 200 when there was nothing to cancel.
 */
export async function cancelEmailChange(): Promise<void> {
  await apiRequest<void>('/auth/user/email/cancel', { method: 'POST' })
}

/**
 * Re-mail the SAME link. The ref is stable, so resend can never mint a second
 * valid link, and it needs no fresh re-auth: it does not change what the spent
 * one authorised. 404 when nothing is pending.
 */
export async function resendEmailChangeLink(): Promise<void> {
  await apiRequest<void>('/auth/user/email/resend', { method: 'POST' })
}
