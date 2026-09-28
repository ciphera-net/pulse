import { switchContext } from '@/lib/api/organization'
import { setActiveTeamAction, setSessionAction } from '@/app/actions/auth'
import { setAccessToken, setActiveTeam } from '@/lib/api/client'

/** What a successful activation hands back — the session's own shape, for callers that still need it. */
export interface ActivateTeamResult {
  user: { id: string; email: string; totp_enabled: boolean; org_id?: string; role?: string }
}

/**
 * Make `teamId` this browser's active team (Phase 2, PULSE-89) — the one
 * named in every `X-Pulse-Team` header, without navigating.
 *
 * Two steps, and their order is the contract:
 *
 * (a) 🔴 BRIDGE UNTIL PHASE 5 (design §6(b), §7 Phase 2). Ciphera ID is still
 *     the WRITER of teams and memberships, and pulse-backend heals a
 *     membership miss through the token's OWN claim — so ID's claim must keep
 *     naming whatever team the dashboard is actually showing, or the heal
 *     stops working and `TEAM_RESOLUTION=claim` stops being a real rollback.
 *     `switchContext` mints a token scoped to `teamId`, `setSessionAction`
 *     stores it in Pulse's own cookie (a failure here throws — the next page
 *     load would otherwise come back on the OLD team), and `setAccessToken`
 *     primes the in-memory Bearer pulse-api actually reads. Phase 5 deletes
 *     this half.
 * (b) Pulse records its OWN preference: `setActiveTeam` for the running tab
 *     (what `X-Pulse-Team` sends from now on) and `setActiveTeamAction` for
 *     the `pulse_team` cookie (what the next page load starts from).
 *
 * 🔴 SERIALISED (Fix 2, PULSE-89 review). Two calls that overlap — the team
 * recovery handler and a person clicking the switcher at the same moment —
 * could otherwise interleave their two-step writes: recovery's
 * switchContext/setSessionAction landing BETWEEN the person's own two steps
 * would leave the cookie naming one team and the in-memory Bearer/active-team
 * naming another. `teamActivationChain` makes every call wait for the
 * PREVIOUS one to fully settle — success or failure — before it starts its
 * own two steps; they never overlap, and a rejected call never blocks the
 * next one (see `activateTeamNow`'s failure-neutralising link below).
 */
let teamActivationChain: Promise<void> = Promise.resolve()

export function activateTeam(teamId: string | null): Promise<ActivateTeamResult> {
  const run = teamActivationChain.then(() => activateTeamNow(teamId))
  // * Whatever `run` does, the NEXT caller's turn must still arrive — a
  // * rejection here must never propagate into the chain itself, or every
  // * activateTeam call after a failed one would wait forever. `run` itself
  // * is returned to THIS caller unmodified, so its own rejection is still
  // * visible to whoever awaits it.
  teamActivationChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function activateTeamNow(teamId: string | null): Promise<ActivateTeamResult> {
  const { access_token } = await switchContext(teamId)
  const stored = await setSessionAction(access_token)
  if (!stored.success) throw new Error('The switched session could not be stored')
  setAccessToken(access_token)

  setActiveTeam(teamId)
  await setActiveTeamAction(teamId)

  return { user: stored.user }
}

/**
 * Move this browser's Pulse session to another team, WITHOUT navigating.
 *
 * `activateTeam` does the switch (its own two-step contract, above); `refresh()`
 * (AuthProvider's) then re-hydrates the user from the new team and clears
 * EVERY SWR key, refetching the mounted ones under it. That IS the cache purge.
 *
 * 🔴 Nothing cache-wide may run after `refresh()` — see lib/swr/org-switch.ts
 * for why a second purge empties the app.
 *
 * Callers decide what happens next. The top bar's switcher goes home; the
 * MCP consent page (/connect, PULSE-41) must NOT leave the page, because the
 * pending connection request lives in its URL and a navigation would strand
 * the assistant that is waiting on it.
 */
export async function switchOrganizationSession(orgId: string, refresh: () => Promise<void>): Promise<void> {
  await activateTeam(orgId)
  await refresh()
}
