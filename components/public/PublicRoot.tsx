'use client'

import { Suspense, useCallback, useMemo, useState } from 'react'
import { SWRConfig, useSWRConfig } from 'swr'
import DashboardChrome from '@/components/dashboard/DashboardChrome'
import PasswordGate from '@/components/public/PasswordGate'
import { PublicShellSkeleton } from '@/components/public/PublicShellSkeleton'
import { LoadFailure, StandaloneNotice } from '@/components/public/states'
import { mentionsPublicRead } from '@/components/public/keys'
import { dashboardOnlyScope, scopeFromView } from '@/components/public/site-view'
import { isProtectedError, type PublicViewState } from '@/components/public/usePublicView'
import { useIsClient } from '@/components/public/useIsClient'
import { SiteScopeProvider, type SiteScope } from '@/lib/scope/SiteScope'

/**
 * The body of the public pages, for /demo and for /share/<id> alike (PUL-34 Phase 2): turns
 * what the view read said into one of
 *
 *   - the page: a scope for the site, the public shell, and the route's page inside it;
 *   - the password gate, in place of everything, for a protected link;
 *   - a notice, when the link is not public or there is no such site;
 *   - a failure with Retry, when the view could not be read.
 *
 * The scope provider sits ABOVE the shell: the shell and every surface read the site and
 * their links from it, never from the path.
 *
 * 🔴 The gate comes back, not only at first. A protected link's share cookie expires while a
 * tab is open; the next read under this root answers 401 `is_protected`, the page is replaced
 * by the gate, and it is not painted again until the password is accepted. What the locked
 * page had cached is cleared first, so that the page shown after the unlock is a fresh read
 * and not the old numbers (or the old failures) for a moment.
 */
export function PublicRoot({
  state,
  basePath,
  retry,
  children,
}: {
  state: PublicViewState
  basePath: string
  retry: () => void
  children: React.ReactNode
}) {
  const isClient = useIsClient()
  const { mutate } = useSWRConfig()
  const [relocked, setRelocked] = useState(false)

  // The page's own reads and the shell's all run under this config (the provider below). One
  // that fails with 401 `is_protected` locks the page again: the share cookie has expired.
  const swrConfig = useMemo(
    () => ({
      onError: (error: unknown) => {
        if (isProtectedError(error)) setRelocked(true)
      },
    }),
    [],
  )

  const scope = useMemo<SiteScope | null>(() => {
    if (state.kind === 'ready') return scopeFromView(state.view, basePath)
    if (state.kind === 'dashboard-only') return dashboardOnlyScope(state.siteId, basePath)
    return null
  }, [state, basePath])

  const gateSiteId = state.kind === 'protected' ? state.siteId : relocked && scope ? scope.siteId : null

  const unlock = useCallback(async () => {
    // Forget every public read, data and failures both; nothing under the gate is mounted to
    // refetch, so the page that replaces it fetches afresh.
    await mutate(mentionsPublicRead, undefined, { revalidate: false })
    setRelocked(false)
    // The view itself stays mounted above, and is the one read the gate was shown for when
    // the link was protected from the start.
    if (state.kind === 'protected') retry()
  }, [mutate, retry, state.kind])

  if (!isClient) return <PublicShellSkeleton />
  if (gateSiteId) return <PasswordGate siteId={gateSiteId} onUnlocked={unlock} />

  switch (state.kind) {
    case 'loading':
      return <PublicShellSkeleton />
    case 'private':
      return <StandaloneNotice title="This dashboard isn't public." description="Its owner has not shared it." />
    case 'missing':
      return <StandaloneNotice title="This dashboard doesn't exist." description="Check the link and try again." />
    case 'error':
      return <LoadFailure onRetry={retry} />
  }
  if (!scope) return <LoadFailure onRetry={retry} />

  return (
    <SWRConfig value={swrConfig}>
      <SiteScopeProvider scope={scope}>
        <DashboardChrome>
          {/* A surface that suspends (a route chunk, a dynamic card) keeps the shell standing. */}
          <Suspense fallback={null}>{children}</Suspense>
        </DashboardChrome>
      </SiteScopeProvider>
    </SWRConfig>
  )
}
