import { DashboardSkeleton } from '@/components/skeletons'

/**
 * The public shell before there is anything to put in it: the rail's width, the content
 * panel and a dashboard's skeleton. It has no state and reads nothing, so the server, the
 * first client render and the loading state draw exactly the same thing.
 */
export function PublicShellSkeleton() {
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-neutral-950" aria-busy="true">
      <div className="relative hidden shrink-0 overflow-hidden bg-transparent md:block" style={{ width: 64 }}>
        <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-neutral-800/10 to-transparent" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="hidden h-12 shrink-0 md:block" />
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-none border border-neutral-800 bg-neutral-950 md:mb-3 md:mr-3">
          <div className="flex-1 overflow-hidden pt-4">
            <DashboardSkeleton />
          </div>
        </div>
      </div>
    </div>
  )
}
