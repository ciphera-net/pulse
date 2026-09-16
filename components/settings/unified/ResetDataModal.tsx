'use client'

import { useState, useCallback } from 'react'
import { Modal, Button, Input, Checkbox, toast, getAuthErrorMessage, Spinner } from '@ciphera-net/facet'
import { resetSiteData, type ResetModule } from '@/lib/api/sites'
import { ChartBar, Path, Funnel, Heartbeat, Gauge, Cloud, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react'

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
    description: 'Uptime check results, daily uptime stats and incident history. Monitors are kept.',
    icon: Heartbeat,
    tables: ['uptime_checks', 'uptime_daily_stats', 'uptime_incidents'],
  },
  {
    id: 'pagespeed',
    label: 'Performance',
    description: 'Performance check history. Configuration is kept.',
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
  const allSelected = selected.size === RESET_MODULES.length

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
      toast.error(getAuthErrorMessage(error) || "Couldn't reset your data. Try again.")
      setIsResetting(false)
    }
  }

  return (
    <Modal isOpen={open} onClose={handleClose} title="Reset data">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Select which data modules to permanently delete for{' '}
          <span className="font-mono text-foreground">{siteDomain}</span>. Configuration and
          integrations stay as they are.
        </p>

        {/* Module picker — one ruled frame, select-all in the header. Every row
            is the same Facet Checkbox idiom (the header row and each module
            row used to be two different pseudo-checkbox implementations). */}
        <div className="rounded-none border border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <Checkbox
              checked={allSelected}
              indeterminate={selected.size > 0 && !allSelected}
              onChange={toggleAll}
              disabled={isResetting}
              label="All modules"
            />
            <span className="text-xs tabular-nums text-muted-foreground">
              {selected.size}/{RESET_MODULES.length}
            </span>
          </div>

          <div className="divide-y divide-border">
            {RESET_MODULES.map((mod) => {
              const Icon = mod.icon
              return (
                <div key={mod.id} className="px-4 py-3">
                  <Checkbox
                    checked={selected.has(mod.id)}
                    onChange={() => toggleModule(mod.id)}
                    disabled={isResetting}
                    label={
                      <span className="flex items-start gap-2">
                        <Icon weight="bold" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground">{mod.label}</span>
                          <span className="block text-xs text-muted-foreground">{mod.description}</span>
                        </span>
                      </span>
                    }
                  />
                </div>
              )
            })}
          </div>
        </div>

        {/* Confirmation */}
        {selected.size > 0 && (
          <div className="space-y-4">
            <div role="alert" className="flex items-start gap-3 border border-destructive/30 px-4 py-3">
              <WarningCircle size={16} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0 text-destructive" />
              <p className="text-sm text-foreground">
                {allSelected
                  ? 'This deletes all data modules permanently.'
                  : `This deletes ${selected.size} module${selected.size > 1 ? 's' : ''} permanently.`}
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Type <span className="font-mono font-semibold text-destructive">{allSelected ? siteDomain : 'RESET'}</span> to confirm
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

            <div className="flex justify-end gap-3">
              <Button variant="outline" size="sm" onClick={handleClose} disabled={isResetting}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={handleReset} disabled={!isConfirmed || isResetting}>
                {isResetting ? (
                  <>
                    <Spinner className="w-4 h-4" />
                    Resetting…
                  </>
                ) : (
                  `Reset ${selected.size} module${selected.size > 1 ? 's' : ''}`
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
