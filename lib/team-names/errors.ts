/**
 * The only errors the team-names code throws (design §6.6, review L8).
 *
 * 🔴 THE MESSAGE IS THE CODE AND NOTHING ELSE. Every error boundary posts `message` and `stack` to
 * /api/client-errors, which writes them to the logs, so a message holding a name, row bytes, key
 * material or a re-auth token would ship it there. A user id may ride as a property, never more.
 * `cause` keeps the underlying error for code that needs it (the password step maps a ceremony
 * failure to words with it); boundaries do not post it.
 */

export type TeamNamesErrorCode =
  /** A sealed row did not open: wrong keys, wrong bindings, or tampered. */
  | 'team_names/open_failed'
  /** A row names a wire version this code does not know; refused before anything was derived. */
  | 'team_names/unsupported_version'
  /** A row, key or envelope has the wrong size or shape. */
  | 'team_names/malformed'
  /** A user or team id that is not a canonical UUID. */
  | 'team_names/invalid_id'
  /** The name cannot be sealed: empty after cleaning, or over 400 bytes of UTF-8. */
  | 'team_names/name_unsealable'
  /**
   * The address cannot be sealed: checkEmail refuses it (over 254 bytes of UTF-8, not exactly one '@' with
   * something on each side, or whitespace, a control, a format character or a lone surrogate in it).
   */
  | 'team_names/email_unsealable'
  /** The identity envelope does not open with this browser's vault key. */
  | 'team_names/identity_unopenable'
  /** The server's public key for this person contradicts the envelope, or its key id. */
  | 'team_names/own_key_mismatch'
  /** A row for me is sealed to a key that is not mine. */
  | 'team_names/foreign_recipient_key'
  /** A row's key ids name a key that is no longer the current one. */
  | 'team_names/stale_key'
  /** Ciphera ID did not accept the proof that a vault holder publishes the key. */
  | 'team_names/reauth_required'
  /** The password did not match; `cause` holds the ceremony's own error. The step asks again. */
  | 'team_names/password_failed'
  /**
   * The password ceremony failed for another reason (a rate limit, Ciphera ID unreachable, no token
   * minted); `cause` holds its error. Nothing was published. Apart from `request_failed` so the step
   * can say which side failed: Ciphera ID's words for this one, Pulse's for a refused key.
   */
  | 'team_names/proof_failed'
  /** The server answered something this code cannot read. */
  | 'team_names/invalid_response'
  /** A request failed; `cause` holds the error. A step rejects with it when pulse-backend refused or was not reached. */
  | 'team_names/request_failed'
  /** The action needs a state this browser is not in (no vault key, no key, or the wrong step). */
  | 'team_names/not_ready'

export class TeamNamesError extends Error {
  readonly code: TeamNamesErrorCode
  readonly userId: string | null

  constructor(code: TeamNamesErrorCode, options: { userId?: string | null; cause?: unknown } = {}) {
    super(code, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'TeamNamesError'
    this.code = code
    this.userId = options.userId ?? null
  }
}

export function isTeamNamesError(err: unknown, code?: TeamNamesErrorCode): err is TeamNamesError {
  return err instanceof TeamNamesError && (code === undefined || err.code === code)
}
