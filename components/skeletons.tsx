/**
 * Reusable skeleton loading primitives and composites for Pulse.
 * All skeletons follow the design-system pattern:
 *   animate-pulse + bg-neutral-100 dark:bg-neutral-800 + rounded
 */

const SK = 'animate-pulse bg-neutral-100 dark:bg-neutral-800'

export { useMinimumLoading } from './useMinimumLoading'

// ─── Primitives ──────────────────────────────────────────────

export function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`${SK} rounded ${className}`} />
}

export function SkeletonCircle({ className = '' }: { className?: string }) {
  return <div className={`${SK} rounded-full ${className}`} />
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return <div className={`${SK} rounded-2xl ${className}`} />
}

// ─── List skeleton (icon + two text lines per row) ───────────

export function ListRowSkeleton() {
  return (
    <div className="flex items-center justify-between h-9 px-2 -mx-2">
      <div className="flex items-center gap-3 flex-1">
        <SkeletonLine className="h-5 w-5 rounded shrink-0" />
        <SkeletonLine className="h-4 w-3/5" />
      </div>
      <SkeletonLine className="h-4 w-12" />
    </div>
  )
}

export function ListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <ListRowSkeleton key={i} />
      ))}
    </div>
  )
}

// ─── Table skeleton (header row + data rows) ─────────────────

export function TableSkeleton({ rows = 7, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      <div className={`grid gap-2 mb-2 px-2`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonLine key={`th-${i}`} className="h-4" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={`tr-${i}`} className="grid gap-2 h-9 px-2 -mx-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((_, j) => (
            <SkeletonLine key={`td-${i}-${j}`} className="h-4" />
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Widget panel skeleton (used inside dashboard grid) ──────

export function WidgetSkeleton() {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <SkeletonLine className="h-6 w-32" />
        <div className="flex gap-1">
          <SkeletonLine className="h-7 w-16 rounded-lg" />
          <SkeletonLine className="h-7 w-16 rounded-lg" />
        </div>
      </div>
      <div className="space-y-2 flex-1 min-h-[270px]">
        <ListSkeleton rows={7} />
      </div>
    </div>
  )
}

// ─── Stat card skeleton ──────────────────────────────────────

export function StatCardSkeleton() {
  return (
    <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <SkeletonLine className="h-4 w-20 mb-2" />
      <SkeletonLine className="h-8 w-28" />
    </div>
  )
}

// ─── Chart area skeleton ─────────────────────────────────────

export function ChartSkeleton() {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <SkeletonLine className="h-3 w-16" />
              <SkeletonLine className="h-7 w-24" />
            </div>
          ))}
        </div>
        <SkeletonLine className="h-8 w-32 rounded-lg" />
      </div>
      <SkeletonLine className="h-64 w-full rounded-xl" />
    </div>
  )
}

// ─── Full dashboard skeleton ─────────────────────────────────

export function DashboardSkeleton() {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div>
              <SkeletonLine className="h-8 w-48 mb-2" />
              <SkeletonLine className="h-4 w-32" />
            </div>
            <SkeletonLine className="h-8 w-40 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <SkeletonLine className="h-10 w-24 rounded-lg" />
            <SkeletonLine className="h-10 w-36 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="mb-8">
        <ChartSkeleton />
      </div>

      {/* Widget grid (2 cols) */}
      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <WidgetSkeleton />
        <WidgetSkeleton />
      </div>
      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <WidgetSkeleton />
        <WidgetSkeleton />
      </div>

      {/* Campaigns table */}
      <div className="mb-8">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6">
          <SkeletonLine className="h-6 w-32 mb-4" />
          <TableSkeleton rows={7} cols={5} />
        </div>
      </div>
    </div>
  )
}

// ─── Realtime page skeleton ──────────────────────────────────

