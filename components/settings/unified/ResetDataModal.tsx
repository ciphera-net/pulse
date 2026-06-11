'use client'

import { useState, useCallback } from 'react'
import { Button, Input, toast, getAuthErrorMessage, AlertTriangleIcon, Spinner } from '@ciphera-net/facet'
import { resetSiteData, type ResetModule } from '@/lib/api/sites'
import { ChartBar, Path, Funnel, Heartbeat, Gauge, Cloud, MagnifyingGlass } from '@phosphor-icons/react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface ResetModuleOption {
  id: ResetModule
  label: string
  description: string
  icon: React.ElementType
  tables: string[]
}

const RESET_MODULES: ResetModuleOption[] = [
  {
    id: 'analytics',
    label: 'Analytics',
    description: 'Pageviews, visitors, events, and aggregated daily stats.',
    icon: ChartBar,
    tables: ['events', 'daily_stats'],
  },
  {
    id: 'journeys',
    label: 'Journeys',
    description: 'Session flows and page transition data.',
    icon: Path,
    tables: ['session_flows', 'path_transitions'],
  },
  {
    id: 'funnels',
    label: 'Funnels',
    description: 'Funnels and goals. Removes all funnel definitions and goal configurations.',
    icon: Funnel,
    tables: ['funnels', 'goals'],
  },
  {
    id: 'uptime',
    label: 'Uptime',
    description: 'Uptime check results and daily uptime stats. Monitors are kept.',
    icon: Heartbeat,
    tables: ['uptime_checks', 'uptime_daily_stats'],
  },
  {
    id: 'pagespeed',
    label: 'PageSpeed',
    description: 'PageSpeed Insights check history. Configuration is kept.',
    icon: Gauge,
    tables: ['pagespeed_checks'],
  },
  {
    id: 'cdn',
    label: 'CDN',
    description: 'Bunny CDN bandwidth and geographic data. Connection is kept.',
    icon: Cloud,
    tables: ['bunny_data', 'bunny_geo_data'],
  },
  {
    id: 'search_console',
    label: 'Search Console',
    description: 'Google Search Console performance data. Connection is kept.',
    icon: MagnifyingGlass,
    tables: ['gsc_data'],
  },
]

interface ResetDataModalProps {
  open: boolean
  onClose: () => void
  onReset: () => void
  siteDomain: string
  siteId: string
}

function validateConfirmation(input: string, siteDomain: string, selectedCount: number): boolean {
  if (selectedCount === 0) return false
  if (selectedCount === RESET_MODULES.length) return input === siteDomain
  return input === 'RESET'
}

export default function ResetDataModal({ open, onClose, onReset, siteDomain, siteId }: ResetDataModalProps) {
  const [selected, setSelected] = useState<Set<ResetModule>>(new Set())
  const [confirmInput, setConfirmInput] = useState('')
  const [isResetting, setIsResetting] = useState(false)

  const handleClose = useCallback(() => {
    if (isResetting) return
    setSelected(new Set())
    setConfirmInput('')
    setIsResetting(false)
    onClose()
  }, [isResetting, onClose])

  const toggleModule = (id: ResetModule) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === RESET_MODULES.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(RESET_MODULES.map(m => m.id)))
    }
  }

  const isConfirmed = validateConfirmation(confirmInput, siteDomain, selected.size)

  const handleReset = async () => {
    if (!isConfirmed || selected.size === 0) return
    setIsResetting(true)
    try {
      await resetSiteData(siteId, Array.from(selected))
      const moduleLabels = RESET_MODULES.filter(m => selected.has(m.id)).map(m => m.label)
      toast.success(`Reset complete: ${moduleLabels.join(', ')}`)
      handleClose()
      onReset()
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || 'Failed to reset data')
      setIsResetting(false)
    }
  }

  const allSelected = selected.size === RESET_MODULES.length

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isResetting) handleClose()
      }}
    >
      <DialogContent className="sm:max-w-lg border-red-900">
        <DialogHeader>
          <DialogTitle className="text-red-500">Reset Data</DialogTitle>
          <DialogDescription>
            Select which data modules to permanently delete for{' '}
            <span className="font-medium text-foreground">{siteDomain}</span>.
            Configuration and integrations are preserved.
          </DialogDescription>
        </DialogHeader>

        {/* Select All */}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleAll}
          disabled={isResetting}
          className="w-full justify-start text-xs"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </Button>

        {/* Module checkboxes */}
        <div className="space-y-2">
          {RESET_MODULES.map((mod) => {
            const Icon = mod.icon
            const checked = selected.has(mod.id)
            return (
              <Button
                key={mod.id}
                variant={checked ? 'default' : 'secondary'}
                size="sm"
                onClick={() => toggleModule(mod.id)}
                disabled={isResetting}
                className={`w-full flex items-start gap-3 p-3 rounded-none text-left h-auto ${
                  checked
                    ? 'border-red-500/50 bg-red-900/15 hover:bg-red-900/20'
                    : 'border-neutral-800 bg-neutral-800/30 hover:border-neutral-700'
                }`}
              >
                <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-none border transition-colors ${
                  checked
                    ? 'border-red-500 bg-red-500'
                    : 'border-neutral-600'
                } ease-apple`}>
                  {checked && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 6l3 3 5-5" />
                    </svg>
                  )}
                </div>
                <Icon weight="bold" className={`w-4 h-4 mt-0.5 shrink-0 ${checked ? 'text-red-400' : 'text-neutral-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${checked ? 'text-red-300' : 'text-white'}`}>{mod.label}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">{mod.description}</p>
                </div>
              </Button>
            )
          })}
        </div>

        {/* Confirmation */}
        {selected.size > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-red-900/10 border border-red-900/20 rounded-none">
              <AlertTriangleIcon className="h-4 w-4 text-red-500 shrink-0" />
              <span className="text-xs font-medium text-red-300">
                {selected.size === RESET_MODULES.length
                  ? 'All data modules will be permanently deleted.'
                  : `${selected.size} module${selected.size > 1 ? 's' : ''} will be permanently deleted.`}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Type <span className="font-mono font-bold text-red-400">{allSelected ? siteDomain : 'RESET'}</span> to confirm
              </label>
              <Input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                autoComplete="off"
                disabled={isResetting}
                placeholder={allSelected ? siteDomain : 'RESET'}
              />
            </div>

            <DialogFooter>
              <Button
                variant="secondary"
                onClick={handleClose}
                disabled={isResetting}
                className="flex-1 sm:flex-none"
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                onClick={handleReset}
                disabled={!isConfirmed || isResetting}
                className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 text-white border-red-600 gap-2"
              >
                {isResetting ? (
                  <>
                    <Spinner className="w-4 h-4" />
                    Resetting...
                  </>
                ) : (
                  `Reset ${selected.size} Module${selected.size > 1 ? 's' : ''}`
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
