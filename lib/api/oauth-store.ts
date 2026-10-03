/**
 * The pending-sign-in store: `oauth_pending:<state>` → { verifier, createdAt,
 * redirectUri }, 10-minute expiry. It lives in @ciphera-net/pulse-oauth
 * (PULSE-158, design §13 E3) because two apps now start a sign-in on this
 * origin — the dashboard and the marketing app — while only the dashboard's
 * /auth/callback finishes it. Both halves of that contract must have ONE
 * source; this module keeps the dashboard's import path.
 */
export {
  PENDING_MAX_AGE_MS,
  prunePendingAuth,
  rememberPendingAuth,
  claimPendingAuth,
  forgetAllPendingAuth,
} from '@ciphera-net/pulse-oauth'
export type { PendingAuthAttempt } from '@ciphera-net/pulse-oauth'
