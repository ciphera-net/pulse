'use client'

import type { UptimeMonitor } from '@/lib/api/uptime'
import { UPTIME_NEG, UPTIME_DEGRADED } from './uptimeMetrics'

// ---------------------------------------------------------------------------
// The monitor strip — the check's configuration stated honestly in one
// hairline band: endpoint, cadence, expectation, timeout, TLS. Machine data
// (URL, status code) is mono; labels are sans, per the house typography rule.
// ---------------------------------------------------------------------------

function tlsCell(m: UptimeMonitor): { value: React.ReactNode } {
  if (!m.tls_expires_at) return { value: <span className="text-neutral-500">—</span> }
  const days = Math.ceil((new Date(m.tls_expires_at).getTime() - Date.now()) / 86_400_000)
  if (days < 0) {
    return {
      value: (
        <span className="text-sm tabular-nums" style={{ color: UPTIME_NEG }}>
          expired {Math.abs(days)} d ago
        </span>
      ),
    }
  }
  const tone = days < 14 ? UPTIME_DEGRADED : undefined
  return {
    value: (
      <span className="text-sm tabular-nums text-neutral-200" style={tone ? { color: tone } : undefined}>
        valid · {days} d left
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
