import { ID_URL } from './client'
import { track } from '@/lib/pulse'
import {
  initiateOAuthFlow as kickoffLogin,
  initiateSignupFlow as kickoffSignup,
} from '@ciphera-net/pulse-oauth'

/**
 * The PKCE sign-in kickoff lives in @ciphera-net/pulse-oauth (PULSE-158, design
 * §13 E3): the marketing app starts sign-ins on this same origin, and the
 * dashboard's /auth/callback reads what either app stored, so the kickoff and the
 * `oauth_pending:<state>` contract have ONE source. The package's golden test
 * pins its URLs and storage writes to this module's former implementation,
 * byte for byte.
 *
 * This module keeps the dashboard's call signatures — `initiateOAuthFlow(redirectPath?)`
 * — and supplies what the package takes as options: the ID origin and Pulse's
 * own analytics event. `redirect_uri` is still computed from
 * `window.location.origin` at the start of each attempt and stored with it; the
 * reasoning (an origin mismatch must fail at authorize, not at the exchange) is in
 * the package's kickoff.ts.
 */
export { generateOAuthParams } from '@ciphera-net/pulse-oauth'
export type { OAuthParams } from '@ciphera-net/pulse-oauth'

export async function initiateOAuthFlow(redirectPath = '/auth/callback') {
  return kickoffLogin({ idUrl: ID_URL, redirectPath, onStart: track })
}

export async function initiateSignupFlow(redirectPath = '/auth/callback') {
  return kickoffSignup({ idUrl: ID_URL, redirectPath, onStart: track })
}
