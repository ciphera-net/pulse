'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { DURATION_BASE, EASE_APPLE } from '@/lib/motion'
import { deleteFunnel, createFunnel, updateFunnel, type Funnel, type CreateFunnelRequest } from '@/lib/api/funnels'
import { useSite, useFunnels } from '@/lib/swr/dashboard'
import { toast, PlusIcon, Button } from '@ciphera-net/facet'
import { FunnelsListSkeleton } from '@/components/skeletons'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { FunnelSummaryCard } from '@/components/funnels/FunnelSummaryCard'
import { FunnelSimple } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import FunnelModal from '@/components/funnels/FunnelModal'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { useFunnelDateRange, type Period } from '@/lib/hooks/useFunnelDateRange'
import { useCan } from '@/lib/auth/permissions'

export default function FunnelsPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const siteId = params.id as string
  const canManageFunnels = useCan('funnels.manage')

  const { data: site } = useSite(siteId)
  const { data: funnels, error: funnelsError, isLoading, mutate } = useFunnels(siteId)
  const { period, dateRange, setPeriod, shiftPeriod } = useFunnelDateRange()
  const [deletingFunnel, setDeletingFunnel] = useState<{ id: string; name: string } | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingFunnel, setEditingFunnel] = useState<Funnel | null>(null)

  useEffect(() => {
    const domain = site?.domain
    document.title = domain ? `Funnels · ${domain} | Pulse` : 'Funnels | Pulse'
  }, [site?.domain])

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

  // * First-ever load only — refetches keep the previous list mounted.
  if (isLoading && !funnels) return <FunnelsListSkeleton />

  // * Detail links carry the current range so the page opens where you were.
  const qs = searchParams.toString()
  const hrefQuery = qs ? `?${qs}` : ''
  const list = funnels ?? []

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-200 mb-1">Funnels</h1>
          <p className="text-sm text-neutral-400">Track user journeys and identify drop-off points</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker
            period={period}
            dateRange={dateRange}
            onPeriodChange={(p) => setPeriod(p as Period)}
            onDateRangeChange={(range) => setPeriod('custom', range)}
            onShift={shiftPeriod}
          />
          {/* * The empty state below carries its own create CTA — showing this
           * header button too meant two identical orange CTAs on one screen. */}
          {canManageFunnels && list.length > 0 && (
            <Button variant="default" onClick={() => { setEditingFunnel(null); setModalOpen(true) }}>
              <PlusIcon className="w-4 h-4" />
              Create funnel
            </Button>
          )}
        </div>
      </div>

      {funnelsError ? (
        <ErrorCard
          title="Couldn't load funnels"
          description="The funnels request failed. Your funnels are safe — this is a loading problem."
          onRetry={() => { void mutate() }}
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<FunnelSimple />}
          title="No funnels yet"
          description="Create a funnel to track how visitors move through your site and where they drop off."
          action={canManageFunnels ? { label: 'Create funnel', onClick: () => { setEditingFunnel(null); setModalOpen(true) } } : undefined}
        />
      ) : (
        <div className="grid gap-3">
          {list.map((funnel, index) => (
            <motion.div
              key={funnel.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION_BASE, ease: EASE_APPLE, delay: Math.min(index * 0.04, 0.12) }}
            >
              <FunnelSummaryCard
                funnel={funnel}
                siteId={siteId}
                dateRange={dateRange}
                hrefQuery={hrefQuery}
                canManage={canManageFunnels}
                onEdit={(f) => { setEditingFunnel(f); setModalOpen(true) }}
                onDelete={setDeletingFunnel}
              />
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={!!deletingFunnel} onOpenChange={() => setDeletingFunnel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete funnel</DialogTitle>
            <DialogDescription>Are you sure you want to delete &ldquo;{deletingFunnel?.name}&rdquo;? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeletingFunnel(null)}>Cancel</Button>
            <Button variant="default" className="bg-red-600 hover:bg-red-500 shadow-none" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {modalOpen && canManageFunnels && (
        <FunnelModal
          isOpen={modalOpen}
          onClose={() => { setModalOpen(false); setEditingFunnel(null) }}
          initialData={editingFunnel ?? undefined}
          onSubmit={async (data: CreateFunnelRequest) => {
            if (editingFunnel) {
              await updateFunnel(siteId, editingFunnel.id, data)
              toast.success('Funnel updated')
            } else {
              await createFunnel(siteId, data)
              toast.success('Funnel created')
            }
            mutate()
          }}
        />
      )}
    </div>
  )
}
