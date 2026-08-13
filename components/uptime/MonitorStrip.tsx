'use client'

import type { UptimeMonitor } from '@/lib/api/uptime'

// ---------------------------------------------------------------------------
// The monitor strip — the check's configuration stated honestly in one
// hairline band: endpoint, cadence, expectation, timeout, TLS. Machine data
// (URL, status code) is mono; labels are sans, per the house typography rule.
// ---------------------------------------------------------------------------

const DEGRADED = '#fbbf24'

function tlsCell(m: UptimeMonitor): { value: React.ReactNode; tone?: string } {
  if (!m.tls_expires_at) return { value: <span className="text-neutral-500">—</span> }
  const days = Math.ceil((new Date(m.tls_expires_at).getTime() - Date.now()) / 86_400_000)
  const label = days < 0 ? 'expired' : `${days} d left`
  const tone = days < 14 ? DEGRADED : undefined
  return {
    value: (
      <span className="text-sm tabular-nums text-neutral-200" style={tone ? { color: tone } : undefined}>
        valid · {label}
        {m.tls_issuer ? <span className="text-neutral-500"> · {m.tls_issuer}</span> : null}
      </span>
    ),
  }
}

export default function MonitorStrip({ monitor }: { monitor: UptimeMonitor }) {
  const tls = tlsCell(monitor)
  const cells: { label: string; value: React.ReactNode }[] = [
    {
      label: 'Endpoint',
      value: <span className="truncate font-mono text-sm text-neutral-200">{monitor.url}</span>,
    },
    {
      label: 'Interval',
      value: <span className="text-sm tabular-nums text-neutral-200">{Math.round(monitor.check_interval_seconds / 60)} m</span>,
    },
    {
      label: 'Expects',
      value: <span className="font-mono text-sm text-neutral-200">{monitor.expected_status_code}</span>,
    },
    {
      label: 'Timeout',
      value: <span className="text-sm tabular-nums text-neutral-200">{monitor.timeout_seconds} s</span>,
    },
    { label: 'TLS certificate', value: tls.value },
  ]

  return (
    <div className="grid grid-cols-2 rounded-none border border-border bg-card sm:grid-cols-5">
      {cells.map((c) => (
        <div key={c.label} className="flex min-w-0 flex-col gap-1 border-r border-border px-4 py-3 last:border-r-0">
          <span className="text-xs uppercase tracking-wider text-neutral-500">{c.label}</span>
          {c.value}
        </div>
      ))}
    </div>
  )
}
