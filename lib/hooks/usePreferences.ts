'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { useAuth } from '@/lib/auth/context'
import apiRequest from '@/lib/api/client'
import { logger } from '@/lib/utils/logger'
import { DEFAULT_THEME, isTheme, type Theme } from '@/lib/theme'

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

/**
 * How this person wants INSTANTS rendered (migration 188, design 18-09-2026):
 * each site's own timezone (the default, in step with its daily bars), the
 * browser's zone at render time, or UTC. A mode, never a stored IANA zone.
 */
export type TimeDisplay = 'site' | 'local' | 'utc'
export const TIME_DISPLAY_MODES: readonly TimeDisplay[] = ['site', 'local', 'utc'] as const
export const DEFAULT_TIME_DISPLAY: TimeDisplay = 'site'

function isTimeDisplay(v: unknown): v is TimeDisplay {
  return typeof v === 'string' && (TIME_DISPLAY_MODES as readonly string[]).includes(v)
}

export interface UserPreferences {
  tour_completed_at: string | null
  recovery_prompt_dismissed_at: string | null
  /** Optional on the wire: a backend that predates migration 188 omits it. */
  time_display?: TimeDisplay
  /** Optional on the wire: a backend that predates migration 190 omits it. */
  theme?: Theme
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

  // Unlike the stamps this has NO 'unknown' state: while the fetch is in
  // flight, rendering in site time is the default and therefore never wrong,
  // only not yet personalised. An unrecognised value (a newer backend, a
  // corrupted row) also reads as the default rather than breaking every stamp.
  const timeDisplay: TimeDisplay = isTimeDisplay(data?.time_display) ? data.time_display : DEFAULT_TIME_DISPLAY

  // The account's theme, or null while it is not known. Deliberately NOT
  // defaulted like timeDisplay: ThemeSync must tell "the account says dark"
  // apart from "not loaded yet", or it would overwrite a device's cached
  // 'light' cookie with 'dark' on every cold load before the fetch lands. An
  // unrecognised value from a newer backend reads as the default.
  const theme: Theme | null = data === undefined ? null : isTheme(data.theme) ? data.theme : DEFAULT_THEME

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
        time_display: data?.time_display,
        theme: data?.theme,
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

  /**
   * Change the display mode. Optimistic like `stamp`, and the server MERGES, so
   * this never touches a stamp. Returns false on failure so the control can
   * say so; the optimistic value is rolled back to the server's truth.
   */
  const setTimeDisplay = useCallback(
    async (mode: TimeDisplay): Promise<boolean> => {
      if (!userId) return false
      const previous = data
      void mutate({ ...(data ?? { tour_completed_at: null, recovery_prompt_dismissed_at: null }), time_display: mode }, false)
      try {
        const saved = await apiRequest<UserPreferences>('/me/preferences', {
          method: 'PUT',
          body: JSON.stringify({ time_display: mode }),
        })
        void mutate(saved, false)
        return true
      } catch (err) {
        logger.error('Could not save the time display preference', err)
        void mutate(previous, false)
        return false
      }
    },
    [userId, data, mutate]
  )

  /**
   * Change the colour theme. Optimistic, so the page switches on click; the
   * optimistic value is what ThemeSync applies. Returns false on failure so the
   * control can say so, and rolls back to the server's truth, which switches the
   * page back: a theme that looks saved but isn't would revert on the next device.
   */
  const setTheme = useCallback(
    async (next: Theme): Promise<boolean> => {
      if (!userId) return false
      const previous = data
      void mutate({ ...(data ?? { tour_completed_at: null, recovery_prompt_dismissed_at: null }), theme: next }, false)
      try {
        const saved = await apiRequest<UserPreferences>('/me/preferences', {
          method: 'PUT',
          body: JSON.stringify({ theme: next }),
        })
        void mutate(saved, false)
        return true
      } catch (err) {
        logger.error('Could not save the theme preference', err)
        void mutate(previous, false)
        return false
      }
    },
    [userId, data, mutate]
  )

  return { preferences: data, loaded, tourCompleted, recoveryPromptDismissed, timeDisplay, theme, stamp, setTimeDisplay, setTheme, mutate }
}
