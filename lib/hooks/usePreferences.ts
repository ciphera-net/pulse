'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { useAuth } from '@/lib/auth/context'
import apiRequest from '@/lib/api/client'
import { logger } from '@/lib/utils/logger'

/**
 * Per-user UI state that belongs to the ACCOUNT, not to a browser profile.
 *
 * 🔴 WHY THIS EXISTS. "Has this person seen the product tour?" used to be
 * answered by `localStorage['pulse_tour_done_' + userId]`, which answers a
 * question about a browser. Deleting a workspace ran a bare
 * `localStorage.clear()` and wiped it; a second computer never had it. Both
 * read to the owner as the tour restarting itself.
 *
 * Server truth is pulse-backend's `user_preferences` row (migration 180), read
 * once per session through this hook's shared SWR key.
 */

export interface UserPreferences {
  tour_completed_at: string | null
  recovery_prompt_dismissed_at: string | null
  updated_at?: string | null
}

/**
 * A stamp has THREE states, and collapsing them is the bug this hook exists to
 * prevent:
 *
 *  - `'unknown'` — the fetch has not resolved. Nothing may act on it. Treating
 *    it as `'no'` auto-opens the tour over the dashboard on every cold load.
 *  - `'no'` — read from the server, genuinely not stamped.
 *  - `'yes'` — stamped.
 */
export type StampState = 'unknown' | 'no' | 'yes'

function stateOf(value: string | null | undefined, loaded: boolean): StampState {
  if (!loaded) return 'unknown'
  return value ? 'yes' : 'no'
}

export function usePreferences() {
  const { user } = useAuth()
  const userId = user?.id

  // Keyed by USER — the whole point. An org switch or an org deletion changes
  // nothing here, which is what makes the tour stop restarting. The shared key
  // means every mounted consumer rides one fetch per session.
  const { data, error, mutate } = useSWR<UserPreferences>(
    userId ? ['user-preferences', userId] : null,
    () => apiRequest<UserPreferences>('/me/preferences'),
    { revalidateOnFocus: false, revalidateIfStale: false, dedupingInterval: 300_000 }
  )

  // `error` counts as loaded on purpose. Against a backend that predates these
  // routes (a rollback), `data` stays undefined forever, and a permanently
  // 'unknown' tour is a tour that never runs again for anybody. On an error we
  // fall back to what the browser remembers, which is the old behaviour — worse
  // than server truth, better than silence.
  const loaded = data !== undefined || error !== undefined

  const tourCompleted: StampState = stateOf(data?.tour_completed_at, loaded)
  const recoveryPromptDismissed: StampState = stateOf(data?.recovery_prompt_dismissed_at, loaded)

  /**
   * Stamp one or more preferences. Optimistic: the caller's UI must not wait on
   * a network round trip to close a dialog or end an overlay.
   *
   * The server MERGES, so sending one field never clears another. A failure is
   * logged and reported to the caller rather than swallowed — the visible cost
   * is that the prompt returns next session, which is confusing but not
   * damaging, and silently pretending it saved is how it would stay broken.
   */
  const stamp = useCallback(
    async (patch: Partial<Pick<UserPreferences, 'tour_completed_at' | 'recovery_prompt_dismissed_at'>>): Promise<boolean> => {
      if (!userId) return false
      const optimistic: UserPreferences = {
        tour_completed_at: data?.tour_completed_at ?? null,
        recovery_prompt_dismissed_at: data?.recovery_prompt_dismissed_at ?? null,
        ...patch,
      }
      void mutate(optimistic, false)
      try {
        const saved = await apiRequest<UserPreferences>('/me/preferences', {
          method: 'PUT',
          body: JSON.stringify(patch),
        })
        void mutate(saved, false)
        return true
      } catch (err) {
        logger.error('Could not save a user preference', err)
        return false
      }
    },
    [userId, data, mutate]
  )

  return { preferences: data, tourCompleted, recoveryPromptDismissed, stamp, mutate }
}
