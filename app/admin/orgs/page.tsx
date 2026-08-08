'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { listAdminOrgs, type AdminOrgSummary } from '@/lib/api/admin'
import { formatPlanName } from '@/lib/plans'
import { Button, LoadingOverlay, toast } from '@ciphera-net/facet'
import { cdnUrl } from '@/lib/cdn'
import { formatDate } from '@/lib/utils/formatDate'

function CopyableOrgId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    navigator.clipboard.writeText(id)
    setCopied(true)
    toast.success('Org ID copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }, [id])
  return (
    <button
      type="button"
      onClick={copy}
      className="font-mono text-xs text-neutral-500 hover:text-brand-orange cursor-pointer transition-colors text-left ease-apple"
      title="Click to copy"
    >
      {copied ? 'Copied!' : `${id.substring(0, 8)}...`}
    </button>
  )
}

export default function AdminOrgsPage() {
  const [orgs, setOrgs] = useState<AdminOrgSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listAdminOrgs()
      .then(setOrgs)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Loading organizations..." />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Organizations</h2>
      </div>

      <div className="bg-card border border-border rounded-none p-6">
        <h3 className="text-lg font-semibold text-white mb-4">All Organizations</h3>

        {/* ── phone: one card per org ──
            The 7-column table clipped "Status" to "St" and pushed the Actions
            column — the ONLY way into an org — entirely off-screen, inside a
            scroller whose scrollbar is hidden. */}
        <div className="space-y-3 md:hidden">
          {orgs.map((org) => (
            <div key={org.organization_id} className="border border-border p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <span className="min-w-0 font-medium text-white">
                  {org.business_name || <span className="italic text-neutral-500">Unnamed</span>}
                </span>
                <span className={`shrink-0 inline-flex items-center px-2 py-1 rounded-none text-xs font-medium ${
                  org.plan_id === 'business' ? 'bg-purple-900/30 text-purple-400' :
                  org.plan_id === 'team' ? 'bg-blue-900/30 text-blue-400' :
                  org.plan_id === 'solo' ? 'bg-green-900/30 text-green-400' :
                  'bg-neutral-800 text-neutral-400'
                }`}>
                  {formatPlanName(org.plan_id)}
                </span>
              </div>
              <dl className="space-y-1.5 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-neutral-500">Org ID</dt>
                  <dd className="min-w-0"><CopyableOrgId id={org.organization_id} /></dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-neutral-500">Status</dt>
                  <dd className="text-neutral-300">
                    {org.subscription_status || (org.plan_id === 'free' ? 'no subscription' : '—')}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-neutral-500">Limit</dt>
                  <dd className="text-neutral-300">{new Intl.NumberFormat().format(org.pageview_limit)}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-neutral-500">Updated</dt>
                  <dd className="text-neutral-400 text-xs">{formatDate(new Date(org.updated_at))}</dd>
                </div>
              </dl>
              <Link href={`/admin/orgs/${org.organization_id}`} className="mt-3 block">
                <Button variant="ghost" className="w-full">Manage</Button>
              </Link>
            </div>
          ))}
        </div>

        {/* ── md+: the original table, untouched ── */}
        <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-800">
                <tr>
                  <th className="px-4 py-3 font-medium text-neutral-400">Name</th>
                  <th className="px-4 py-3 font-medium text-neutral-400">Org ID</th>
                  <th className="px-4 py-3 font-medium text-neutral-400">Plan</th>
                  <th className="px-4 py-3 font-medium text-neutral-400">Status</th>
                  <th className="px-4 py-3 font-medium text-neutral-400">Limit</th>
                  <th className="px-4 py-3 font-medium text-neutral-400">Updated</th>
                  <th className="px-4 py-3 font-medium text-neutral-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {orgs.map((org) => (
                  <tr key={org.organization_id} className="hover:bg-neutral-900/50">
                    <td className="px-4 py-3 text-white font-medium">
                      {org.business_name || <span className="italic text-neutral-500">Unnamed</span>}
                    </td>
                    <td className="px-4 py-3">
                      <CopyableOrgId id={org.organization_id} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded-none text-xs font-medium ${
                        org.plan_id === 'business' ? 'bg-purple-900/30 text-purple-400' :
                        org.plan_id === 'team' ? 'bg-blue-900/30 text-blue-400' :
                        org.plan_id === 'solo' ? 'bg-green-900/30 text-green-400' :
                        'bg-neutral-800 text-neutral-400'
                      }`}>
                        {formatPlanName(org.plan_id)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-300">
                      {org.subscription_status || (org.plan_id === 'free' ? <span className="text-neutral-500">no subscription</span> : '—')}
                    </td>
                    <td className="px-4 py-3 text-neutral-300">
                      {new Intl.NumberFormat().format(org.pageview_limit)}
                    </td>
                    <td className="px-4 py-3 text-neutral-500 text-xs">
                      {formatDate(new Date(org.updated_at))}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/orgs/${org.organization_id}`}>
                        <Button variant="ghost">Manage</Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
      </div>
    </div>
  )
}
