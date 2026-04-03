'use client'

/**
 * Miniature dashboard mockup — renders the REAL dashboard HTML structure
 * at full size then CSS-scales it down. This ensures pixel-perfect fidelity.
 */

/* Sparkline SVG — matches the real Sparkline component rendering */
function Sparkline({ active }: { active?: boolean }) {
  const h = 32
  const linePath = 'M0,28 C8,26 16,24 24,22 C32,20 40,16 50,12 C60,8 68,4 76,3 C84,2 90,6 96,10 C100,12 100,14 100,14'
  const fillPath = `${linePath} L100,${h} L0,${h} Z`

  return (
    <svg
      viewBox={`0 0 100 ${h}`}
      className={`absolute bottom-0 left-0 right-0 w-full z-0 transition-opacity duration-200 ${
        active ? 'opacity-60' : 'opacity-30'
      }`}
      preserveAspectRatio="none"
      style={{ height: '60%' }}
    >
      <path
        d={fillPath}
        className={active ? 'fill-brand-orange/[0.08]' : 'fill-neutral-600/[0.05]'}
      />
      <path
        d={linePath}
        fill="none"
        className={active ? 'stroke-brand-orange' : 'stroke-neutral-600'}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/* The main chart curve path */
const CHART_LINE = 'M0,95 C15,95 30,94 60,93 C90,92 120,90 150,88 C180,85 200,80 220,72 C240,62 255,48 270,35 C285,22 295,12 310,8 C325,4 340,8 355,18 C370,28 385,42 400,55'

/* Full stat card row + chart — rendered at real size */
function DashboardFull() {
  return (
    <div className="bg-neutral-900/80 border border-white/[0.08] rounded-2xl overflow-hidden backdrop-blur-sm" style={{ width: 720 }}>
      {/* Stat cards */}
      <div className="grid grid-cols-6">
        {/* Unique Visitors — selected */}
        <button className="relative overflow-hidden text-start p-4 border-r border-neutral-800 bg-neutral-800/40">
          <div className="relative z-10">
            <div className="flex items-start justify-between mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-brand-orange">
                Unique Visitors
              </div>
            </div>
            <div className="text-2xl font-bold text-white">247</div>
          </div>
          <Sparkline active />
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-brand-orange rounded-full" />
        </button>

        {/* Total Pageviews */}
        <button className="relative overflow-hidden text-start p-4 border-r border-neutral-800">
          <div className="relative z-10">
            <div className="flex items-start justify-between mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                Total Pageviews
              </div>
            </div>
            <div className="text-2xl font-bold text-white">512</div>
          </div>
          <Sparkline />
        </button>

        {/* Pages per Visit */}
        <button className="relative overflow-hidden text-start p-4 border-r border-neutral-800">
          <div className="relative z-10">
            <div className="flex items-start justify-between mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                Pages per Visit
              </div>
            </div>
            <div className="text-2xl font-bold text-white">1.8</div>
          </div>
          <Sparkline />
        </button>

        {/* Bounce Rate */}
        <button className="relative overflow-hidden text-start p-4 border-r border-neutral-800">
          <div className="relative z-10">
            <div className="flex items-start justify-between mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                Bounce Rate
              </div>
            </div>
            <div className="text-2xl font-bold text-white">68%</div>
          </div>
          <Sparkline />
        </button>

        {/* Visit Duration */}
        <button className="relative overflow-hidden text-start p-4 border-r border-neutral-800">
          <div className="relative z-10">
            <div className="flex items-start justify-between mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                Visit Duration
              </div>
            </div>
            <div className="text-2xl font-bold text-white">3m 18s</div>
          </div>
          <Sparkline />
        </button>

        {/* Engagement */}
        <button className="relative overflow-hidden text-start p-4">
          <div className="relative z-10">
            <div className="flex items-start justify-between mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                Engagement
              </div>
            </div>
            <div className="text-2xl font-bold text-white">72</div>
          </div>
          <Sparkline />
        </button>
      </div>

      {/* Chart section */}
      <div className="px-4 py-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <span className="text-xs font-medium text-neutral-400">Unique Visitors</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-1.5 text-xs text-neutral-300 cursor-default">
              1 day
              <svg className="w-3 h-3 text-neutral-500 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded border border-neutral-600 bg-transparent" />
              <span className="text-xs text-neutral-500">Compare</span>
            </div>
            <button className="p-1.5 text-neutral-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <button className="p-1.5 text-neutral-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>

        {/* Chart area */}
        <div className="relative" style={{ height: 220 }}>
          {/* Y-axis */}
          <div className="absolute left-0 top-0 bottom-6 flex flex-col justify-between text-[11px] text-neutral-600 w-8 text-right pr-2">
            <span>35</span>
            <span>28</span>
            <span>21</span>
            <span>14</span>
            <span>7</span>
            <span>0</span>
          </div>

          {/* Chart SVG */}
          <svg className="absolute left-10 right-0 top-0 bottom-6" viewBox="0 0 400 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="mockupChartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FD5E0F" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#FD5E0F" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Dashed grid */}
            {[0, 20, 40, 60, 80, 100].map((y) => (
              <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
            ))}

            {/* Area fill */}
            <path d={`${CHART_LINE} L400,100 L0,100 Z`} fill="url(#mockupChartGrad)" />

            {/* Line */}
            <path d={CHART_LINE} fill="none" stroke="#FD5E0F" strokeWidth="2" />
          </svg>

          {/* X-axis */}
          <div className="absolute left-10 right-0 bottom-0 flex justify-between text-[11px] text-neutral-600">
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

/* Exported mockup — scales the full-size dashboard down */
export function PulseMockup() {
  const scale = 0.62
  const fullWidth = 720
  const fullHeight = 420

  return (
    <div
      className="relative mx-auto"
      style={{
        width: fullWidth * scale,
        height: fullHeight * scale,
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: fullWidth,
          height: fullHeight,
        }}
      >
        <DashboardFull />
      </div>
    </div>
  )
}
