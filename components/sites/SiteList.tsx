'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { listSites, deleteSite, type Site } from '@/lib/api/sites'
import { toast } from 'sonner'
import LoadingOverlay from '../LoadingOverlay'

export default function SiteList() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

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
      <div className="text-center py-12">
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">No sites yet. Create your first site to get started.</p>
        <button
          onClick={() => router.push('/sites/new')}
          className="btn-primary"
        >
          Create Site
        </button>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {sites.map((site) => (
        <div
          key={site.id}
          className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 hover:shadow-lg transition-shadow"
        >
          <h3 className="text-xl font-semibold mb-2 text-neutral-900 dark:text-white">
            {site.name}
          </h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
            {site.domain}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => router.push(`/sites/${site.id}`)}
              className="btn-primary flex-1 text-sm"
            >
              View Dashboard
            </button>
            <button
              onClick={() => handleDelete(site.id)}
              className="btn-secondary text-sm px-4"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={() => router.push('/sites/new')}
        className="bg-white dark:bg-neutral-900 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl p-6 hover:border-brand-orange transition-colors text-neutral-600 dark:text-neutral-400"
      >
        <div className="text-center">
          <div className="text-2xl mb-2">+</div>
          <div>Add New Site</div>
        </div>
      </button>
    </div>
  )
}
