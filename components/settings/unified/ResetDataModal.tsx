'use client'

import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { toast, getAuthErrorMessage, AlertTriangleIcon, XIcon, Spinner } from '@ciphera-net/ui'
import { resetSiteData, type ResetModule } from '@/lib/api/sites'
import { ChartBar, Path, Funnel, Heartbeat, Gauge, Cloud, MagnifyingGlass } from '@phosphor-icons/react'

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

  if (typeof document === 'undefined') return null

  const allSelected = selected.size === RESET_MODULES.length

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm p-4 pointer-events-none"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-md bg-neutral-900/80 p-6 rounded-2xl border border-red-200 dark:border-red-900 shadow-xl pointer-events-auto max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-red-600 dark:text-red-500">Reset Data</h3>
              <button
                onClick={handleClose}
                disabled={isResetting}
                className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-white disabled:opacity-50"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              Select which data modules to permanently delete for <span className="font-medium text-white">{siteDomain}</span>. Configuration and integrations are preserved.
            </p>

            {/* Select All */}
            <button
              type="button"
              onClick={toggleAll}
              disabled={isResetting}
              className="w-full text-left mb-3 text-xs font-medium text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>

            {/* Module checkboxes */}
            <div className="space-y-2 mb-5">
              {RESET_MODULES.map((mod) => {
                const Icon = mod.icon
                const checked = selected.has(mod.id)
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => toggleModule(mod.id)}
                    disabled={isResetting}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl border transition-all text-left disabled:opacity-50 ${
                      checked
                        ? 'border-red-500/50 bg-red-900/15'
                        : 'border-neutral-800 bg-neutral-800/30 hover:border-neutral-700'
                    }`}
                  >
                    <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      checked
                        ? 'border-red-500 bg-red-500'
                        : 'border-neutral-600'
                    }`}>
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
                  </button>
                )
              })}
            </div>

            {/* Confirmation */}
            {selected.size > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-lg">
                  <AlertTriangleIcon className="h-4 w-4 text-red-500 shrink-0" />
                  <span className="text-xs font-medium text-red-700 dark:text-red-300">
                    {selected.size === RESET_MODULES.length
                      ? 'All data modules will be permanently deleted.'
                      : `${selected.size} module${selected.size > 1 ? 's' : ''} will be permanently deleted.`}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Type <span className="font-mono font-bold text-red-600 dark:text-red-400">{allSelected ? siteDomain : 'RESET'}</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    autoComplete="off"
                    disabled={isResetting}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 disabled:opacity-50"
                    placeholder={allSelected ? siteDomain : 'RESET'}
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isResetting}
                    className="flex-1 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReset}
                    disabled={!isConfirmed || isResetting}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isResetting ? (
                      <>
                        <Spinner className="w-4 h-4" />
                        Resetting...
                      </>
                    ) : (
                      `Reset ${selected.size} Module${selected.size > 1 ? 's' : ''}`
                    )}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
