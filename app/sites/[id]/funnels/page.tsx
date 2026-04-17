'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { deleteFunnel, type Funnel } from '@/lib/api/funnels'
import { useFunnels } from '@/lib/swr/dashboard'
import { toast, PlusIcon, ArrowRightIcon, ChevronLeftIcon, TrashIcon, Button } from '@ciphera-net/ui'
import { FunnelsListSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import Link from 'next/link'
import Image from 'next/image'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

export default function FunnelsPage() {
  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string

  const { data: funnels = [], isLoading, mutate } = useFunnels(siteId)
  const [deletingFunnel, setDeletingFunnel] = useState<{ id: string; name: string } | null>(null)

  const handleDelete = async () => {
    if (!deletingFunnel) return

    try {
      await deleteFunnel(siteId, deletingFunnel.id)
      toast.success('Funnel deleted')
      setDeletingFunnel(null)
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
    <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-neutral-200">
              Funnels
            </h1>
            <p className="text-neutral-400">
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
          <div className="glass-surface rounded-2xl p-12 text-center flex flex-col items-center">
            <Image
              src="/illustrations/data-trends.svg"
              alt="Create your first funnel"
              width={260}
              height={195}
              className="mb-6"
              unoptimized
            />
            <h3 className="text-lg font-semibold text-white mb-2">
              No funnels yet
            </h3>
            <p className="text-neutral-400 mb-6 max-w-md mx-auto">
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
                <div className="glass-surface rounded-2xl p-6 hover:border-brand-orange/50 transition-colors ease-apple">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-semibold text-white group-hover:text-brand-orange transition-colors ease-apple">
                        {funnel.name}
                      </h3>
                      {funnel.description && (
                        <p className="text-sm text-neutral-400 mt-1">
                          {funnel.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-4">
                        {funnel.steps.map((step, i) => (
                          <div key={step.name} className="flex items-center text-sm text-neutral-500">
                            <span className="px-2 py-1 bg-neutral-800 rounded-lg text-neutral-300">
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
                        onClick={(e) => { e.preventDefault(); setDeletingFunnel({ id: funnel.id, name: funnel.name }) }}
                        className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-900/20 rounded-xl transition-colors ease-apple"
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

      <Dialog open={!!deletingFunnel} onOpenChange={() => setDeletingFunnel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete funnel</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deletingFunnel?.name}&rdquo;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setDeletingFunnel(null)} className="glass-surface rounded-lg px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white transition-colors ease-apple">
              Cancel
            </button>
            <button onClick={handleDelete} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 transition-colors ease-apple">
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
