import { setActiveTeamAction } from '@/app/actions/auth'
import { setActiveTeam } from '@/lib/api/client'

/**
 * Make `teamId` this browser's active team (Phase 2, PULSE-89; the bridge to
 * Ciphera ID deleted in Phase 5, PULSE-92) — the one named in every
 * `X-Pulse-Team` header, without navigating.
 *
 * Pulse decides the active team from that header alone now, so this is just
 * Pulse recording its OWN preference: `setActiveTeam` for the running tab
 * (what `X-Pulse-Team` sends from now on) and `setActiveTeamAction` for the
 * `pulse_team` cookie (what the next page load starts from). `setActiveTeam`
 * runs before the only `await` in this function, so the running tab already
 * has the right team even if the cookie write below fails.
 *
 * 🔴 SERIALISED (Fix 2, PULSE-89 review). Two calls that overlap — the team
 * recovery handler and a person clicking the switcher at the same moment —
 * could otherwise interleave: the second call's write landing BETWEEN the
 * first's `setActiveTeam` and its `setActiveTeamAction` would leave the
 * cookie naming one team and the in-memory active team naming another.
 * `teamActivationChain` makes every call wait for the PREVIOUS one to fully
 * settle — success or failure — before it starts its own write; a rejected
 * call never blocks the next one (see the failure-neutralising link below).
 */
let teamActivationChain: Promise<void> = Promise.resolve()

export function activateTeam(teamId: string | null): Promise<void> {
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

async function activateTeamNow(teamId: string | null): Promise<void> {
  setActiveTeam(teamId)
  await setActiveTeamAction(teamId)
}

/**
 * Move this browser's Pulse session to another team, WITHOUT navigating.
 *
 * `activateTeam` does the switch (its own contract, above); `refresh()`
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
