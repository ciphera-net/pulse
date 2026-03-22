'use client'

export function EmailReportMockup() {
  return (
    <div className="relative w-full max-w-[460px] mx-auto">
      <div className="rounded-xl border border-white/[0.08] bg-neutral-900/90 shadow-2xl overflow-hidden">
        {/* Pulse logo header */}
        <div className="px-6 pt-5 pb-3">
          <div className="flex items-center gap-2.5 mb-3">
            <svg className="w-5 h-5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2" /></svg>
            <span className="text-base font-bold text-white">Pulse</span>
          </div>
          <div className="h-[3px] bg-brand-orange rounded-full" />
        </div>

        {/* Report content */}
        <div className="px-6 pb-5">
          <div className="rounded-xl bg-neutral-800/50 border border-neutral-700/40 p-5">
            <h3 className="text-lg font-bold text-white mb-0.5">ciphera.net</h3>
            <p className="text-xs text-neutral-500 mb-3">Daily summary report &middot; 19 Mar 2026</p>

            <p className="text-sm text-brand-orange font-semibold mb-4">Traffic down 6% compared to yesterday</p>

            {/* Stats grid */}
            <div className="grid grid-cols-4 gap-2 mb-5">
              {[
                { label: 'PAGEVIEWS', value: '323', change: '2%', down: true },
                { label: 'VISITORS', value: '207', change: '6%', down: true },
                { label: 'BOUNCE', value: '97%', change: '0%', down: false },
                { label: 'DURATION', value: '3m 18s', change: '7%', down: false },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg bg-neutral-900/80 border border-neutral-700/30 px-1.5 py-2.5 text-center">
                  <p className="text-[7px] text-neutral-500 uppercase tracking-wider mb-1">{stat.label}</p>
                  <p className="text-sm font-bold text-white leading-none mb-1">{stat.value}</p>
                  <p className={`text-[8px] font-semibold ${stat.down ? 'text-red-400' : 'text-green-400'}`}>
                    {stat.down ? '\u25BC' : '\u25B2'} {stat.change}
                  </p>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="border-t border-neutral-700/40 mb-3" />

            {/* Top Pages */}
            <h4 className="text-[10px] text-brand-orange font-bold uppercase tracking-wider mb-2">Top Pages</h4>
            <div className="flex items-center justify-between text-[8px] text-neutral-500 uppercase tracking-wider mb-1.5 px-0.5">
              <span>Page</span>
              <span>Views</span>
            </div>

            <div className="space-y-0.5">
              {[
                { page: '/', views: 100 },
                { page: '/products/drop', views: 96 },
                { page: '/pricing', views: 42 },
              ].map((row) => (
                <div key={row.page}>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 h-[20px]">
                      <div
                        className="absolute inset-y-0 left-0 rounded-md bg-brand-orange/20"
                        style={{ width: `${(row.views / 100) * 75}%` }}
                      />
                    </div>
                    <span className="text-xs text-neutral-400 tabular-nums w-7 text-right shrink-0">{row.views}</span>
                  </div>
                  <span className="text-[11px] text-neutral-300 ml-0.5">{row.page}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Schedule indicator */}
          <div className="flex items-center justify-between mt-3 px-1 text-[10px] text-neutral-500">
            <span>Delivered every day at 09:00</span>
            <span className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Sent
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
