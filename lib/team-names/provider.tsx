'use client'

/**
 * Runs end-to-end encrypted team names for the signed-in person (design §5), and members' addresses
 * for owners and admins (§16), and draws nothing.
 *
 * Every team of the person's gets both passes: the names and the addresses. The person's teams come
 * from the /me the dashboard already reads (`teams[]`), under the same SWR key as useFeature.
 * Clearing the display name withdraws every copy at once (DELETE /me/team-names), whether or not a
 * session runs yet, because the privacy policy promises the copies go when the name does (design
 * §5.6, §11).
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
import { TeamNamesSession, type SessionDeps, type TeamNamesSnapshot } from './session'

export interface TeamNamesContextValue {
  /** Null when no session runs: signed out, or not an app route. */
  snapshot: TeamNamesSnapshot | null
  myId: string | null
  activeTeamId: string | null
  reset(password: string): Promise<void>
  /** After the error state: reads the person's key again. */
  retry(): Promise<void>
  /** Account calls this after a display-name save succeeds (design §5.6). */
  nameChanged(name: string): Promise<void>
}

export const TeamNamesContext = createContext<TeamNamesContextValue | null>(null)

/** Coded, development only, and never a name, a row, a key or a token (review L8). */
const warn: Warn = (code, detail) => logger.warn(code, detail?.userId ? { user_id: detail.userId } : undefined)

function defaultDeps(userId: string): SessionDeps {
  return {
    userId,
    api: { fetchOwnKey, publishKey, resetKey, fetchDirectory, fetchMemberIds, writeNames, withdrawNames, fetchEmailDirectory, writeEmails, withdrawEmails },
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

/** The person's teams, in /me's order, or null until /me answers. */
function usePersonTeams(enabled: boolean): readonly string[] | null {
  const { data } = useSWR(enabled ? ME_KEY : null, () => getMe(), { revalidateOnFocus: false, dedupingInterval: 300_000 })
  return useMemo(() => (data ? data.teams.map((t) => t.id) : null), [data])
}

const noSubscription = () => () => {}
const noSnapshot = () => null

export function TeamNamesProvider({ children }: { children: ReactNode }) {
  const { user, vaultState } = useAuth()
  const pathname = usePathname()
  const userId = user?.id ?? null
  const activeTeamId = user?.org_id ?? null
  const onAppRoute = !!pathname && isAuthedAppRoute(pathname)
  const teams = usePersonTeams(!!userId && onAppRoute)
  const epoch = useVaultCustodyEpoch()

  const sessionKey = userId && onAppRoute ? `${userId}|${vaultState}|${epoch}` : null
  // Created in the effect, so Strict Mode's second run gets a new session, never a disposed one; the
  // live session is the held one only while its key is current, so a change of key drops it at once.
  const [held, setHeld] = useState<{ key: string; session: TeamNamesSession } | null>(null)
  useEffect(() => {
    if (!sessionKey || !userId) return
    const next = new TeamNamesSession(defaultDeps(userId))
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

  // The active team, whenever there is one and the key is ready; other teams on a switch.
  const ready = snapshot?.status === 'ready'
  useEffect(() => {
    if (session && ready && activeTeamId) void session.reconcile(activeTeamId)
  }, [session, ready, activeTeamId])

  // A first key this session published (R72): the name and the address go to every team of the person's at once, as
  // the one-time step used to send the name, instead of team by team as each is opened. The active team is reconciled
  // above too; the session's queue runs the two in order.
  const firstKey = snapshot?.firstKey === true
  const firstKeySealed = useRef<TeamNamesSession | null>(null)
  useEffect(() => {
    if (!session || !ready || !firstKey || !teams || teams.length === 0 || firstKeySealed.current === session) return
    firstKeySealed.current = session
    void session.reconcileAll(teams)
  }, [session, ready, firstKey, teams])

  // A reset deletes every row of the old key, names and addresses alike, in every team: both are sealed again.
  const reset = useCallback(async (password: string) => {
    if (!session) throw new TeamNamesError('team_names/not_ready')
    await session.reset(password, teams ?? [])
  }, [session, teams])

  const retry = useCallback(async () => {
    if (session) await session.retry()
  }, [session])

  const nameChanged = useCallback(async (name: string) => {
    if (shareableName(name).kind !== 'name') await withdrawNames()
    if (session) await session.reconcileAll(teams ?? [])
  }, [session, teams])

  const value = useMemo<TeamNamesContextValue>(
    () => ({
      snapshot: session ? snapshot : null,
      myId: userId,
      activeTeamId,
      reset,
      retry,
      nameChanged,
    }),
    [session, snapshot, userId, activeTeamId, reset, retry, nameChanged],
  )

  return <TeamNamesContext.Provider value={value}>{children}</TeamNamesContext.Provider>
}
