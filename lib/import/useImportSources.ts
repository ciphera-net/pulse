'use client'

// ─── Which sources this site can import from (M11-b) ──────────────────────
//
// The Import tab exists only where imports exist. The server says which sources
// are available (GET …/data-imports/sources), and answers a plain 404 while
// DATA_IMPORT_ENABLED is off, so production stays dark with no frontend flag:
// the rail entry, the landing-page link and the tab itself all read this hook.
//
// The server owns what is AVAILABLE; this build owns what it can DRIVE. A source
// is shown only when both hold: an upload source this build has a parser for
// (IMPORT_SOURCES), or a pull source whose flow is built here (Matomo, M11-j;
// GA4, M5). GA4 is shown only when the server lists it as an enabled `oauth`
// source, which it does only while GA4_IMPORT_ENABLED is on (M5-i).
//
// Never imported by the worker.

import useSWR from 'swr'
import { getImportSources, type ImportSourceEntry } from '@/lib/api/dataImports'
import { isImportSource } from './source-meta'
import { isSourceId, type SourceId } from './source-display'

/** How a source's history comes in, on this screen. */
export type ImportFlow = 'upload' | 'matomo' | 'ga4'

export interface AvailableSource {
  id: SourceId
  /** The server's kind: `upload_aggregate`, `upload_raw`, `api_key`, `oauth`. */
  kind: string
  flow: ImportFlow
}

export type ImportSourcesState =
  | { status: 'loading' }
  /** A 404 (imports are off), or nothing this build can drive. The tab does not exist. */
  | { status: 'unavailable' }
  /** Any other failure: said, with a retry, never read as "imports are off". */
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'available'; sources: AvailableSource[] }

/**
 * The server's list, in the server's order (D6), narrowed to what this build can
 * drive. Called during render, so a body of the wrong shape (no list, an entry
 * with no `kind`) drops what it cannot read instead of throwing.
 */
export function drivableSources(entries: readonly ImportSourceEntry[] | null | undefined): AvailableSource[] {
  const out: AvailableSource[] = []
  if (!Array.isArray(entries)) return out
  for (const e of entries as readonly unknown[]) {
    if (!isEntry(e) || e.enabled !== true || !isSourceId(e.source)) continue
    if (e.kind.startsWith('upload_') && isImportSource(e.source)) {
      out.push({ id: e.source, kind: e.kind, flow: 'upload' })
    } else if (e.source === 'matomo' && e.kind === 'api_key') {
      out.push({ id: e.source, kind: e.kind, flow: 'matomo' })
    } else if (e.source === 'ga4' && e.kind === 'oauth') {
      out.push({ id: e.source, kind: e.kind, flow: 'ga4' })
    }
  }
  return out
}

function isEntry(e: unknown): e is ImportSourceEntry {
  if (!e || typeof e !== 'object') return false
  const { source, kind } = e as Record<string, unknown>
  return typeof source === 'string' && typeof kind === 'string'
}

const statusOf = (e: unknown) => (e as { status?: number } | null)?.status

export function useImportSources(siteId: string | null | undefined): ImportSourcesState {
  const { data, error, mutate } = useSWR(
    siteId ? ['importSources', siteId] : null,
    () => getImportSources(siteId as string),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      // A 4xx is an answer (404: imports are off), never a blip to retry.
      shouldRetryOnError: (e: unknown) => {
        const s = statusOf(e)
        return s === undefined || s === 0 || s >= 500
      },
      errorRetryCount: 2,
    },
  )
  if (!siteId) return { status: 'unavailable' }
  if (error) {
    if (statusOf(error) === 404) return { status: 'unavailable' }
    return { status: 'error', error, retry: () => void mutate() }
  }
  if (!data) return { status: 'loading' }
  const sources = drivableSources((data as { sources?: ImportSourceEntry[] } | null)?.sources)
  return sources.length > 0 ? { status: 'available', sources } : { status: 'unavailable' }
}

/** True only once the server has answered 200 with at least one source this build can drive. */
export function useImportAvailable(siteId: string | null | undefined): boolean {
  return useImportSources(siteId).status === 'available'
}
