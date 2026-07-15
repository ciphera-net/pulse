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
import FunnelModal, { type FunnelPrefill } from '@/components/funnels/FunnelModal'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { useUrlDateRange, type Period } from '@/lib/hooks/useUrlDateRange'
import { useCan } from '@/lib/auth/permissions'

// * ?prefill=<encodeURIComponent(JSON)> seeds the create modal (journeys lens
// * cross-link). Parsed defensively — malformed input just opens nothing.
function parsePrefill(raw: string | null): FunnelPrefill | null {
  if (!raw) return null
  try {
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object') return null
    const rawSteps = Array.isArray(p.steps) ? p.steps.slice(0, 8) : []
    const steps = rawSteps
      .filter((s: unknown): s is Record<string, unknown> => !!s && typeof s === 'object')
      .map((s: Record<string, unknown>, i: number) => ({
        name: typeof s.name === 'string' && s.name ? s.name : `Step ${i + 1}`,
        value: typeof s.value === 'string' ? s.value : '',
        type: s.type === 'contains' || s.type === 'regex' ? (s.type as string) : 'exact',
        category: s.category === 'event' ? ('event' as const) : ('page' as const),
      }))
    return {
      name: typeof p.name === 'string' ? p.name : undefined,
      description: typeof p.description === 'string' ? p.description : undefined,
      steps: steps.length > 0 ? steps : undefined,
    }
  } catch {
    return null
  }
}

export default function FunnelsPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const siteId = params.id as string
  const canManageFunnels = useCan('funnels.manage')

  const { data: site } = useSite(siteId)
  const { data: funnels, error: funnelsError, isLoading, mutate } = useFunnels(siteId)
  const { period, dateRange, setPeriod, shiftPeriod } = useUrlDateRange()
  const [deletingFunnel, setDeletingFunnel] = useState<{ id: string; name: string } | null>(null)
  const [prefill, setPrefill] = useState<FunnelPrefill | null>(() => parsePrefill(searchParams.get('prefill')))
  const [modalOpen, setModalOpen] = useState<boolean>(() => parsePrefill(searchParams.get('prefill')) !== null || searchParams.get('create') === '1')
  const [editingFunnel, setEditingFunnel] = useState<Funnel | null>(null)

  // * Consume the prefill/create params once — the modal is open, the URL cleaned
  useEffect(() => {
    if (!searchParams.get('prefill') && !searchParams.get('create')) return
    const url = new URL(window.location.href)
    url.searchParams.delete('prefill')
    url.searchParams.delete('create')
    window.history.replaceState({}, '', url.toString())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          siteId={siteId}
          onClose={() => { setModalOpen(false); setEditingFunnel(null); setPrefill(null) }}
          initialData={editingFunnel ?? undefined}
          prefill={!editingFunnel ? prefill ?? undefined : undefined}
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
