/**
 * Route-level loading skeleton for /settings/* (spec §2 — a cold, slow load
 * must never flash a blank content area). This file is the Suspense fallback
 * for the page segment: it renders INSIDE SettingsShell's content column, so
 * the masthead and nav rail come from the shell (verified live — rendering our
 * own here would double them). We fill only the content column with two
 * PanelRow-shaped ghost panels, reusing the SettingsLoadingState idioms
 * (animate-pulse, bg-input bars, semantic tokens only).
 */
export default function SettingsLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading settings" className="space-y-8">
      {[0, 1].map((p) => (
        <div key={p} className="animate-pulse rounded-none border border-border bg-card">
          {/* Panel header ghost — kicker + one-line description. */}
          <div className="border-b border-border px-5 py-4">
            <div className="h-3 w-24 rounded-none bg-input" />
            <div className="mt-2 h-3.5 w-56 max-w-full rounded-none bg-input/70" />
          </div>
          {/* PanelRow ghosts — label bar + value bar per row. */}
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-1 gap-x-4 gap-y-2 px-5 py-3.5 md:grid-cols-[220px_1fr_auto] md:items-center"
              >
                <div className="h-3.5 w-24 rounded-none bg-input" />
                <div className="h-8 w-full max-w-xs rounded-none bg-input" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
