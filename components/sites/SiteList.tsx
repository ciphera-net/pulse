'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listSites, deleteSite, type Site } from '@/lib/api/sites'
import { toast } from 'sonner'
import LoadingOverlay from '../LoadingOverlay'
import { BarChartIcon } from '@radix-ui/react-icons'

export default function SiteList() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSites()
  }, [])

  const loadSites = async () => {
    try {
      setLoading(true)
      const data = await listSites()
      setSites(Array.isArray(data) ? data : [])
    } catch (error: any) {
      toast.error('Failed to load sites: ' + (error.message || 'Unknown error'))
      setSites([]) // Ensure sites is always an array
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this site? This action cannot be undone.')) {
      return
    }

    try {
      await deleteSite(id)
      toast.success('Site deleted successfully')
      loadSites()
    } catch (error: any) {
      toast.error('Failed to delete site: ' + (error.message || 'Unknown error'))
    }
  }

  if (loading) {
    return <LoadingOverlay logoSrc="/ciphera_icon_no_margins.png" title="Ciphera Analytics" />
  }

  if (sites.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-12 text-center">
        <h3 className="text-lg font-medium text-neutral-900 dark:text-white">No sites yet</h3>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">Create your first site to get started.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {sites.map((site) => (
        <div
          key={site.id}
          className="flex flex-col rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
        >
          <h3 className="text-xl font-semibold mb-2 text-neutral-900 dark:text-white">{site.name}</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">{site.domain}</p>
          <div className="flex gap-2 mt-auto">
            <Link
              href={`/sites/${site.id}`}
              className="btn-primary text-sm inline-flex items-center justify-center gap-2 flex-1"
            >
              <BarChartIcon className="w-4 h-4" />
              View Dashboard
            </Link>
            <button
              type="button"
              onClick={() => handleDelete(site.id)}
              className="shrink-0 text-sm text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 py-2 px-2"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
