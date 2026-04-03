'use client'

import { useEffect, useState } from 'react'
import { LoadingOverlay, toast } from '@ciphera-net/ui'
import {
  getAdminQuarantineStats,
  getAdminQuarantineEvents,
  getAdminReputation,
  adminReputationOverride,
  getAdminReputationStats,
} from '@/lib/api/admin'
import type { QuarantinedEvent, QuarantineStats, DomainReputation, ReputationStats } from '@/lib/api/quarantine'
import { formatDateTime, formatRelativeTime } from '@/lib/utils/formatDate'

type Tab = 'overview' | 'events' | 'reputation'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'events', label: 'Events' },
  { key: 'reputation', label: 'Reputation' },
]

const REASON_COLORS: Record<string, string> = {
  bot_ua: 'bg-red-900/30 text-red-400',
  spam_keyword: 'bg-red-900/30 text-red-400',
  reputation: 'bg-orange-900/30 text-orange-400',
  heuristic: 'bg-orange-900/30 text-orange-400',
  delayed_eval: 'bg-yellow-900/30 text-yellow-400',
  manual: 'bg-neutral-800 text-neutral-400',
}

const METHOD_COLORS: Record<string, string> = {
  instant: 'bg-blue-900/30 text-blue-400',
  learned: 'bg-purple-900/30 text-purple-400',
  delayed: 'bg-yellow-900/30 text-yellow-400',
  manual: 'bg-neutral-800 text-neutral-400',
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-red-900/30 text-red-400',
  medium: 'bg-orange-900/30 text-orange-400',
  low: 'bg-yellow-900/30 text-yellow-400',
}

const ACTION_COLORS: Record<string, string> = {
  quarantine: 'bg-red-900/30 text-red-400',
  monitor: 'bg-yellow-900/30 text-yellow-400',
  allow: 'bg-green-900/30 text-green-400',
}

const SOURCE_COLORS: Record<string, string> = {
  matomo_seed: 'bg-blue-900/30 text-blue-400',
  learned: 'bg-purple-900/30 text-purple-400',
  manual: 'bg-neutral-800 text-neutral-400',
}

