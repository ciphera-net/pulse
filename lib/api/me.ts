import { authFetch } from './client'

/**
 * GET /api/v1/me (Phase 2, PULSE-89) — pulse-backend's own answer to "who is
 * this and which teams do they belong to". This is the membership TRUTH:
 * Ciphera ID still mints the org_id/role claims in the access token (it stays
 * the writer of teams and memberships until Phase 5), but the dashboard's
 * active team is decided here, not by decoding that token.
 *
 * `name`/`slug` may be null — a membership that healed in from the token's
 * own claim (see the backend's tombstone-gated UpsertOrgMemberBySlug) can
 * arrive before the async push from Ciphera ID has filled them in.
 */
export interface MeTeam {
  id: string
  name: string | null
  slug: string | null
  role: string
  onboarding_completed_at: string | null
  last_active_at: string | null
  joined_at: string
}

export interface MeResponse {
  user_id: string
  teams: MeTeam[]
  default_team_id: string | null
}

export async function getMe(): Promise<MeResponse> {
  return await authFetch<MeResponse>('/me')
}

/**
 * Pure: which team should be active, given what the browser already
 * preferred. `preferred` wins when it is still a real membership — a stale
 * cookie or an org_id from a token that has since lost its seat must not
 * outrank the server's own list. Falls back to the account's default team,
 * then to `null` when there is genuinely nothing (the zero-teams case the
 * auth context provisions a workspace for).
 */
export function pickActiveTeam(me: MeResponse, preferred: string | null | undefined): string | null {
  if (preferred && me.teams.some((t) => t.id === preferred)) return preferred
  return me.default_team_id ?? null
}

/** Pure: this account's role in `teamId`, or `null` when it is not a member. */
export function teamRole(me: MeResponse, teamId: string): string | null {
  return me.teams.find((t) => t.id === teamId)?.role ?? null
}
