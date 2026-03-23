'use client'

import { useEffect, useState } from 'react'
import { LoadingOverlay } from '@ciphera-net/ui'
import { getFilteredReferrers, FilteredReferrer } from '@/lib/api/admin'

export default function FilteredTrafficPage() {
  const [referrers, setReferrers] = useState<FilteredReferrer[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    setLoading(true)
    const endDate = new Date().toISOString().split('T')[0]
    const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
    getFilteredReferrers(startDate, endDate)
      .then(setReferrers)
      .finally(() => setLoading(false))
  }, [days])

  if (loading) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Loading filtered traffic..." />
  }

  const totalBlocked = referrers.reduce((sum, r) => sum + r.count, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Filtered Traffic</h2>
          <p className="text-sm text-neutral-400 mt-1">
            {totalBlocked.toLocaleString()} spam referrers blocked in the last {days} days
          </p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                days === d
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden">
        {referrers.length === 0 ? (
          <div className="p-12 text-center text-neutral-400">
            No filtered referrers in this period
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className="px-4 py-3 font-medium text-neutral-400">Domain</th>
                <th className="px-4 py-3 font-medium text-neutral-400">Reason</th>
                <th className="px-4 py-3 font-medium text-neutral-400 text-right">Blocked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {referrers.map((r) => (
                <tr key={`${r.domain}-${r.reason}`} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                  <td className="px-4 py-3 text-white font-mono text-xs">{r.domain}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.reason === 'blocklist'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>
                      {r.reason}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-white tabular-nums">
                    {r.count.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
