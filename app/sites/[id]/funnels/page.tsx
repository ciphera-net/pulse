'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { DURATION_BASE, EASE_APPLE } from '@/lib/motion'
import { deleteFunnel, type Funnel } from '@/lib/api/funnels'
import { useFunnels, useFunnelStats } from '@/lib/swr/dashboard'
import { toast, PlusIcon, ArrowRightIcon, ChevronLeftIcon, TrashIcon, Button, formatNumber } from '@ciphera-net/ui'
import { FunnelsListSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import { EmptyState } from '@/components/ui/EmptyState'
import { FunnelSimple } from '@phosphor-icons/react'
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { getDateRange } from '@/lib/utils/dateRanges'

function FunnelCardStats({ siteId, funnelId }: { siteId: string; funnelId: string }) {
  const range = getDateRange(30)
  const { data: stats } = useFunnelStats(siteId, funnelId, range.start, range.end)

  if (!stats || stats.steps.length === 0) return null

  const firstStep = stats.steps[0]
  const lastStep = stats.steps[stats.steps.length - 1]
  const conversion = lastStep.conversion

  const color = conversion >= 50 ? 'text-green-400' : conversion >= 20 ? 'text-amber-400' : 'text-red-400'

  return (
    <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/[0.08]">
      <div>
        <span className="text-xs text-neutral-500">Visitors</span>
        <p className="text-sm font-medium text-white tabular-nums">{formatNumber(firstStep.visitors)}</p>
      </div>
      <div>
        <span className="text-xs text-neutral-500">Converted</span>
        <p className="text-sm font-medium text-white tabular-nums">{formatNumber(lastStep.visitors)}</p>
      </div>
      <div>
        <span className="text-xs text-neutral-500">Conversion</span>
        <p className={`text-sm font-medium tabular-nums ${color}`}>{Math.round(conversion)}%</p>
      </div>
      <span className="text-xs text-neutral-600 ml-auto">Last 30 days</span>
    </div>
  )
}

export default function FunnelsPage() {
  const params = useParams()
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
    } catch {
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
            <h1 className="text-lg font-semibold text-neutral-200 mb-1">
              Funnels
            </h1>
            <p className="text-sm text-neutral-400">
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
          <EmptyState
            icon={<FunnelSimple />}
            title="No funnels yet"
            description="Create a funnel to track how visitors move through your site and where they drop off."
            action={{ label: 'Create funnel', href: `/sites/${siteId}/funnels/new` }}
          />
        ) : (
          <div className="grid gap-4">
            {funnels.map((funnel, index) => (
              <motion.div
                key={funnel.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DURATION_BASE, ease: EASE_APPLE, delay: index * 0.05 }}
              >
              <Link
                href={`/sites/${siteId}/funnels/${funnel.id}`}
                className="block group"
              >
                <div className="glass-surface rounded-2xl p-6 hover:border-brand-orange/50 transition-colors ease-apple">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-white group-hover:text-brand-orange transition-colors ease-apple">
                        {funnel.name}
                      </h3>
                      {funnel.description && (
                        <p className="text-sm text-neutral-400 mt-1">
                          {funnel.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-3">
                        {funnel.steps.map((step, i) => (
                          <div key={step.name} className="flex items-center text-sm text-neutral-500">
                            <span className="px-2 py-1 bg-neutral-800 rounded-lg text-neutral-300">
                              {step.name}
                            </span>
                            {i < funnel.steps.length - 1 && (
                              <ArrowRightIcon className="w-4 h-4 mx-2 text-neutral-600" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 ml-4">
                      <button
                        onClick={(e) => { e.preventDefault(); setDeletingFunnel({ id: funnel.id, name: funnel.name }) }}
                        className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-900/20 rounded-xl transition-colors ease-apple"
                        aria-label="Delete funnel"
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                      <ChevronLeftIcon className="w-5 h-5 text-neutral-500 rotate-180" />
                    </div>
                  </div>
                  <FunnelCardStats siteId={siteId} funnelId={funnel.id} />
                </div>
              </Link>
              </motion.div>
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
