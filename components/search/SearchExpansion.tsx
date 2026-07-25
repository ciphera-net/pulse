'use client'

import { useGSCQueryPages, useGSCPageQueries } from '@/lib/swr/dashboard'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { DelayedSpinner } from '@/components/ui/DelayedSpinner'
import { QueryTrendSparkline } from './QueryTrendSparkline'
import { SubRow, stripProtocol } from './rowPrimitives'

// ---------------------------------------------------------------------------
// Expanded-row panels. Each panel is bound to its OWN row key (query / page),
// not a shared piece of state — so two quick expands can never render one row's
// data under another. The fetch keys on that key too (SWR), so the drill-down
// is race-free and cached. A settled empty is real; a failure shows an inline
// ErrorCard, never a fake-empty.
// ---------------------------------------------------------------------------

interface Range {
  siteId: string
  start: string
  end: string
}

// Loading / error / empty scaffold shared by both panels, kept at a stable
// minimum height so the height-morph doesn't jump when rows arrive.
function PanelBody({
  isLoading,
  hasData,
  error,
  isEmpty,
  emptyLabel,
  onRetry,
  children,
}: {
  isLoading: boolean
  hasData: boolean
  error: unknown
  isEmpty: boolean
  emptyLabel: string
  onRetry: () => void
  children: React.ReactNode
}) {
  return (
    <div className="min-h-[3rem]">
      {isLoading && !hasData ? (
        <div className="flex h-12 items-center">
          <DelayedSpinner />
        </div>
      ) : error ? (
        <ErrorCard title="Couldn't load this drill-down" onRetry={onRetry} className="py-4" />
      ) : isEmpty ? (
        <p className="py-2 text-sm text-neutral-500">{emptyLabel}</p>
      ) : (
        children
      )}
    </div>
  )
}

export function QueryExpansion({ siteId, start, end, query }: Range & { query: string }) {
  const { data, error, isLoading, mutate } = useGSCQueryPages(siteId, query, start, end)
  const pages = data?.pages ?? []
  return (
    <div className="border-t border-border bg-neutral-900/40 px-3 py-3">
      <QueryTrendSparkline siteId={siteId} query={query} start={start} end={end} />
      <div className="mt-4">
        <div className="mb-1.5 text-xs text-neutral-500">Contributing pages</div>
        <PanelBody
          isLoading={isLoading}
          hasData={!!data}
          error={error}
          isEmpty={pages.length === 0}
          emptyLabel="No pages for this query."
          onRetry={() => { void mutate() }}
        >
          {pages.map((p) => (
            <SubRow
              key={p.page}
              label={stripProtocol(p.page)}
              title={stripProtocol(p.page)}
              clicks={p.clicks}
              impressions={p.impressions}
              ctr={p.ctr}
              position={p.position}
            />
          ))}
        </PanelBody>
      </div>
    </div>
  )
}

export function PageExpansion({ siteId, start, end, page }: Range & { page: string }) {
  const { data, error, isLoading, mutate } = useGSCPageQueries(siteId, page, start, end)
  const queries = data?.queries ?? []
  return (
    <div className="border-t border-border bg-neutral-900/40 px-3 py-3">
      <div className="mb-1.5 text-xs text-neutral-500">Contributing queries</div>
      <PanelBody
        isLoading={isLoading}
        hasData={!!data}
        error={error}
        isEmpty={queries.length === 0}
        emptyLabel="No queries for this page."
        onRetry={() => { void mutate() }}
      >
        {queries.map((q) => (
          <SubRow
            key={q.query}
            label={q.query}
            title={q.query}
            clicks={q.clicks}
            impressions={q.impressions}
            ctr={q.ctr}
            position={q.position}
          />
        ))}
      </PanelBody>
    </div>
  )
}
