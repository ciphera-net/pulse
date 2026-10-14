'use client'

import { useState } from 'react'
import { Checkbox, toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { HoldDialog, useUndo } from '@ciphera-net/facet-hold'
import { resetSiteData, type ResetModule } from '@/lib/api/sites'
import { ArrowCounterClockwise, ChartBar, Path, Funnel, Heartbeat, Gauge, Cloud, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react'

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

/** The Undo bar's line, past tense, naming what was picked (PUL-28). */
function resetMessage(selected: Set<ResetModule>): string {
  if (selected.size === RESET_MODULES.length) return 'All data reset'
  const labels = RESET_MODULES.filter((m) => selected.has(m.id)).map((m) => m.label)
  if (labels.length === 2) return `${labels[0]} and ${labels[1]} reset`
  if (labels.length === 1) return `${labels[0]} reset`
  return `${labels.length} modules reset`
}

export default function ResetDataModal({ open, onClose, onReset, siteDomain, siteId }: ResetDataModalProps) {
  const [selected, setSelected] = useState<Set<ResetModule>>(new Set())
  const { defer } = useUndo()

  const handleClose = () => {
    setSelected(new Set())
    onClose()
  }

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

  const allSelected = selected.size === RESET_MODULES.length

  // Nothing to hide: resetting data does not remove a row from any list, so
  // this goes straight through useUndo() rather than useDeferredRemoval.
  // Hidden at once is the module checklist itself clearing, below.
  const handleConfirm = () => {
    if (selected.size === 0) return
    const modules = Array.from(selected)
    defer({
      message: resetMessage(selected),
      commit: ({ keepalive }) => resetSiteData(siteId, modules, { keepalive }),
      onCommitted: () => onReset(),
      onError: (err) => toast.error(getAuthErrorMessage(err as Error) || "Couldn't reset data. Try again."),
    })
    setSelected(new Set())
  }

  return (
    <HoldDialog
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}
      title="Reset data?"
      description={
        <>
          Select which data modules to permanently delete for{' '}
          <span className="font-mono text-foreground">{siteDomain}</span>. Configuration and
          integrations stay as they are.
        </>
      }
      holdLabel="Hold to reset"
      icon={<ArrowCounterClockwise weight="bold" className="h-4 w-4" aria-hidden="true" />}
      disabled={selected.size === 0}
      onConfirm={handleConfirm}
    >
      <div className="space-y-4">
        {/* Module picker, one ruled frame, select-all in the header. Every row
            is the same Facet Checkbox idiom. */}
        <div className="rounded-none border border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <Checkbox
              checked={allSelected}
              indeterminate={selected.size > 0 && !allSelected}
              onChange={toggleAll}
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

        {selected.size > 0 && (
          <div role="alert" className="flex items-start gap-3 border border-destructive/30 px-4 py-3">
            <WarningCircle size={16} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0 text-destructive" />
            <p className="text-sm text-foreground">
              {allSelected
                ? 'This deletes all data modules permanently.'
                : `This deletes ${selected.size} module${selected.size > 1 ? 's' : ''} permanently.`}
            </p>
          </div>
        )}
      </div>
    </HoldDialog>
  )
}
