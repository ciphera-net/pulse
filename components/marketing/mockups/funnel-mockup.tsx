'use client'

const funnelData = [
  { label: 'Homepage', value: 1240 },
  { label: 'Pricing', value: 438 },
  { label: 'Signup', value: 87 },
]

const maxValue = funnelData[0].value

export function FunnelMockup() {
  return (
    <div className="relative w-full max-w-[600px] mx-auto" aria-hidden="true">
      <div className="rounded-none border border-border bg-card px-10 py-6">
        <h3 className="text-sm font-medium text-foreground mb-4">Funnel Visualization</h3>

        <div className="space-y-4">
          {funnelData.map((step, i) => {
            const pct = (step.value / maxValue) * 100
            const prev = i > 0 ? funnelData[i - 1] : null
            const stepConversion = prev ? Math.round((step.value / prev.value) * 100) : null

            return (
              <div key={step.label}>
                {stepConversion !== null && (
                  <div className="flex items-center justify-center text-[10px] text-muted-foreground mb-2">
                    {stepConversion}% conversion
                  </div>
                )}
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-foreground">{step.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{step.value.toLocaleString()}</span>
                </div>
                <div className="relative h-6 w-full rounded-none bg-primary/25">
                  <div
                    className="absolute inset-y-0 left-0 rounded-none bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border text-[10px] text-muted-foreground">
          <span>Overall conversion: 7%</span>
          <span>7-day window</span>
        </div>
      </div>
    </div>
  )
}
