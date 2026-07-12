'use client'

// Token-migrated dashboard preview. Decorative only (aria-hidden). Mirrors the
// website's twin: raw palette values are gone — semantic tokens throughout, SVG
// strokes ride `currentColor` + text-* classes, sentiment stays green/red.
export function PulseMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[440px]" aria-hidden="true">
      <div className="space-y-3 border border-border bg-card px-5 py-4">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-sm font-bold text-foreground">Ciphera</h3>
              <p className="text-[10px] text-muted-foreground">ciphera.net</p>
            </div>
            <div className="flex items-center gap-1.5 border border-border px-2.5 py-0.5">
              <div className="h-1.5 w-1.5 bg-green-500" />
              <span className="text-[10px] font-medium text-muted-foreground">4 current visitors</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Neutral export affordance — the real dashboard's export is a
                quiet icon, never an orange button (orange is spent on data). */}
            <button tabIndex={-1} className="flex cursor-default items-center gap-1.5 border border-border bg-card px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </button>
            <div className="flex cursor-default items-center gap-1 border border-border bg-card px-2.5 py-1 text-[10px] text-muted-foreground">
              Last 30 days
              <svg className="h-2.5 w-2.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Filter button */}
        <div>
          <button tabIndex={-1} className="flex cursor-default items-center gap-1.5 border border-border bg-muted px-2.5 py-1 text-[10px] text-muted-foreground">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filter
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2">
          {/* Unique Visitors — selected/highlighted */}
          <div className="relative border border-border bg-muted p-2.5">
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />
            <p className="text-[10px] font-semibold text-primary">Unique visitors</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <p className="text-base font-bold leading-none text-foreground">247</p>
              <span className="flex items-center gap-0.5 text-[10px] font-medium text-red-500">
                <svg className="h-2 w-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7" />
                </svg>
                12%
              </span>
            </div>
          </div>

          {/* Total Pageviews */}
          <div className="border border-border bg-card p-2.5">
            <p className="text-[10px] font-semibold text-muted-foreground">Total pageviews</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <p className="text-base font-bold leading-none text-foreground">512</p>
              <span className="flex items-center gap-0.5 text-[10px] font-medium text-red-500">
                <svg className="h-2 w-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7" />
                </svg>
                23%
              </span>
            </div>
          </div>

          {/* Bounce Rate */}
          <div className="border border-border bg-card p-2.5">
            <p className="text-[10px] font-semibold text-muted-foreground">Bounce rate</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <p className="text-base font-bold leading-none text-foreground">68%</p>
              <span className="flex items-center gap-0.5 text-[10px] font-medium text-green-500">
                <svg className="h-2 w-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7" />
                </svg>
                8%
              </span>
            </div>
          </div>

          {/* Visit Duration */}
          <div className="border border-border bg-card p-2.5">
            <p className="text-[10px] font-semibold text-muted-foreground">Visit duration</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <p className="text-base font-bold leading-none text-foreground">3m 18s</p>
              <span className="flex items-center gap-0.5 text-[10px] font-medium text-red-500">
                <svg className="h-2 w-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7" />
                </svg>
                15%
              </span>
            </div>
          </div>
        </div>

        {/* Chart area */}
        <div className="border border-border bg-card p-3">
          {/* Chart header */}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-medium text-foreground">Unique visitors</span>
            <div className="flex items-center gap-2">
              <div className="flex cursor-default items-center gap-1 border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                1 day
                <svg className="h-2 w-2 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 border border-border bg-transparent" />
                <span className="text-[10px] text-muted-foreground">Compare</span>
              </div>
            </div>
          </div>

          {/* SVG Chart — step-style like the real dashboard */}
          <div className="relative h-[120px] w-full">
            {/* Y-axis labels */}
            <div className="absolute bottom-4 left-0 top-0 flex w-5 flex-col justify-between text-[10px] text-muted-foreground">
              <span>8</span>
              <span>6</span>
              <span>4</span>
              <span>2</span>
              <span>0</span>
            </div>

            {/* Chart */}
            <svg className="absolute bottom-4 left-6 right-0 top-0" viewBox="0 0 400 100" preserveAspectRatio="none">
              {/* Grid lines */}
              <line x1="0" y1="0" x2="400" y2="0" stroke="currentColor" className="text-border" />
              <line x1="0" y1="25" x2="400" y2="25" stroke="currentColor" className="text-border" />
              <line x1="0" y1="50" x2="400" y2="50" stroke="currentColor" className="text-border" />
              <line x1="0" y1="75" x2="400" y2="75" stroke="currentColor" className="text-border" />
              <line x1="0" y1="100" x2="400" y2="100" stroke="currentColor" className="text-border" />

              {/* Area fill — step-style chart */}
              <path
                d="M0,62 L45,62 L45,62 L90,62 L90,100 L135,100 L135,100 L160,100 L160,62 L180,62 L180,50 L225,50 L225,25 L270,25 L270,25 L290,25 L290,50 L310,50 L310,62 L340,62 L340,62 L370,62 L370,55 L400,55 L400,100 L0,100 Z"
                fill="url(#pulseMockupGradient)"
              />

              {/* Line — step-style */}
              <path
                d="M0,62 L45,62 L45,62 L90,62 L90,100 L135,100 L135,100 L160,100 L160,62 L180,62 L180,50 L225,50 L225,25 L270,25 L270,25 L290,25 L290,50 L310,50 L310,62 L340,62 L340,62 L370,62 L370,55 L400,55"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-primary"
              />

              <defs>
                <linearGradient id="pulseMockupGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" className="text-primary" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" className="text-primary" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* X-axis labels */}
          <div className="mt-0.5 flex justify-between pl-6 text-[10px] text-muted-foreground">
            <span>01:00</span>
            <span>04:00</span>
            <span>07:00</span>
            <span>10:00</span>
            <span>13:00</span>
            <span>16:00</span>
            <span>19:00</span>
          </div>
        </div>

        {/* Live indicator */}
        <div className="flex items-center justify-end gap-1.5">
          <div className="h-1.5 w-1.5 bg-green-500" />
          <span className="text-[10px] text-muted-foreground">Live · 27 seconds ago</span>
        </div>
      </div>
    </div>
  )
}
