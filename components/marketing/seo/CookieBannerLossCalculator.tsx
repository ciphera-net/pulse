'use client'

import { useMemo, useState } from 'react'

/** Parse a possibly-empty numeric field to a clamped number, or null. */
function parse(value: string, min: number, max: number): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(Math.max(n, min), max)
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

export function CookieBannerLossCalculator() {
  // Seeded with an illustrative example the visitor should replace with their
  // own numbers — deliberately NOT presented as a measured accept rate.
  const [visitorsInput, setVisitorsInput] = useState('50000')
  const [rateInput, setRateInput] = useState('60')

  const visitors = parse(visitorsInput, 0, 1_000_000_000)
  const rate = parse(rateInput, 0, 100)

  const result = useMemo(() => {
    if (visitors === null || rate === null) return null
    const seenMonthly = visitors * (rate / 100)
    const invisibleMonthly = visitors - seenMonthly
    return {
      seenMonthly,
      invisibleMonthly,
      invisibleYearly: invisibleMonthly * 12,
    }
  }, [visitors, rate])

  return (
    <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_1.1fr]">
      {/* Inputs */}
      <div className="space-y-6">
        <div>
          <label htmlFor="cb-visitors" className="text-sm font-medium text-foreground">
            Monthly visitors
          </label>
          <input
            id="cb-visitors"
            type="number"
            min={0}
            inputMode="numeric"
            value={visitorsInput}
            onChange={(e) => setVisitorsInput(e.target.value)}
            placeholder="50000"
            className="mt-2 w-full rounded-none border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none ring-ring focus-visible:ring-2"
          />
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Your real total monthly visitors — everyone who arrives, before any consent prompt.
          </p>
        </div>

        <div>
          <label htmlFor="cb-rate" className="text-sm font-medium text-foreground">
            Consent-accept rate (%)
          </label>
          <input
            id="cb-rate"
            type="number"
            min={0}
            max={100}
            inputMode="decimal"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            placeholder="60"
            className="mt-2 w-full rounded-none border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none ring-ring focus-visible:ring-2"
          />
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            The share of visitors who accept your cookie banner. Use your own measured figure — this
            varies enormously by audience, region and banner design, so the number here is only an
            illustrative starting point.
          </p>
        </div>
      </div>

      {/* Outputs */}
      <div>
        <div className="grid gap-px border border-border bg-border sm:grid-cols-2">
          <div className="bg-card p-6">
            <p className="font-mono text-xs text-muted-foreground">Invisible / month</p>
            <p className="mt-2 font-display text-4xl font-bold tabular-nums text-foreground">
              {result ? fmt(result.invisibleMonthly) : '—'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              visitors a consent-gated tool never counts
            </p>
          </div>
          <div className="relative bg-card p-6">
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-primary" />
            <p className="font-mono text-xs text-primary">Invisible / year</p>
            <p className="mt-2 font-display text-4xl font-bold tabular-nums text-foreground">
              {result ? fmt(result.invisibleYearly) : '—'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              at the same rate, over twelve months
            </p>
          </div>
        </div>

        {result && (
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            At {fmt(visitors ?? 0)} monthly visitors and a {rate}% accept rate, a cookie-based
            analytics tool records roughly{' '}
            <span className="font-semibold text-foreground">{fmt(result.seenMonthly)}</span> of them
            and misses{' '}
            <span className="font-semibold text-foreground">{fmt(result.invisibleMonthly)}</span>{' '}
            every month. A cookieless tool that needs no banner counts all of them.
          </p>
        )}

        <div className="mt-6 border border-border bg-card p-5">
          <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            Methodology
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This is plain arithmetic on the numbers you enter:{' '}
            <span className="font-mono text-foreground/80">
              invisible = visitors × (1 − accept rate)
            </span>
            . It is not based on any study or industry benchmark, and it assumes your consent-gated
            analytics only runs after acceptance. Real accept rates vary widely — measure your own
            for an accurate figure. The calculation runs entirely in your browser; nothing is sent
            anywhere.
          </p>
        </div>
      </div>
    </div>
  )
}
