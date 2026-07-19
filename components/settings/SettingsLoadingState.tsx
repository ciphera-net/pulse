/**
 * SettingsLoadingState — the house loading idiom for settings: a skeleton
 * shaped like a panel of PanelRows (divide-y, animate-pulse), NOT a spinner.
 * A loading state that mirrors the populated layout reads as "this is filling
 * in" rather than "something is spinning".
 */
export default function SettingsLoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div
      className="rounded-none border border-border bg-card"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="animate-pulse divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[minmax(160px,220px)_1fr] items-center gap-x-4 px-5 py-3.5"
          >
            <div className="h-3.5 w-24 rounded-none bg-input" />
            <div className="h-8 w-full max-w-xs justify-self-start rounded-none bg-input" />
          </div>
        ))}
      </div>
    </div>
  )
}