export function RealtimeSkeleton() {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 h-[calc(100vh-64px)] flex flex-col">
      <div className="mb-6">
        <SkeletonLine className="h-4 w-32 mb-2" />
        <SkeletonLine className="h-8 w-64" />
      </div>
      <div className="flex flex-col md:flex-row flex-1 gap-6 min-h-0">
        {/* Visitors list */}
        <div className="w-full md:w-1/3 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden flex flex-col bg-white dark:bg-neutral-900">
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
            <SkeletonLine className="h-6 w-32" />
          </div>
          <div className="p-2 space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="p-4 space-y-2">
                <div className="flex justify-between">
                  <SkeletonLine className="h-4 w-32" />
                  <SkeletonLine className="h-4 w-16" />
                </div>
                <SkeletonLine className="h-3 w-48" />
                <div className="flex gap-2">
                  <SkeletonLine className="h-3 w-16" />
                  <SkeletonLine className="h-3 w-16" />
                  <SkeletonLine className="h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Session details */}
        <div className="flex-1 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden bg-white dark:bg-neutral-900">
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
            <SkeletonLine className="h-6 w-40" />
          </div>
          <div className="p-6 space-y-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4 pl-6">
                <SkeletonCircle className="h-3 w-3 shrink-0 mt-1" />
                <div className="space-y-1 flex-1">
                  <SkeletonLine className="h-4 w-48" />
                  <SkeletonLine className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Session events skeleton (for loading events panel) ──────

export function SessionEventsSkeleton() {
  return (
    <div className="relative pl-6 border-l-2 border-neutral-100 dark:border-neutral-800 space-y-8">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="relative">
          <span className={`absolute -left-[29px] top-1 h-3 w-3 rounded-full ${SK}`} />
          <div className="space-y-1">
            <SkeletonLine className="h-4 w-48" />
            <SkeletonLine className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Uptime page skeleton ────────────────────────────────────

export function UptimeSkeleton() {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <SkeletonLine className="h-4 w-32 mb-2" />
        <SkeletonLine className="h-8 w-24 mb-1" />
        <SkeletonLine className="h-4 w-64" />
      </div>
      {/* Overall status */}
      <SkeletonCard className="h-20 mb-6" />
      {/* Monitor cards */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SkeletonCircle className="w-3 h-3" />
                <SkeletonLine className="h-5 w-32" />
                <SkeletonLine className="h-4 w-48 hidden sm:block" />
              </div>
              <SkeletonLine className="h-4 w-28" />
            </div>
            <SkeletonLine className="h-8 w-full rounded-sm" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Checks / Response time skeleton ─────────────────────────

export function ChecksSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonLine className="h-40 w-full rounded-xl" />
      <div className="space-y-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-1.5 px-2">
            <div className="flex items-center gap-2">
              <SkeletonCircle className="w-2 h-2" />
              <SkeletonLine className="h-3 w-32" />
            </div>
            <SkeletonLine className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Funnels list skeleton ───────────────────────────────────

export function FunnelsListSkeleton() {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-6">
          <SkeletonLine className="h-10 w-10 rounded-xl" />
          <div>
            <SkeletonLine className="h-8 w-24 mb-1" />
            <SkeletonLine className="h-4 w-64" />
          </div>
        </div>
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6">
              <SkeletonLine className="h-6 w-40 mb-2" />
              <SkeletonLine className="h-4 w-64 mb-4" />
              <div className="flex items-center gap-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="flex items-center">
                    <SkeletonLine className="h-7 w-20 rounded-lg" />
                    {j < 2 && <SkeletonLine className="h-4 w-4 mx-2 rounded" />}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Funnel detail skeleton ──────────────────────────────────

export function FunnelDetailSkeleton() {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <SkeletonLine className="h-4 w-32 mb-2" />
        <SkeletonLine className="h-8 w-48 mb-1" />
        <SkeletonLine className="h-4 w-64" />
      </div>
      <SkeletonCard className="h-80 mb-8" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} className="h-28" />
        ))}
      </div>
    </div>
  )
}

// ─── Notifications list skeleton ─────────────────────────────

export function NotificationsListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
          <SkeletonCircle className="h-10 w-10 shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonLine className="h-4 w-3/4" />
            <SkeletonLine className="h-3 w-1/2" />
          </div>
          <SkeletonLine className="h-3 w-16 shrink-0" />
        </div>
      ))}
    </div>
  )
}

// ─── Settings form skeleton ──────────────────────────────────

export function SettingsFormSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <SkeletonLine className="h-4 w-24" />
          <SkeletonLine className="h-10 w-full rounded-lg" />
        </div>
      ))}
      <SkeletonLine className="h-10 w-28 rounded-lg" />
    </div>
  )
}

// ─── Goals list skeleton ─────────────────────────────────────

export function GoalsListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-3 px-4 rounded-2xl border border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <SkeletonLine className="h-4 w-24" />
            <SkeletonLine className="h-3 w-20" />
          </div>
          <div className="flex items-center gap-2">
            <SkeletonLine className="h-4 w-10" />
            <SkeletonLine className="h-4 w-12" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Pricing cards skeleton ──────────────────────────────────

export function PricingCardsSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
      {Array.from({ length: 3 }).map((_, i) => (
        <SkeletonCard key={i} className="h-96" />
      ))}
    </div>
  )
}

// ─── Organization settings skeleton (members, billing, etc) ─

export function MembersListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
          <SkeletonCircle className="h-10 w-10 shrink-0" />
          <div className="flex-1 space-y-1">
            <SkeletonLine className="h-4 w-32" />
            <SkeletonLine className="h-3 w-48" />
          </div>
          <SkeletonLine className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function InvoicesListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-3 px-4 rounded-lg">
          <div className="flex items-center gap-3">
            <SkeletonLine className="h-4 w-24" />
            <SkeletonLine className="h-4 w-16" />
          </div>
          <SkeletonLine className="h-4 w-20" />
        </div>
      ))}
    </div>
  )
}

export function AuditLogSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2 px-4">
          <SkeletonLine className="h-3 w-28" />
          <SkeletonLine className="h-3 w-16" />
          <SkeletonLine className="h-3 w-48 flex-1" />
        </div>
      ))}
    </div>
  )
}
