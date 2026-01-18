'use client'

import { PerformanceStats as Stats } from '@/lib/api/stats'

interface Props {
  stats: Stats
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

export default function PerformanceStats({ stats }: Props) {
  // * Scoring Logic (based on Google Web Vitals)
  const getScore = (metric: 'lcp' | 'cls' | 'inp', value: number) => {
    if (metric === 'lcp') return value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor'
    if (metric === 'cls') return value <= 0.1 ? 'good' : value <= 0.25 ? 'needs-improvement' : 'poor'
    if (metric === 'inp') return value <= 200 ? 'good' : value <= 500 ? 'needs-improvement' : 'poor'
    return 'good'
  }

  // * If no data, don't show or show placeholder? 
  // * Showing placeholder with 0s might be confusing if they actually have 0ms latency (impossible)
  // * But we handle empty stats in parent or pass 0 here.

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">
        Core Web Vitals
      </h3>
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
    </div>
  )
}
