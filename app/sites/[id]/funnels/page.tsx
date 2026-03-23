'use client'

import { useParams, useRouter } from 'next/navigation'
import { deleteFunnel, type Funnel } from '@/lib/api/funnels'
import { useFunnels } from '@/lib/swr/dashboard'
import { toast, PlusIcon, ArrowRightIcon, ChevronLeftIcon, TrashIcon, Button } from '@ciphera-net/ui'
import { FunnelsListSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import Link from 'next/link'
import Image from 'next/image'

export default function FunnelsPage() {
  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string

  const { data: funnels = [], isLoading, mutate } = useFunnels(siteId)

  const handleDelete = async (e: React.MouseEvent, funnelId: string) => {
    e.preventDefault() // Prevent navigation
    if (!confirm('Are you sure you want to delete this funnel?')) return

    try {
      await deleteFunnel(siteId, funnelId)
      toast.success('Funnel deleted')
      mutate()
    } catch (error) {
      toast.error('Failed to delete funnel')
    }
  }

  const showSkeleton = useMinimumLoading(isLoading && !funnels.length)
  const fadeClass = useSkeletonFade(showSkeleton)

  if (showSkeleton) {
    return <FunnelsListSkeleton />
  }

  return (
    <div className={`w-full max-w-6xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
              Funnels
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              Track user journeys and identify drop-off points
            </p>
          </div>
          <Link href={`/sites/${siteId}/funnels/new`}>
            <Button variant="primary" className="inline-flex items-center gap-2">
              <PlusIcon className="w-4 h-4" />
              <span>Create Funnel</span>
            </Button>
          </Link>
        </div>

        {funnels.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-12 text-center flex flex-col items-center">
            <Image
              src="/illustrations/data-trends.svg"
              alt="Create your first funnel"
              width={260}
              height={195}
              className="mb-6"
              unoptimized
            />
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
              No funnels yet
            </h3>
            <p className="text-neutral-600 dark:text-neutral-400 mb-6 max-w-md mx-auto">
              Create a funnel to track how users move through your site and where they drop off.
            </p>
            <Link href={`/sites/${siteId}/funnels/new`}>
              <Button variant="primary" className="inline-flex items-center gap-2">
                <PlusIcon className="w-4 h-4" />
                <span>Create Funnel</span>
              </Button>
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
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 hover:border-brand-orange/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-neutral-900 dark:text-white group-hover:text-brand-orange transition-colors">
                        {funnel.name}
                      </h3>
                      {funnel.description && (
                        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                          {funnel.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-4">
                        {funnel.steps.map((step, i) => (
                          <div key={step.name} className="flex items-center text-sm text-neutral-500">
                            <span className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-neutral-700 dark:text-neutral-300">
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
                        className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                        aria-label="Delete funnel"
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
