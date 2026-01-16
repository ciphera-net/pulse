'use client'

interface StatsCardProps {
  title: string
  value: string
}

export default function StatsCard({ title, value }: StatsCardProps) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
      <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
        {title}
      </div>
      <div className="text-3xl font-bold text-neutral-900 dark:text-white">
        {value}
      </div>
    </div>
  )
}
