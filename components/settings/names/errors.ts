import { readStatus } from '@/lib/api/status'
import { isTeamNamesError } from '@/lib/team-names/errors'
import { ID_DOWN, NO_CONNECTION, TOO_MANY, isNetworkError } from '@/components/settings/pages/account/errors'
import { NAMES_WORDS } from './words'

/**
 * The one-time step's and the reset's failures in the copy deck's words (§14.6, §14.7). The session says which side
 * failed (lib/team-names/session.ts): the password itself, Ciphera ID's proof, or pulse-backend's key route, so "Ciphera
 * ID" is never blamed for something Pulse refused.
 */

/** The step asks for the password again after these; any other failure left the session in its error state. */
export function asksForPassword(err: unknown): boolean {
  return isTeamNamesError(err, 'team_names/password_failed') || isTeamNamesError(err, 'team_names/reauth_required')
}

function keyStepError(err: unknown, refused: string): string {
  if (isTeamNamesError(err, 'team_names/password_failed')) return NAMES_WORDS.wrongPassword
  // Ciphera ID refused the proof when pulse-backend spent it (expired, spent, another purpose).
  if (isTeamNamesError(err, 'team_names/reauth_required')) return NAMES_WORDS.notConfirmed
  const cause = isTeamNamesError(err) ? err.cause : err
  const status = readStatus(cause)
  const offline = status === 0 || isNetworkError(cause)
  if (isTeamNamesError(err, 'team_names/proof_failed')) {
    // The ceremony with Ciphera ID failed before it judged the password.
    if (status === 429) return TOO_MANY
    if (status !== null && status >= 500) return ID_DOWN
    if (offline) return NO_CONNECTION
    return NAMES_WORDS.notConfirmed
  }
  // pulse-backend refused the key or was not reached.
  if (offline) return NO_CONNECTION
  if (status === 429) return TOO_MANY
  return refused
}

export const setUpErrorMessage = (err: unknown): string => keyStepError(err, NAMES_WORDS.setUpFailed)

export const resetErrorMessage = (err: unknown): string => keyStepError(err, NAMES_WORDS.resetFailed)
