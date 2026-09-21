import { useCallback } from 'react'
import { useSWRConfig } from 'swr'

/**
 * Purge the entire SWR cache after the session's ORG CONTEXT changes, and
 * refetch whatever is on screen under the new context.
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
 * 🔴 `revalidate: true` IS LOAD-BEARING (21-09-2026, pulse#730). Until then
 * this passed `revalidate: false`, reasoning that a revalidate serves the
 * stale value while the refetch is in flight. That is true of a bare
 * `mutate(key)`; it is not true here, because the data is set to `undefined`
 * synchronously before any refetch starts — the stale value is gone the
 * moment this is called. What `revalidate: false` actually did was leave
 * every key EMPTY WITH NOTHING IN FLIGHT:
 *
 *   - SWR discards a revalidation whose fetch started BEFORE the key's latest
 *     mutation (swr/dist/index/index.mjs, revalidate(), "case 2"). The
 *     workspace switch runs AuthProvider.refresh(), which clears and refetches
 *     every mounted key; a purge stacked after it stamped a newer mutation on
 *     each key, so every one of those refetches resolved into the bin.
 *   - A `revalidate: false` mutate does not drop the key's dedupe entry, so
 *     every consumer that mounted within `dedupingInterval` (30 s for 'sites')
 *     joined the doomed request instead of starting its own. The switch
 *     landed on /sites with no sites until a full reload.
 *
 * With `revalidate: true` SWR drops the dedupe entry, refetches every mounted
 * key, and unmounted keys fetch fresh when they mount. Stacking it after
 * another cache-wide mutate is safe (the later revalidation is the one SWR
 * keeps) — it is `revalidate: false` that must never follow one.
 *
 * ⚠️ PRECONDITION: the credential must already be the NEW org's when this is
 * called. The refetch it starts carries whatever `setAccessToken`
 * (lib/api/client.ts) last primed — call this after the session is stored
 * AND the Bearer is set, never before. See lib/hooks/__tests__ and
 * lib/swr/__tests__/org-switch.test.tsx for both rules, pinned.
 *
 * Call this at every client-side org-context switch that does not go through
 * AuthProvider.refresh(), which performs the same clear-and-revalidate itself.
 * Flows that hard-navigate (workspace deletion) get the same effect from the
 * full page load.
 */
export function useClearOrgScopedCaches(): () => Promise<unknown> {
  const { mutate } = useSWRConfig()
  return useCallback(
    () => mutate(() => true, undefined, { revalidate: true }),
    [mutate],
  )
}
