import { readStatus } from '@/lib/api/status'

/**
 * What a step-up dialog (delete the account, remove a passkey) says when the
 * re-auth ceremony fails.
 *
 * 🔴 A WRONG PASSWORD ARRIVES WITH NO HTTP STATUS. Measured on production
 * (10-09-2026, and again 16-10-2026 on both dialogs): the ceremony posts
 * `/auth/reauth/start` (200) and never posts `/auth/reauth/finish`, because
 * OPAQUE detects the mismatch inside the client's own key exchange and throws
 * there. So everything that is NOT a credential failure is named first (it
 * carries a status, or never reached the server) and the default is the
 * password. Both dialogs used to map by status and fall through to Facet's
 * generic "Something went wrong" for exactly the most common failure. Same
 * reasoning, and the same strings, as the email-change and unlock mappers in
 * AccountProfileTab.
 */
export function reauthErrorMessage(err: unknown): string {
  const status = readStatus(err)
  if (status === 429) {
    return 'Too many attempts in a short time. Wait about a minute, then try again. Your password was not the problem.'
  }
  if (status !== null && status >= 500) {
    return 'Ciphera ID could not be reached just now. Nothing has changed. Try again shortly.'
  }
  if (err instanceof Error && /network|fetch/i.test(err.message)) {
    return 'Network error. Nothing has changed. Try again.'
  }
  if (status !== null && status !== 401 && status !== 403) {
    return "Couldn't confirm your password. Try again."
  }
  return "That password didn't match. Try again."
}
