'use client'

/**
 * Miniature dashboard mockup matching the real Pulse dashboard layout.
 * Used on marketing pages and the welcome flow left panel.
 */

const stats = [
  { label: 'Unique Visitors', value: '247', selected: true },
  { label: 'Total Pageviews', value: '512', selected: false },
  { label: 'Bounce Rate', value: '68%', selected: false },
  { label: 'Visit Duration', value: '3m 18s', selected: false },
  { label: 'Engagement', value: '72', selected: false },
]

/* Mini sparkline SVG for the selected stat card */
function MiniSparkline() {
  return (
    <svg viewBox="0 0 50 20" className="w-12 h-5" preserveAspectRatio="none">
      <path
        d="M0,18 C5,16 10,14 15,12 C20,10 22,8 27,5 C32,2 37,3 42,6 C47,9 50,12 50,14"
        fill="none"
        stroke="#FD5E0F"
        strokeWidth="1.5"
      />
      <path
        d="M0,18 C5,16 10,14 15,12 C20,10 22,8 27,5 C32,2 37,3 42,6 C47,9 50,12 50,14 L50,20 L0,20 Z"
        fill="url(#miniSparkGrad)"
      />
      <defs>
        <linearGradient id="miniSparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FD5E0F" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#FD5E0F" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function PulseMockup() {
  return (
    <div className="relative w-full max-w-[440px] mx-auto">
      <div className="rounded-xl border border-white/[0.08] bg-neutral-900/80 px-5 py-4 shadow-2xl space-y-3">

        {/* Stat cards — flat row, no boxes */}
        <div className="flex">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className={`flex-1 py-2 px-2 relative ${
                i < stats.length - 1 ? 'border-r border-neutral-800' : ''
              }`}
            >
              {/* Orange bottom bar on selected */}
              {stat.selected && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-orange" />
              )}
              <p className={`text-[6px] font-semibold uppercase tracking-wider ${
                stat.selected ? 'text-brand-orange' : 'text-neutral-500'
              }`}>
                {stat.label}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-sm font-bold text-white leading-none">{stat.value}</p>
                {stat.selected && <MiniSparkline />}
              </div>
            </div>
          ))}
        </div>

        {/* Chart area */}
        <div className="pt-1">
          {/* Chart header */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-neutral-300 font-medium">Unique Visitors</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[9px] text-neutral-300 cursor-default">
                1 day
                <svg className="w-2 h-2 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded border border-neutral-700 bg-transparent" />
                <span className="text-[9px] text-neutral-500">Compare</span>
              </div>
            </div>
          </div>

          {/* SVG Chart */}
          <div className="relative h-[130px] w-full">
            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 bottom-4 flex flex-col justify-between text-[7px] text-neutral-600 w-5">
              <span>35</span>
              <span>28</span>
              <span>21</span>
              <span>14</span>
              <span>7</span>
              <span>0</span>
            </div>

            {/* Chart */}
            <svg className="absolute left-6 right-0 top-0 bottom-4" viewBox="0 0 400 100" preserveAspectRatio="none">
              {/* Dashed grid lines */}
              {[0, 20, 40, 60, 80, 100].map((y) => (
                <line
                  key={y}
                  x1="0" y1={y} x2="400" y2={y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="4 4"
                />
              ))}

              {/* Area fill */}
              <path
                d="M0,98 C20,98 60,97 100,95 C140,93 160,88 190,75 C220,62 240,40 270,22 C290,12 310,8 330,15 C350,22 370,40 390,55 C395,58 400,60 400,62 L400,100 L0,100 Z"
                fill="url(#pulseMockupGradient)"
              />

              {/* Line */}
              <path
                d="M0,98 C20,98 60,97 100,95 C140,93 160,88 190,75 C220,62 240,40 270,22 C290,12 310,8 330,15 C350,22 370,40 390,55 C395,58 400,60 400,62"
                fill="none"
                stroke="#FD5E0F"
                strokeWidth="2"
              />

              <defs>
                <linearGradient id="pulseMockupGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FD5E0F" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#FD5E0F" stopOpacity="0.02" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* X-axis labels */}
          <div className="flex justify-between pl-6 text-[7px] text-neutral-600 mt-0.5">
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
