'use client'

import { formatNumber } from '@/lib/utils/format'
import { LayoutDashboardIcon } from '@ciphera-net/ui'

interface TopPagesProps {
  pages: Array<{ path: string; pageviews: number }>
}

export default function TopPages({ pages }: TopPagesProps) {
  if (!pages || pages.length === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 flex flex-col">
        <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-white">
          Top Pages
        </h3>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-8 gap-3">
          <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4">
            <LayoutDashboardIcon className="w-8 h-8 text-neutral-500 dark:text-neutral-400" />
          </div>
          <h4 className="font-semibold text-neutral-900 dark:text-white">
            No page data yet
          </h4>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-xs">
            Your most visited pages will appear here as traffic arrives.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6">
      <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-white">
        Top Pages
      </h3>
      <div className="space-y-3">
        {pages.map((page, index) => (
          <div key={index} className="flex items-center justify-between">
            <div className="flex-1 truncate text-neutral-900 dark:text-white">
              {page.path}
            </div>
            <div className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 ml-4">
              {formatNumber(page.pageviews)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
