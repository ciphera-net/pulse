'use client'

/**
 * Runs end-to-end encrypted team names for the signed-in person (design §5), and members' addresses
 * for owners and admins (§16), and draws nothing.
 *
 * Behind the Unleash betas `team-names` (design §8.1) and `team-emails` (§16.8): with both off in
 * every team of the person, no session exists, nothing runs and no team-names or team-emails route
 * is called. A team's reconcile runs the passes that team has: the names with `team-names`, the
 * addresses with `team-emails`. The flags come from the /me the dashboard already reads
 * (`teams[].features`), under the same SWR key as useFeature. The one exception is deliberate:
 * clearing the display name withdraws every copy (DELETE /me/team-names, mounted outside the flag on
 * the server), because the privacy policy promises the copies go when the name does, whether or not
 * a beta is on (design §5.6, §11).
 *
 * On app routes only (/sites, /settings): a public page (/demo, a share link, the /demo the home page
 * frames) is not a visit, and every surface that names a teammate is on an app route.
 *
 * The session is rebuilt whenever the user id, the vault state or the vault key's custody changes
 * (review L9), so a sign-out in a sibling tab, a definitive rejection and the Lock button all drop
 * the private key and every name and address from memory.
 */

import { createContext, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import { useAuth } from '@/lib/auth/context'
import { isAuthedAppRoute } from '@/lib/auth/appRoutes'
import { getMe } from '@/lib/api/me'
import { ME_KEY } from '@/lib/features'
import { loadVaultKey, onVaultKeyCustodyChange } from '@/lib/auth/vault-store'
import { openVaultWithKey } from '@/lib/auth/vault-restore'
import { shareableName } from '@/lib/crypto/team-names'
import { logger } from '@/lib/utils/logger'
import {
  fetchDirectory,
  fetchEmailDirectory,
  fetchMemberIds,
  fetchOwnKey,
  publishKey,
  resetKey,
  withdrawEmails,
  withdrawNames,
  writeEmails,
  writeNames,
  type Warn,
} from './api'
import { TeamNamesError } from './errors'
import { TeamNamesSession, type SessionDeps, type TeamFlags, type TeamNamesSnapshot } from './session'

/** The Unleash flag, exactly as pulse-backend names it. */
export const TEAM_NAMES_FLAG = 'team-names'
/** The Unleash flag for members' addresses (design §16.8), exactly as pulse-backend names it. */
export const TEAM_EMAILS_FLAG = 'team-emails'

export interface TeamNamesContextValue {
  /** Null when no session runs: signed out, not an app route, or the beta off in every team. */
  snapshot: TeamNamesSnapshot | null
  myId: string | null
  activeTeamId: string | null
  /** The beta is on for the active team. */
  activeFlagged: boolean
  /** The beta is on in at least one of the person's teams, so their name reaches teammates (Account says so). */
  anyFlagged: boolean
  /** The team-emails beta is on for the active team. Its addresses are drawn for its owners and admins only (R74). */
  activeEmailsFlagged: boolean
  /** The team-emails beta is on in at least one of the person's teams, so their address reaches those teams' owners and admins (Account says so). */
  anyEmailsFlagged: boolean
  reset(password: string): Promise<void>
  /** After the error state: reads the person's key again. */
  retry(): Promise<void>
  /** Account calls this after a display-name save succeeds (design §5.6). */
  nameChanged(name: string): Promise<void>
}

export const TeamNamesContext = createContext<TeamNamesContextValue | null>(null)

/** Coded, development only, and never a name, a row, a key or a token (review L8). */
const warn: Warn = (code, detail) => logger.warn(code, detail?.userId ? { user_id: detail.userId } : undefined)

function defaultDeps(userId: string, flagsFor: (teamId: string) => TeamFlags): SessionDeps {
  return {
    userId,
    api: { fetchOwnKey, publishKey, resetKey, fetchDirectory, fetchMemberIds, writeNames, withdrawNames, fetchEmailDirectory, writeEmails, withdrawEmails },
    flagsFor,
    loadVaultKey,
    readVault: openVaultWithKey,
    // The OPAQUE re-auth ceremony with purpose `tmk` (design §6.3), loaded when a reset runs: a first key needs none (R72).
    prove: async (password) => (await import('@/lib/auth/tessera/opaque-reauth')).performSessionOpaqueReauth({ password, purpose: 'tmk' }),
    warn,
  }
}

/** Counts this tab's vault key saves and forgets; part of the session key (see vault-store). */
function useVaultCustodyEpoch(): number {
  const [epoch, setEpoch] = useState(0)
  useEffect(() => onVaultKeyCustodyChange(() => setEpoch((n) => n + 1)), [])
  return epoch
}

/** The person's teams with each beta, in /me's order. */
interface FlaggedTeams {
  /** With `team-names`. */
  names: readonly string[]
  /** With `team-emails`. */
  emails: readonly string[]
  /** With either: the teams a session reconciles. */
  any: readonly string[]
}

/** The teams in which each beta is on for this person, or null until /me answers. */
function useFlaggedTeams(enabled: boolean): FlaggedTeams | null {
  const { data } = useSWR(enabled ? ME_KEY : null, () => getMe(), { revalidateOnFocus: false, dedupingInterval: 300_000 })
  return useMemo(() => {
    if (!data) return null
    const has = (flag: string) => data.teams.filter((t) => t.features?.includes(flag)).map((t) => t.id)
    const either = data.teams.filter((t) => t.features?.includes(TEAM_NAMES_FLAG) || t.features?.includes(TEAM_EMAILS_FLAG))
    return { names: has(TEAM_NAMES_FLAG), emails: has(TEAM_EMAILS_FLAG), any: either.map((t) => t.id) }
  }, [data])
}

const noSubscription = () => () => {}
const noSnapshot = () => null

export function TeamNamesProvider({ children }: { children: ReactNode }) {
  const { user, vaultState } = useAuth()
  const pathname = usePathname()
  const userId = user?.id ?? null
  const activeTeamId = user?.org_id ?? null
  const onAppRoute = !!pathname && isAuthedAppRoute(pathname)
  const flagged = useFlaggedTeams(!!userId && onAppRoute)
  const epoch = useVaultCustodyEpoch()
  const anyFlagged = !!flagged && flagged.names.length > 0
  const activeFlagged = !!activeTeamId && !!flagged?.names.includes(activeTeamId)
  const anyEmailsFlagged = !!flagged && flagged.emails.length > 0
  const activeEmailsFlagged = !!activeTeamId && !!flagged?.emails.includes(activeTeamId)

  // Each reconcile asks for its team's betas as they are then, so the session follows a beta switched on or off.
  const flaggedNow = useRef<FlaggedTeams | null>(flagged)
  useEffect(() => {
    flaggedNow.current = flagged
  }, [flagged])

  const sessionKey = userId && onAppRoute && (anyFlagged || anyEmailsFlagged) ? `${userId}|${vaultState}|${epoch}` : null
  // Created in the effect, so Strict Mode's second run gets a new session, never a disposed one; the
  // live session is the held one only while its key is current, so a change of key drops it at once.
  const [held, setHeld] = useState<{ key: string; session: TeamNamesSession } | null>(null)
  useEffect(() => {
    if (!sessionKey || !userId) return
    const flagsFor = (teamId: string): TeamFlags => ({
      names: !!flaggedNow.current?.names.includes(teamId),
      emails: !!flaggedNow.current?.emails.includes(teamId),
    })
    const next = new TeamNamesSession(defaultDeps(userId, flagsFor))
    setHeld({ key: sessionKey, session: next })
    return () => next.dispose()
  }, [sessionKey, userId])
  const session = held && held.key === sessionKey && !held.session.isDisposed ? held.session : null

  const snapshot = useSyncExternalStore(
    session ? session.subscribe : noSubscription,
    session ? session.getSnapshot : noSnapshot,
    noSnapshot,
  )

  // Session start, once this browser knows whether it holds the vault (design §5.2).
  useEffect(() => {
    if (session && vaultState !== 'unknown') void session.start()
  }, [session, vaultState])

  // The active team, whenever it has either beta and the key is ready (again when a beta there changes, for the passes
  // it now has); other teams on a switch.
  const ready = snapshot?.status === 'ready'
  useEffect(() => {
    if (session && ready && (activeFlagged || activeEmailsFlagged) && activeTeamId) void session.reconcile(activeTeamId)
  }, [session, ready, activeFlagged, activeEmailsFlagged, activeTeamId])

  // A first key this session published (R72): the name and the address go to every team with either beta at once, as
  // the one-time step used to send the name, instead of team by team as each is opened. The active team is reconciled
  // above too; the session's queue runs the two in order.
  const firstKey = snapshot?.firstKey === true
  const firstKeySealed = useRef<TeamNamesSession | null>(null)
  useEffect(() => {
    if (!session || !ready || !firstKey || !flagged || flagged.any.length === 0 || firstKeySealed.current === session) return
    firstKeySealed.current = session
    void session.reconcileAll(flagged.any)
  }, [session, ready, firstKey, flagged])

  // A reset deletes every row of the old key, names and addresses alike, in every team: both are sealed again.
  const reset = useCallback(async (password: string) => {
    if (!session) throw new TeamNamesError('team_names/not_ready')
    await session.reset(password, flagged?.any ?? [])
  }, [session, flagged])

  const retry = useCallback(async () => {
    if (session) await session.retry()
  }, [session])

  const nameChanged = useCallback(async (name: string) => {
    if (shareableName(name).kind !== 'name') await withdrawNames()
    if (session) await session.reconcileAll(flagged?.names ?? [])
  }, [session, flagged])

  const value = useMemo<TeamNamesContextValue>(
    () => ({
      snapshot: session ? snapshot : null,
      myId: userId,
      activeTeamId,
      activeFlagged,
      anyFlagged,
      activeEmailsFlagged,
      anyEmailsFlagged,
      reset,
      retry,
      nameChanged,
    }),
    [session, snapshot, userId, activeTeamId, activeFlagged, anyFlagged, activeEmailsFlagged, anyEmailsFlagged, reset, retry, nameChanged],
  )

  return <TeamNamesContext.Provider value={value}>{children}</TeamNamesContext.Provider>
}