function Badge({ label, colorClass }: { label: string; colorClass?: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorClass || 'bg-neutral-800 text-neutral-400'}`}
    >
      {label}
    </span>
  )
}

const PAGE_SIZE = 50

// ============================================================================
// Overview Tab
// ============================================================================

function OverviewTab({ stats, loading }: { stats: QuarantineStats | null; loading: boolean }) {
  if (loading || !stats) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Loading quarantine stats..." />
  }

  const statCards = [
    { label: 'Total Quarantined', value: stats.total_quarantined },
    { label: 'Last 24h', value: stats.last_24h },
    { label: 'Last 7d', value: stats.last_7d },
    { label: 'Last 30d', value: stats.last_30d },
  ]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-sm"
          >
            <p className="text-sm text-neutral-400">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold text-white tabular-nums">
              {card.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* By reason */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-white mb-4">By Reason</h3>
          {Object.keys(stats.by_reason).length === 0 ? (
            <p className="text-sm text-neutral-400">No data</p>
          ) : (
            <ul className="space-y-2">
              {Object.entries(stats.by_reason)
                .sort(([, a], [, b]) => b - a)
                .map(([reason, count]) => (
                  <li key={reason} className="flex items-center justify-between">
                    <Badge label={reason} colorClass={REASON_COLORS[reason]} />
                    <span className="text-sm text-white tabular-nums">{count.toLocaleString()}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>

        {/* By method */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-white mb-4">By Method</h3>
          {Object.keys(stats.by_method).length === 0 ? (
            <p className="text-sm text-neutral-400">No data</p>
          ) : (
            <ul className="space-y-2">
              {Object.entries(stats.by_method)
                .sort(([, a], [, b]) => b - a)
                .map(([method, count]) => (
                  <li key={method} className="flex items-center justify-between">
                    <Badge label={method} colorClass={METHOD_COLORS[method]} />
                    <span className="text-sm text-white tabular-nums">{count.toLocaleString()}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Events Tab
// ============================================================================

function EventsTab() {
  const [events, setEvents] = useState<QuarantinedEvent[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [days, setDays] = useState(30)
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState('')
  const [domain, setDomain] = useState('')

  useEffect(() => {
    setLoading(true)
    const endDate = new Date().toISOString().split('T')[0]
    const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
    getAdminQuarantineEvents({
      reason: reason || undefined,
      method: method || undefined,
      domain: domain || undefined,
      start_date: startDate,
      end_date: endDate,
      limit: PAGE_SIZE,
      offset,
    })
      .then((data) => {
        setEvents(data.events || [])
        setTotal(data.total || 0)
      })
      .finally(() => setLoading(false))
  }, [days, reason, method, domain, offset])

  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + PAGE_SIZE, total)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={reason}
          onChange={(e) => { setReason(e.target.value); setOffset(0) }}
          className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-neutral-600"
        >
          <option value="">All reasons</option>
          {['bot_ua', 'spam_keyword', 'reputation', 'heuristic', 'delayed_eval', 'manual'].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <select
          value={method}
          onChange={(e) => { setMethod(e.target.value); setOffset(0) }}
          className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-neutral-600"
        >
          <option value="">All methods</option>
          {['instant', 'learned', 'delayed', 'manual'].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Filter by domain..."
          value={domain}
          onChange={(e) => { setDomain(e.target.value); setOffset(0) }}
          className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-600"
        />

        <div className="ml-auto flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => { setDays(d); setOffset(0) }}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                days === d
                  ? 'bg-white text-neutral-900'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading events...</div>
        ) : events.length === 0 ? (
          <div className="p-12 text-center text-neutral-400">No quarantined events found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-800">
                <tr>
                  <th className="px-4 py-3 font-medium text-neutral-400">Time</th>
                  <th className="px-4 py-3 font-medium text-neutral-400">Session</th>
                  <th className="px-4 py-3 font-medium text-neutral-400">Path</th>
                  <th className="px-4 py-3 font-medium text-neutral-400">Referrer</th>
                  <th className="px-4 py-3 font-medium text-neutral-400">Reason</th>
                  <th className="px-4 py-3 font-medium text-neutral-400">Method</th>
                  <th className="px-4 py-3 font-medium text-neutral-400 text-right">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {events.map((ev) => (
                  <tr key={ev.id} className="hover:bg-neutral-900/50">
                    <td className="px-4 py-3 text-xs text-neutral-300 whitespace-nowrap">
                      {formatDateTime(new Date(ev.quarantined_at))}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-neutral-500">
                      {ev.session_id.substring(0, 10)}...
                    </td>
                    <td className="px-4 py-3 text-xs text-white max-w-[200px] truncate">
                      {ev.path}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-400 max-w-[180px] truncate">
                      {ev.referrer || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={ev.detection_reason} colorClass={REASON_COLORS[ev.detection_reason]} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={ev.detection_method} colorClass={METHOD_COLORS[ev.detection_method]} />
                    </td>
                    <td className="px-4 py-3 text-xs text-white tabular-nums text-right">
                      {(ev.confidence_score * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-neutral-400">
          <span>Showing {from}-{to} of {total.toLocaleString()}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 text-neutral-400 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            <button
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 text-neutral-400 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Reputation Tab
// ============================================================================

function ReputationTab() {
  const [domains, setDomains] = useState<DomainReputation[]>([])
  const [total, setTotal] = useState(0)
  const [repStats, setRepStats] = useState<ReputationStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [action, setAction] = useState('')
  const [source, setSource] = useState('')
  const [sort, setSort] = useState('bot_ratio')
  const [overrideLoading, setOverrideLoading] = useState<string | null>(null)

  const fetchDomains = () => {
    setLoading(true)
    getAdminReputation({
      action: action || undefined,
      source: source || undefined,
      sort,
      limit: PAGE_SIZE,
      offset,
    })
      .then((data) => {
        setDomains(data.domains || [])
        setTotal(data.total || 0)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    getAdminReputationStats().then(setRepStats)
  }, [])

  useEffect(() => {
    fetchDomains()
  }, [action, source, sort, offset])

  const handleOverride = async (domain: string, newAction: 'allow' | 'quarantine') => {
    setOverrideLoading(domain)
    try {
      await adminReputationOverride(domain, newAction)
      toast.success(`${domain} set to ${newAction}`)
      fetchDomains()
    } catch {
      toast.error(`Failed to update ${domain}`)
    } finally {
      setOverrideLoading(null)
    }
  }

  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + PAGE_SIZE, total)

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      {repStats && (
        <div className="flex flex-wrap gap-4 text-sm text-neutral-400">
          <span><strong className="text-white">{repStats.total_domains.toLocaleString()}</strong> domains</span>
          <span><strong className="text-white">{repStats.auto_quarantined.toLocaleString()}</strong> auto-quarantined</span>
          <span><strong className="text-white">{repStats.seed_domains.toLocaleString()}</strong> seed</span>
          <span><strong className="text-white">{repStats.learned_domains.toLocaleString()}</strong> learned</span>
          <span><strong className="text-white">{repStats.manual_overrides.toLocaleString()}</strong> manual</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={action}
          onChange={(e) => { setAction(e.target.value); setOffset(0) }}
          className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-neutral-600"
        >
          <option value="">All actions</option>
          {['quarantine', 'monitor', 'allow'].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select
          value={source}
          onChange={(e) => { setSource(e.target.value); setOffset(0) }}
          className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-neutral-600"
        >
          <option value="">All sources</option>
          {['matomo_seed', 'learned', 'manual'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <div className="ml-auto flex gap-2">
          {[
            { key: 'bot_ratio', label: 'Bot Ratio' },
            { key: 'total_events', label: 'Events' },
            { key: 'last_seen', label: 'Last Seen' },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => { setSort(s.key); setOffset(0) }}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                sort === s.key
                  ? 'bg-white text-neutral-900'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading domains...</div>
        ) : domains.length === 0 ? (
          <div className="p-12 text-center text-neutral-400">No domains found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-800">
                <tr>
                  <th className="px-4 py-3 font-medium text-neutral-400">Domain</th>
                  <th className="px-4 py-3 font-medium text-neutral-400 text-right">Events</th>
                  <th className="px-4 py-3 font-medium text-neutral-400 text-right">Bot Events</th>
                  <th className="px-4 py-3 font-medium text-neutral-400 text-right">Bot Ratio</th>
                  <th className="px-4 py-3 font-medium text-neutral-400">Confidence</th>
                  <th className="px-4 py-3 font-medium text-neutral-400">Action</th>
                  <th className="px-4 py-3 font-medium text-neutral-400">Source</th>
                  <th className="px-4 py-3 font-medium text-neutral-400">Last Seen</th>
                  <th className="px-4 py-3 font-medium text-neutral-400"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {domains.map((d) => (
                  <tr key={d.domain} className="hover:bg-neutral-900/50">
                    <td className="px-4 py-3 text-xs font-mono text-white">{d.domain}</td>
                    <td className="px-4 py-3 text-xs text-white tabular-nums text-right">
                      {d.total_events.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-white tabular-nums text-right">
                      {d.bot_events.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-white tabular-nums text-right">
                      {(d.bot_ratio * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={d.confidence} colorClass={CONFIDENCE_COLORS[d.confidence]} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={d.action} colorClass={ACTION_COLORS[d.action]} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={d.source} colorClass={SOURCE_COLORS[d.source]} />
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-400 whitespace-nowrap">
                      {formatRelativeTime(d.last_seen)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        {d.action !== 'allow' && (
                          <button
                            onClick={() => handleOverride(d.domain, 'allow')}
                            disabled={overrideLoading === d.domain}
                            className="px-2 py-1 text-xs rounded-md bg-green-900/30 text-green-400 hover:bg-green-900/50 disabled:opacity-40 transition-colors"
                          >
                            Allow
                          </button>
                        )}
                        {d.action !== 'quarantine' && (
                          <button
                            onClick={() => handleOverride(d.domain, 'quarantine')}
                            disabled={overrideLoading === d.domain}
                            className="px-2 py-1 text-xs rounded-md bg-red-900/30 text-red-400 hover:bg-red-900/50 disabled:opacity-40 transition-colors"
                          >
                            Quarantine
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-neutral-400">
          <span>Showing {from}-{to} of {total.toLocaleString()}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 text-neutral-400 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            <button
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 text-neutral-400 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Page
// ============================================================================

export default function AdminQuarantinePage() {
  const [tab, setTab] = useState<Tab>('overview')
  const [stats, setStats] = useState<QuarantineStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  useEffect(() => {
    getAdminQuarantineStats()
      .then(setStats)
      .finally(() => setStatsLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Quarantine & Reputation</h2>
        <p className="text-sm text-neutral-400 mt-1">
          Monitor quarantined traffic, review events, and manage domain reputation
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-neutral-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-white text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab stats={stats} loading={statsLoading} />}
      {tab === 'events' && <EventsTab />}
      {tab === 'reputation' && <ReputationTab />}
    </div>
  )
}
