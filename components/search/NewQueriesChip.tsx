'use client'

import { useRef, useState } from 'react'
import { useGSCNewQueries } from '@/lib/swr/dashboard'
import FilterPopover from '@/components/dashboard/filter/FilterPopover'

// The quiet "N new queries" chip. Clicking opens a portal popover (FilterPopover
// shell: flip, clamp, focus trap, Esc, focus-return) listing the new queries the
// endpoint already returns; picking one jumps to the queries view with that row
// expanded. The old green pill is gone.

interface NewQueriesChipProps {
  siteId: string
  start: string
  end: string
  /** Open the queries view with this query expanded. */
  onPick: (query: string) => void
}

export function NewQueriesChip({ siteId, start, end, onPick }: NewQueriesChipProps) {
  const { data } = useGSCNewQueries(siteId, start, end)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const count = data?.count ?? 0
  const queries = data?.queries ?? []
  if (count === 0) return null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center rounded-none border border-border px-2.5 font-mono text-xs tabular-nums text-neutral-400 transition-colors duration-fast ease-apple hover:border-neutral-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
      >
        {count} new {count === 1 ? 'query' : 'queries'}
      </button>

      <FilterPopover
        open={open}
        anchor={triggerRef.current}
        label="New queries this period"
        contentKey="new-queries"
        onClose={() => setOpen(false)}
      >
        <div className="max-h-72 overflow-y-auto p-1.5" role="listbox" aria-label="New queries">
          {queries.length > 0 ? (
            queries.map((q) => (
              <button
                key={q}
                type="button"
                role="option"
                aria-selected={false}
                title={q}
                onClick={() => { onPick(q); setOpen(false) }}
                className="flex w-full items-center rounded-none px-2.5 py-2 text-left text-sm text-neutral-300 transition-colors duration-fast ease-apple hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange"
              >
                <span className="truncate">{q}</span>
              </button>
            ))
          ) : (
            <div className="px-2.5 py-3 text-sm text-neutral-500">No new queries to list.</div>
          )}
        </div>
      </FilterPopover>
    </>
  )
}
