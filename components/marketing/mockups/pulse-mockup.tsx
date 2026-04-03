'use client'

/**
 * Miniature dashboard mockup matching the real Pulse dashboard layout.
 * Used on marketing pages and the welcome flow left panel.
 */

/* Mini sparkline SVG for the selected stat card */
function MiniSparkline() {
  return (
    <svg viewBox="0 0 50 20" className="w-10 h-4" preserveAspectRatio="none">
      <path
        d="M0,18 C8,17 16,16 22,13 C28,10 32,5 37,3 C42,1 46,4 50,8 L50,20 L0,20 Z"
        fill="url(#miniSparkGrad)"
      />
      <path
        d="M0,18 C8,17 16,16 22,13 C28,10 32,5 37,3 C42,1 46,4 50,8"
        fill="none"
        stroke="#FD5E0F"
        strokeWidth="1.5"
      />
      <defs>
        <linearGradient id="miniSparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FD5E0F" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#FD5E0F" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/* The main chart curve — same path for line and fill */
const CURVE = 'M0,97 L30,97 C60,97 80,96 120,94 C150,92 170,90 200,85 C230,78 250,68 270,52 C285,40 295,28 310,18 C325,8 340,5 355,8 C370,12 380,25 390,40 C395,48 400,55 400,58'

export function PulseMockup() {
  return (
    <div className="relative w-full max-w-[480px] mx-auto">
      <div className="rounded-xl border border-white/[0.08] bg-neutral-900/80 shadow-2xl overflow-hidden">

        {/* Stat cards — flat row matching real dashboard */}
        <div className="flex border-b border-neutral-800">
          {/* Unique Visitors — selected */}
          <div className="flex-1 px-3 py-3 relative min-w-0">
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-orange" />
            <p className="text-[7px] font-semibold uppercase tracking-wider text-brand-orange leading-tight">Unique Visitors</p>
            <div className="flex items-end gap-2 mt-1">
              <p className="text-lg font-bold text-white leading-none">247</p>
              <MiniSparkline />
            </div>
          </div>

          {/* Total Pageviews */}
          <div className="flex-1 px-3 py-3 border-l border-neutral-800 min-w-0">
            <p className="text-[7px] font-semibold uppercase tracking-wider text-neutral-500 leading-tight">Total Pageviews</p>
            <p className="text-lg font-bold text-white leading-none mt-1">512</p>
          </div>

          {/* Bounce Rate */}
          <div className="flex-1 px-3 py-3 border-l border-neutral-800 min-w-0">
            <p className="text-[7px] font-semibold uppercase tracking-wider text-neutral-500 leading-tight">Bounce Rate</p>
            <p className="text-lg font-bold text-white leading-none mt-1">68%</p>
          </div>

          {/* Visit Duration */}
          <div className="flex-1 px-3 py-3 border-l border-neutral-800 min-w-0">
            <p className="text-[7px] font-semibold uppercase tracking-wider text-neutral-500 leading-tight">Visit Duration</p>
            <p className="text-lg font-bold text-white leading-none mt-1">3m 18s</p>
          </div>

          {/* Engagement */}
          <div className="flex-1 px-3 py-3 border-l border-neutral-800 min-w-0">
            <p className="text-[7px] font-semibold uppercase tracking-wider text-neutral-500 leading-tight">Engagement</p>
            <p className="text-lg font-bold text-white leading-none mt-1">72</p>
          </div>
        </div>

        {/* Chart section */}
        <div className="px-3 pt-3 pb-2">
          {/* Chart header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-neutral-300 font-medium">Unique Visitors</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800/80 px-2 py-1 text-[8px] text-neutral-300 cursor-default">
                1 day
                <svg className="w-2.5 h-2.5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full border border-neutral-600 bg-transparent" />
                <span className="text-[8px] text-neutral-500">Compare</span>
              </div>
            </div>
          </div>

          {/* SVG Chart */}
          <div className="relative h-[160px] w-full">
            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[7px] text-neutral-600 w-5">
              <span>35</span>
              <span>28</span>
              <span>21</span>
              <span>14</span>
              <span>7</span>
              <span>0</span>
            </div>

            {/* Chart area */}
            <svg className="absolute left-7 right-0 top-0 bottom-0" viewBox="0 0 400 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="pulseMockupGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FD5E0F" stopOpacity="0.5" />
                  <stop offset="50%" stopColor="#FD5E0F" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#FD5E0F" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Dashed grid lines */}
              {[0, 20, 40, 60, 80, 100].map((y) => (
                <line
                  key={y}
                  x1="0" y1={y} x2="400" y2={y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="3 3"
                />
              ))}

              {/* Area fill */}
              <path d={`${CURVE} L400,100 L0,100 Z`} fill="url(#pulseMockupGradient)" />

              {/* Line */}
              <path d={CURVE} fill="none" stroke="#FD5E0F" strokeWidth="2" />
            </svg>
          </div>

          {/* X-axis labels */}
          <div className="flex justify-between pl-7 text-[7px] text-neutral-600 mt-1 pb-1">
            <span>28 Mar</span>
            <span>29 Mar</span>
            <span>30 Mar</span>
            <span>31 Mar</span>
            <span>1 Apr</span>
            <span>2 Apr</span>
            <span>3 Apr</span>
          </div>
        </div>
      </div>
    </div>
  )
}
