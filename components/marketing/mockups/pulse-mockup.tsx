'use client'

export function PulseMockup() {
  return (
    <div className="relative w-full max-w-[440px] mx-auto">
      <div className="rounded-xl border border-white/[0.08] bg-neutral-900/80 px-5 py-4 shadow-2xl space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-sm font-bold text-white">Ciphera</h3>
              <p className="text-[9px] text-neutral-500">ciphera.net</p>
            </div>
            <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-full px-2.5 py-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-[9px] text-green-400 font-medium">4 current visitors</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 rounded-lg bg-brand-orange px-2.5 py-1 text-[10px] font-medium text-white cursor-default">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </button>
            <div className="flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-[10px] text-neutral-300 cursor-default">
              Today
              <svg className="w-2.5 h-2.5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Filter button */}
        <div>
          <button className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800/50 px-2.5 py-1 text-[10px] text-neutral-400 cursor-default">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filter
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2">
          {/* Unique Visitors — selected/highlighted */}
          <div className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-2.5 relative">
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-orange rounded-b-lg" />
            <p className="text-[7px] text-brand-orange font-semibold uppercase tracking-wider">Unique Visitors</p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <p className="text-base font-bold text-white leading-none">247</p>
              <span className="text-[8px] text-red-500 font-medium flex items-center gap-0.5">
                <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7" />
                </svg>
                12%
              </span>
            </div>
            <p className="text-[8px] text-neutral-500 mt-0.5">vs yesterday</p>
          </div>

          {/* Total Pageviews */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2.5">
            <p className="text-[7px] text-neutral-500 font-semibold uppercase tracking-wider">Total Pageviews</p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <p className="text-base font-bold text-white leading-none">512</p>
              <span className="text-[8px] text-red-500 font-medium flex items-center gap-0.5">
                <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7" />
                </svg>
                23%
              </span>
            </div>
            <p className="text-[8px] text-neutral-500 mt-0.5">vs yesterday</p>
          </div>

          {/* Bounce Rate */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2.5">
            <p className="text-[7px] text-neutral-500 font-semibold uppercase tracking-wider">Bounce Rate</p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <p className="text-base font-bold text-white leading-none">68%</p>
              <span className="text-[8px] text-green-500 font-medium flex items-center gap-0.5">
                <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7" />
                </svg>
                8%
              </span>
            </div>
            <p className="text-[8px] text-neutral-500 mt-0.5">vs yesterday</p>
          </div>

          {/* Visit Duration */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2.5">
            <p className="text-[7px] text-neutral-500 font-semibold uppercase tracking-wider">Visit Duration</p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <p className="text-base font-bold text-white leading-none">3m 18s</p>
              <span className="text-[8px] text-red-500 font-medium flex items-center gap-0.5">
                <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7" />
                </svg>
                15%
              </span>
            </div>
            <p className="text-[8px] text-neutral-500 mt-0.5">vs yesterday</p>
          </div>
        </div>

        {/* Chart area */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
          {/* Chart header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-neutral-300 font-medium">Unique Visitors</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[9px] text-neutral-300 cursor-default">
                1 hour
                <svg className="w-2 h-2 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded border border-neutral-700 bg-transparent" />
                <span className="text-[9px] text-neutral-500">Compare</span>
                <svg className="w-3 h-3 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <svg className="w-3 h-3 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </div>
          </div>

          {/* SVG Chart — step-style like the real dashboard */}
          <div className="relative h-[120px] w-full">
            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 bottom-4 flex flex-col justify-between text-[7px] text-neutral-600 w-5">
              <span>8</span>
              <span>6</span>
              <span>4</span>
              <span>2</span>
              <span>0</span>
            </div>

            {/* Chart */}
            <svg className="absolute left-6 right-0 top-0 bottom-4" viewBox="0 0 400 100" preserveAspectRatio="none">
              {/* Grid lines */}
              <line x1="0" y1="0" x2="400" y2="0" stroke="rgba(255,255,255,0.04)" />
              <line x1="0" y1="25" x2="400" y2="25" stroke="rgba(255,255,255,0.04)" />
              <line x1="0" y1="50" x2="400" y2="50" stroke="rgba(255,255,255,0.04)" />
              <line x1="0" y1="75" x2="400" y2="75" stroke="rgba(255,255,255,0.04)" />
              <line x1="0" y1="100" x2="400" y2="100" stroke="rgba(255,255,255,0.04)" />

              {/* Area fill — step-style chart */}
              <path
                d="M0,62 L45,62 L45,62 L90,62 L90,100 L135,100 L135,100 L160,100 L160,62 L180,62 L180,50 L225,50 L225,25 L270,25 L270,25 L290,25 L290,50 L310,50 L310,62 L340,62 L340,62 L370,62 L370,55 L400,55 L400,100 L0,100 Z"
                fill="url(#pulseMockupGradient)"
              />

              {/* Line — step-style */}
              <path
                d="M0,62 L45,62 L45,62 L90,62 L90,100 L135,100 L135,100 L160,100 L160,62 L180,62 L180,50 L225,50 L225,25 L270,25 L270,25 L290,25 L290,50 L310,50 L310,62 L340,62 L340,62 L370,62 L370,55 L400,55"
                fill="none"
                stroke="#FD5E0F"
                strokeWidth="2"
              />

              <defs>
                <linearGradient id="pulseMockupGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FD5E0F" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#FD5E0F" stopOpacity="0.02" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* X-axis labels */}
          <div className="flex justify-between pl-6 text-[7px] text-neutral-600 mt-0.5">
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
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[9px] text-neutral-500">Live · 27 seconds ago</span>
        </div>
      </div>
    </div>
  )
}
