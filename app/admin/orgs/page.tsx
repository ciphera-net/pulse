'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { listAdminOrgs, type AdminOrgSummary } from '@/lib/api/admin'
import { Button, LoadingOverlay, toast } from '@ciphera-net/ui'

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

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
      className="font-mono text-xs text-neutral-500 hover:text-brand-orange dark:hover:text-brand-orange cursor-pointer transition-colors text-left"
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
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Loading organizations..." />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">Organizations</h2>
      </div>

      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">All Organizations</h3>
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">Name</th>
                  <th className="px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">Org ID</th>
                  <th className="px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">Plan</th>
                  <th className="px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">Status</th>
                  <th className="px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">Limit</th>
                  <th className="px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">Updated</th>
                  <th className="px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {orgs.map((org) => (
                  <tr key={org.organization_id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                    <td className="px-4 py-3 text-neutral-900 dark:text-white font-medium">
                      {org.business_name || 'N/A'}
                    </td>
                    <td className="px-4 py-3">
                      <CopyableOrgId id={org.organization_id} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        org.plan_id === 'business' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                        org.plan_id === 'team' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                        org.plan_id === 'solo' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400'
                      }`}>
                        {org.plan_id}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">
                      {org.subscription_status || '-'}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">
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
