import { authFetch } from '@/lib/api/client'

/**
 * Recovery-identity status for the SIGNED-IN account.
 *
 * 🔑 It reports on the caller's own account and nothing else, and there is no
 * endpoint that answers this about anybody else — by design, because an
 * enrolment oracle for arbitrary addresses is exactly what the recovery
 * ceremony's anti-enumeration properties exist to prevent. An operator's view
 * is Warden's, through id-backend's internal identity surface.
 *
 * Enrolment itself does NOT live here. It is a crypto ceremony — an OPAQUE
 * re-auth, a phrase mint, a vault-key re-wrap — not an HTTP call, and it lives
 * in `lib/auth/tessera/recovery-enrol.ts` beside the others.
 */
export async function getRecoveryStatus(): Promise<{ enrolled: boolean }> {
  return authFetch<{ enrolled: boolean }>('/auth/user/recovery-opaque/status', {
    skipAuthRetry: true,
  })
}
