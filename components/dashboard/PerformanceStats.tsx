'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ChevronDownIcon } from '@radix-ui/react-icons'
import { PerformanceStats as Stats, PerformanceByPageStat, getPerformanceByPage } from '@/lib/api/stats'
import Select from '@/components/ui/Select'

interface Props {
  stats: Stats
  performanceByPage?: PerformanceByPageStat[] | null
  siteId?: string
  startDate?: string
  endDate?: string
  getPerformanceByPage?: typeof getPerformanceByPage
}

function MetricCard({ label, value, unit, score }: { label: string, value: number, unit: string, score: 'good' | 'needs-improvement' | 'poor' }) {
  const colors = {
    good: 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800',
    'needs-improvement': 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
    poor: 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800',
  }

  return (
    <div className={`p-4 rounded-lg border ${colors[score]}`}>
      <div className="text-sm font-medium opacity-80 mb-1">{label}</div>
      <div className="text-2xl font-bold">
        {value}
        <span className="text-sm font-normal ml-1 opacity-70">{unit}</span>
      </div>
    </div>
  )
}

export default function PerformanceStats({ stats, performanceByPage, siteId, startDate, endDate, getPerformanceByPage }: Props) {
  // * Scoring Logic (based on Google Web Vitals)
  type Score = 'good' | 'needs-improvement' | 'poor'
  const getScore = (metric: 'lcp' | 'cls' | 'inp', value: number): Score => {
    if (metric === 'lcp') return value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor'
    if (metric === 'cls') return value <= 0.1 ? 'good' : value <= 0.25 ? 'needs-improvement' : 'poor'
    if (metric === 'inp') return value <= 200 ? 'good' : value <= 500 ? 'needs-improvement' : 'poor'
    return 'good'
  }

  // * Overall performance: worst of LCP, CLS, INP (matches Google’s “field” rating)
  const getOverallScore = (s: { lcp: number; cls: number; inp: number }): Score => {
    const lcp = getScore('lcp', s.lcp)
    const cls = getScore('cls', s.cls)
    const inp = getScore('inp', s.inp)
    if (lcp === 'poor' || cls === 'poor' || inp === 'poor') return 'poor'
    if (lcp === 'needs-improvement' || cls === 'needs-improvement' || inp === 'needs-improvement') return 'needs-improvement'
    return 'good'
  }

  const overallScore = getOverallScore(stats)
  const overallLabel = { good: 'Good', 'needs-improvement': 'Needs improvement', poor: 'Poor' }[overallScore]
  const overallBadgeClass = {
    good: 'text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800',
    'needs-improvement': 'text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800',
    poor: 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800',
  }[overallScore]

  const [mainExpanded, setMainExpanded] = useState(false)
  const [sortBy, setSortBy] = useState<'lcp' | 'cls' | 'inp'>('lcp')
  const [overrideRows, setOverrideRows] = useState<PerformanceByPageStat[] | null>(null)
  const [loadingTable, setLoadingTable] = useState(false)
  const [worstPagesOpen, setWorstPagesOpen] = useState(false)

  // * When props.performanceByPage changes (e.g. date range), clear override so we use dashboard data
  useEffect(() => {
    setOverrideRows(null)
  }, [performanceByPage])

  const rows = overrideRows ?? performanceByPage ?? []
  const canRefetch = Boolean(getPerformanceByPage && siteId && startDate && endDate)

  const handleSortChange = (value: string) => {
    const v = value as 'lcp' | 'cls' | 'inp'
    setSortBy(v)
    if (!getPerformanceByPage || !siteId || !startDate || !endDate) return
    setLoadingTable(true)
    getPerformanceByPage(siteId, startDate, endDate, { sort: v, limit: 20 })
      .then(setOverrideRows)
      .finally(() => setLoadingTable(false))
  }

  const cellScoreClass = (score: 'good' | 'needs-improvement' | 'poor') => {
    const m: Record<string, string> = {
      good: 'text-green-600 dark:text-green-400',
      'needs-improvement': 'text-yellow-600 dark:text-yellow-400',
      poor: 'text-red-600 dark:text-red-400',
    }
    return m[score] ?? ''
  }

  const formatMetric = (metric: 'lcp' | 'cls' | 'inp', val: number | null) => {
    if (val == null) return '—'
    if (metric === 'cls') return val.toFixed(3)
    return `${Math.round(val)} ms`
  }

  const getCellClass = (metric: 'lcp' | 'cls' | 'inp', val: number | null) => {
    if (val == null) return 'text-neutral-400 dark:text-neutral-500'
    return cellScoreClass(getScore(metric, val))
  }

  const summaryText = `LCP ${Math.round(stats.lcp)} ms · CLS ${Number(stats.cls.toFixed(3))} · INP ${Math.round(stats.inp)} ms`

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
      {/* * One-line summary: Performance score + metric summary. Click to expand. */}
      <button
        type="button"
        onClick={() => setMainExpanded((o) => !o)}
        className="flex w-full items-center justify-between gap-4 text-left rounded cursor-pointer hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900"
        aria-expanded={mainExpanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronDownIcon
            className={`w-4 h-4 shrink-0 text-neutral-500 transition-transform ${mainExpanded ? '' : '-rotate-90'}`}
            aria-hidden
          />
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Performance</span>
          <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${overallBadgeClass}`}>
            {overallLabel}
          </span>
        </div>
        <span className="text-xs text-neutral-500 truncate" title={summaryText}>
          {summaryText}
        </span>
      </button>

      {/* * Expanded: full LCP/CLS/INP cards, footnote, and Worst pages (collapsible) */}
      <motion.div
        initial={false}
        animate={{ height: mainExpanded ? 'auto' : 0, opacity: mainExpanded ? 1 : 0 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        style={{ overflow: 'hidden' }}
      >
        <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              label="Largest Contentful Paint (LCP)"
              value={Math.round(stats.lcp)}
              unit="ms"
              score={getScore('lcp', stats.lcp)}
            />
            <MetricCard
              label="Cumulative Layout Shift (CLS)"
              value={Number(stats.cls.toFixed(3))}
              unit=""
              score={getScore('cls', stats.cls)}
            />
            <MetricCard
              label="Interaction to Next Paint (INP)"
              value={Math.round(stats.inp)}
              unit="ms"
              score={getScore('inp', stats.inp)}
            />
          </div>
          <div className="mt-4 text-xs text-neutral-500">
            * Averages calculated from real user sessions. Lower is better.
          </div>

          {/* * Worst pages by metric – collapsed by default */}
          <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center justify-between gap-4 mb-3">
              <button
                type="button"
                onClick={() => setWorstPagesOpen((o) => !o)}
                className="flex items-center gap-2 text-left rounded cursor-pointer hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900"
                aria-expanded={worstPagesOpen}
              >
                <ChevronDownIcon
                  className={`w-4 h-4 shrink-0 text-neutral-500 transition-transform ${worstPagesOpen ? '' : '-rotate-90'}`}
                  aria-hidden
                />
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Worst pages by metric
                </span>
              </button>
              {worstPagesOpen && canRefetch && (
                <Select
                  value={sortBy}
                  onChange={handleSortChange}
                  options={[
                    { value: 'lcp', label: 'Sort by LCP (worst)' },
                    { value: 'cls', label: 'Sort by CLS (worst)' },
                    { value: 'inp', label: 'Sort by INP (worst)' },
                  ]}
                  variant="input"
                  align="right"
                  className="min-w-[180px]"
                />
              )}
            </div>
            <motion.div
              initial={false}
              animate={{
                height: worstPagesOpen ? 'auto' : 0,
                opacity: worstPagesOpen ? 1 : 0,
              }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              {loadingTable ? (
                <div className="py-8 text-center text-neutral-500 text-sm">Loading…</div>
              ) : rows.length === 0 ? (
                <div className="py-6 text-center text-neutral-500 text-sm">
                  No per-page metrics yet. Data appears as visitors are tracked with performance insights enabled.
                </div>
              ) : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200 dark:border-neutral-700">
                        <th className="text-left py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">Path</th>
                        <th className="text-right py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">Samples</th>
                        <th className="text-right py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">LCP</th>
                        <th className="text-right py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">CLS</th>
                        <th className="text-right py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">INP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.path} className="border-b border-neutral-100 dark:border-neutral-800/80">
                          <td className="py-2 px-2 text-neutral-900 dark:text-white font-mono truncate max-w-[200px]" title={r.path}>
                            {r.path || '/'}
                          </td>
                          <td className="py-2 px-2 text-right text-neutral-600 dark:text-neutral-400">{r.samples}</td>
                          <td className={`py-2 px-2 text-right font-mono ${getCellClass('lcp', r.lcp)}`}>
                            {formatMetric('lcp', r.lcp)}
                          </td>
                          <td className={`py-2 px-2 text-right font-mono ${getCellClass('cls', r.cls)}`}>
                            {formatMetric('cls', r.cls)}
                          </td>
                          <td className={`py-2 px-2 text-right font-mono ${getCellClass('inp', r.inp)}`}>
                            {formatMetric('inp', r.inp)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
