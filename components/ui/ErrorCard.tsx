'use client'

import { WarningCircle } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

interface ErrorCardProps {
  title: string
  description?: string
  onRetry?: () => void
  className?: string
}

/**
 * Inline error state for data surfaces (canvas regions, cards) — the
 * anti-fake-empty. Route-level failures use ErrorDisplay instead.
 */
export function ErrorCard({ title, description, onRetry, className }: ErrorCardProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-none bg-red-500/10 text-red-400 ring-1 ring-red-500/10">
        <WarningCircle className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-neutral-100">{title}</h3>
      {description && <p className="max-w-sm text-sm text-neutral-400">{description}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex h-9 items-center rounded-none border border-neutral-800 px-4 text-sm text-neutral-200 transition-colors duration-fast ease-apple hover:border-neutral-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
        >
          Retry
        </button>
      )}
    </div>
  )
}
