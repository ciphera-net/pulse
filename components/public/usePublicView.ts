'use client'

import { useCallback, useMemo, useState } from 'react'
import useSWR from 'swr'
import apiRequest from '@/lib/api/client'
import { FALLBACK_DEMO_SITE_ID, type PublicSiteView } from '@/components/public/site-view'

/**
 * Reading a public site's view, and what each answer means (PUL-34 Phase 2).
 *
 * The backend answers the public site record with, in this order (public_share.go,
 * PublicShareGate): 404 `Site not found`, 403 `Access denied` (the site is not public),
 * 401 `is_protected` (a password and no valid share cookie), then 404 `This page is not
 * shared`. That last one is the record route being DEMO-ONLY: a customer's link is served
 * five other routes (stats, daily, realtime, dashboard, page-preview) and not this one, so
 * for a customer's link a 404 here is the normal answer and not an error.
 *
 * Errors are read by shape, never `instanceof`: chunk-split bundles can hold two ApiError
 * classes (the funnel detail page's measured lesson).
 */

export type PublicViewState =
  | { kind: 'loading' }
  /** The view was served: the sample site, or (later) a customer's link with its chosen pages. */
  | { kind: 'ready'; view: PublicSiteView }
  /** The view is not served: a customer's link today, and /demo before the sample site exists. */
  | { kind: 'dashboard-only'; siteId: string }
  /** A password-protected link with no valid share cookie. */
  | { kind: 'protected'; siteId: string }
  /** The site is not public. */
  | { kind: 'private' }
  /** There is no such site (or the id is not one). */
  | { kind: 'missing' }
  | { kind: 'error' }

export type PublicViewTarget = { kind: 'demo' } | { kind: 'share'; siteId: string }

interface ErrorShape {
  status?: unknown
  data?: unknown
}

function statusOf(error: unknown): number | null {
  const status = (error as ErrorShape | null | undefined)?.status
  return typeof status === 'number' ? status : null
}

function bodyOf(error: unknown): Record<string, unknown> {
  const data = (error as ErrorShape | null | undefined)?.data
  return data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : {}
}

/** A 401 that a share password answers: `{ is_protected: true }`. */
export function isProtectedError(error: unknown): boolean {
  return statusOf(error) === 401 && bodyOf(error).is_protected === true
}

const SITE_NOT_FOUND = 'Site not found'

export function classifyPublicView(
  target: PublicViewTarget,
  data: PublicSiteView | undefined,
  error: unknown,
): PublicViewState {
  if (data) return { kind: 'ready', view: data }
  if (error === undefined || error === null) return { kind: 'loading' }

  const status = statusOf(error)
  if (target.kind === 'demo') {
    // No sample site yet: ciphera.net's own site, as before it existed. Any other answer is a
    // failure to reach the demo, and there is no site to ask a password for.
    return status === 404 ? { kind: 'dashboard-only', siteId: FALLBACK_DEMO_SITE_ID } : { kind: 'error' }
  }

  if (isProtectedError(error)) return { kind: 'protected', siteId: target.siteId }
  if (status === 403) return { kind: 'private' }
  // 400: the id is not a UUID. Neither it nor `Site not found` is a link anyone shared.
  if (status === 400) return { kind: 'missing' }
  if (status === 404) {
    return bodyOf(error).error === SITE_NOT_FOUND
      ? { kind: 'missing' }
      : { kind: 'dashboard-only', siteId: target.siteId }
  }
  return { kind: 'error' }
}

function pathOf(target: PublicViewTarget): string {
  return target.kind === 'demo' ? '/public/demo' : `/public/sites/${encodeURIComponent(target.siteId)}`
}

/**
 * One read of the public view, kept in SWR under a key of its own. It is deliberately NOT a
 * `public:` key (lib/scope/site-ref.ts marks the surfaces' reads that way): unlocking a
 * password-protected link clears every `public:` read at once, and this one is re-read by
 * `retry` instead, because it stays mounted while the surfaces below it come and go.
 *
 * No automatic retry and no refetch on focus: every answer above is a decision, and a
 * failure is shown with a Retry rather than retried behind the reader's back.
 */
export function usePublicView(input: PublicViewTarget): { state: PublicViewState; retry: () => void } {
  // The caller builds `input` inline; its two primitives are what identify it.
  const siteId = input.kind === 'share' ? input.siteId : null
  const target = useMemo<PublicViewTarget>(
    () => (siteId === null ? { kind: 'demo' } : { kind: 'share', siteId }),
    [siteId],
  )
  const [retrying, setRetrying] = useState(false)

  const { data, error, mutate } = useSWR<PublicSiteView>(
    ['public-view', siteId ?? 'demo'],
    () => apiRequest<PublicSiteView>(pathOf(target)),
    { revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false },
  )

  // A Retry shows the loading state until its answer is in, not the failure it is answering.
  const state = useMemo<PublicViewState>(
    () => (retrying && !data ? { kind: 'loading' } : classifyPublicView(target, data, error)),
    [retrying, target, data, error],
  )

  const retry = useCallback(() => {
    setRetrying(true)
    void mutate().finally(() => setRetrying(false))
  }, [mutate])

  return { state, retry }
}
