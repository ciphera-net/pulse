'use client'

import { useCallback, useState } from 'react'
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'

/**
 * Page state scoped to a context key (tab + filters + range): changing the
 * context reads as page 1 without an effect, and a shrinking list clamps at
 * read time instead of via setState-in-effect.
 */
export function useCardPage(contextKey: string, pageCount: number): [number, (page: number) => void] {
  const [state, setState] = useState({ key: contextKey, page: 1 })
  const page = Math.max(1, Math.min(state.key === contextKey ? state.page : 1, pageCount))
  const setPage = useCallback((p: number) => setState({ key: contextKey, page: p }), [contextKey])
  return [page, setPage]
}

// ---------------------------------------------------------------------------
// Bottom-center pager for dimension cards (blocks round, 01-09-2026). Replaces
// the view-all modal: chevrons + numbered page chips, current page filled,
// everything else ghost — orange stays reserved for data. Renders nothing for
// a single page. Below `sm` the numbers collapse to "2 of 7".
// ---------------------------------------------------------------------------

interface CardPagerProps {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  /** Names the list for screen readers, e.g. "referrers". */
  label: string
}

/** First, last, current±2; gaps collapse to one ellipsis each. */
function pageWindow(page: number, pageCount: number): Array<number | 'gap'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  const wanted = new Set<number>([1, pageCount])
  for (let n = page - 2; n <= page + 2; n++) if (n >= 1 && n <= pageCount) wanted.add(n)
  const out: Array<number | 'gap'> = []
  let prev = 0
  for (const n of [...wanted].sort((a, b) => a - b)) {
    if (prev && n - prev > 1) out.push('gap')
    out.push(n)
    prev = n
  }
  return out
}

const BTN =
  'h-6 min-w-[24px] px-1 inline-flex items-center justify-center text-[11px] tabular-nums rounded-none transition-colors duration-fast ease-apple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange'
const GHOST = 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 cursor-pointer'
const OFF = 'text-neutral-500 opacity-40 cursor-default'

export function CardPager({ page, pageCount, onPageChange, label }: CardPagerProps) {
  if (pageCount <= 1) return null
  const go = (n: number) => {
    if (n >= 1 && n <= pageCount && n !== page) onPageChange(n)
  }
  return (
    <nav className="flex items-center justify-center gap-0.5 mt-3.5" aria-label={`Pages of ${label}`}>
      <button
        type="button"
        onClick={() => go(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
        className={`${BTN} ${page === 1 ? OFF : GHOST}`}
      >
        <CaretLeftIcon className="w-3 h-3" weight="bold" />
      </button>
      <div className="hidden sm:flex items-center gap-0.5">
        {pageWindow(page, pageCount).map((item, i) =>
          item === 'gap' ? (
            <span key={`gap-${i}`} className="px-1 text-[11px] text-neutral-600" aria-hidden="true">
              &#8230;
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => go(item)}
              aria-label={`Page ${item}`}
              aria-current={item === page ? 'page' : undefined}
              className={`${BTN} ${
                item === page
                  ? 'bg-[#202020] border border-[#2e2e2e] text-white font-medium cursor-default'
                  : GHOST
              }`}
            >
              {item}
            </button>
          ),
        )}
      </div>
      <span className="sm:hidden px-1.5 text-[11px] tabular-nums text-neutral-500">
        {page} of {pageCount}
      </span>
      <button
        type="button"
        onClick={() => go(page + 1)}
        disabled={page === pageCount}
        aria-label="Next page"
        className={`${BTN} ${page === pageCount ? OFF : GHOST}`}
      >
        <CaretRightIcon className="w-3 h-3" weight="bold" />
      </button>
    </nav>
  )
}
