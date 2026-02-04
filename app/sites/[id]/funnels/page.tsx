'use client'

import { useAuth } from '@/lib/auth/context'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { listFunnels, deleteFunnel, type Funnel } from '@/lib/api/funnels'
import { toast, LoadingOverlay, PlusIcon, ArrowRightIcon, ChevronLeftIcon, TrashIcon } from '@ciphera-net/ui'
import Link from 'next/link'

export default function FunnelsPage() {
  const { user } = useAuth()
  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string

  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFunnels()
  }, [siteId])

  const loadFunnels = async () => {
    try {
      setLoading(true)
      const data = await listFunnels(siteId)
      setFunnels(data)
    } catch (error) {
      toast.error('Failed to load funnels')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent, funnelId: string) => {
    e.preventDefault() // Prevent navigation
    if (!confirm('Are you sure you want to delete this funnel?')) return

    try {
      await deleteFunnel(siteId, funnelId)
      toast.success('Funnel deleted')
      loadFunnels()
    } catch (error) {
      toast.error('Failed to delete funnel')
    }
  }

  if (loading) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" />
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-6">
          <Link 
            href={`/sites/${siteId}`}
            className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
              Funnels
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              Track user journeys and identify drop-off points
            </p>
          </div>
          <div className="ml-auto">
            <Link
              href={`/sites/${siteId}/funnels/new`}
              className="flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange/90 transition-colors font-medium"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Create Funnel</span>
            </Link>
          </div>
        </div>

        {funnels.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center">
              <ArrowRightIcon className="w-8 h-8 text-neutral-400" />
            </div>
            <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-2">
              No funnels yet
            </h3>
            <p className="text-neutral-600 dark:text-neutral-400 mb-6 max-w-md mx-auto">
              Create a funnel to track how users move through your site and where they drop off.
            </p>
            <Link
              href={`/sites/${siteId}/funnels/new`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange/90 transition-colors font-medium"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Create Funnel</span>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {funnels.map((funnel) => (
              <Link
                key={funnel.id}
                href={`/sites/${siteId}/funnels/${funnel.id}`}
                className="block group"
              >
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 hover:border-brand-orange/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-neutral-900 dark:text-white group-hover:text-brand-orange transition-colors">
                        {funnel.name}
                      </h3>
                      {funnel.description && (
                        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                          {funnel.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-4">
                        {funnel.steps.map((step, i) => (
                          <div key={i} className="flex items-center text-sm text-neutral-500">
                            <span className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded text-neutral-700 dark:text-neutral-300">
                              {step.name}
                            </span>
                            {i < funnel.steps.length - 1 && (
                              <ArrowRightIcon className="w-4 h-4 mx-2 text-neutral-300" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={(e) => handleDelete(e, funnel.id)}
                        className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                      <ChevronLeftIcon className="w-5 h-5 text-neutral-300 rotate-180" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
