'use client'

import { useState, useCallback } from 'react'
import { Button, Input, Checkbox, Banner, toast, getAuthErrorMessage, Spinner, cn } from '@ciphera-net/facet'
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
      <DialogContent className="sm:max-w-lg border-destructive/30">
        <DialogHeader>
          <DialogTitle className="text-destructive">Reset Data</DialogTitle>
          <DialogDescription>
            Select which data modules to permanently delete for{' '}
            <span className="font-medium text-foreground">{siteDomain}</span>.
            Configuration and integrations are preserved.
          </DialogDescription>
        </DialogHeader>

        {/* Module picker — one ruled frame, select-all in the header */}
        <div className="rounded-none border border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <Checkbox
              checked={allSelected}
              indeterminate={selected.size > 0 && !allSelected}
              onChange={toggleAll}
              disabled={isResetting}
              label={<span className="font-semibold text-micro-label uppercase text-muted-foreground">All modules</span>}
            />
            <span className="tabular-nums text-micro-label uppercase text-muted-foreground">
              {selected.size}/{RESET_MODULES.length}
            </span>
          </div>

          <div className="divide-y divide-border">
            {RESET_MODULES.map((mod) => {
              const Icon = mod.icon
              const checked = selected.has(mod.id)
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => toggleModule(mod.id)}
                  disabled={isResetting}
                  aria-pressed={checked}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors cursor-pointer disabled:cursor-not-allowed',
                    checked ? 'bg-destructive/5 hover:bg-destructive/10' : 'hover:bg-muted',
                  )}
                >
                  {/* Presentational mark — the row itself is the control, so no
                      nested interactive checkbox. Checked uses the control-state
                      accent (bg-primary), matching Toggle/Checkbox-on. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-none border transition-colors ease-apple',
                      checked ? 'border-primary bg-primary' : 'border-input',
                    )}
                  >
                    {checked && (
                      <svg viewBox="0 0 12 12" className="h-3 w-3 text-primary-foreground" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2 6l3 3 5-5" />
                      </svg>
                    )}
                  </span>
                  <Icon weight="bold" className={cn('mt-0.5 h-4 w-4 shrink-0', checked ? 'text-destructive' : 'text-muted-foreground')} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{mod.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{mod.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Confirmation */}
        {selected.size > 0 && (
          <div className="space-y-4">
            <Banner
              tone="danger"
              title={
                selected.size === RESET_MODULES.length
                  ? 'All data modules will be permanently deleted.'
                  : `${selected.size} module${selected.size > 1 ? 's' : ''} will be permanently deleted.`
              }
            />

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Type <span className="font-mono font-bold text-destructive">{allSelected ? siteDomain : 'RESET'}</span> to confirm
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
                variant="destructive"
                onClick={handleReset}
                disabled={!isConfirmed || isResetting}
                className="flex-1 sm:flex-none gap-2"
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
