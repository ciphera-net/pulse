import { useCallback } from 'react'
import { useSWRConfig } from 'swr'

/**
 * Purge the entire SWR cache after the session's ORG CONTEXT changes.
 *
 * An org switch is a new world: 'sites', 'subscription', 'billing-invoices',
 * 'permissions' and friends are all facts about the org the session WAS on,
 * and a soft navigation keeps them alive. Measured failure (25-08-2026): after
 * creating a fresh org, the setup wizard's site step rendered the PREVIOUS
 * org's site as "Pick up where you left off".
 *
 * 🔴 This MUST be the BOUND mutate from useSWRConfig(). The app mounts
 * SWRConfig with a custom cache provider (components/SWRProvider.tsx), and the
 * global `mutate` imported from 'swr' operates on the DEFAULT cache — the
 * first version of this fix used it, cleared a cache nothing reads, and the
 * stale-org bug survived a green unit test that had mocked this very module.
 *
 * Clearing data (not just revalidating) is deliberate: a revalidate serves the
 * stale value while the refetch is in flight, which is exactly the window the
 * bug lived in. Cleared keys re-enter their loading state and fetch fresh.
 *
 * Call this at EVERY client-side org-context switch. Flows that hard-navigate
 * (workspace deletion) get the same effect from the full page load.
 */
export function useClearOrgScopedCaches(): () => Promise<unknown> {
  const { mutate } = useSWRConfig()
  return useCallback(
    () => mutate(() => true, undefined, { revalidate: false }),
    [mutate],
  )
}
