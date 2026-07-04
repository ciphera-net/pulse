'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { Button, Spinner, toast } from '@ciphera-net/facet'
import { CaretUp, CaretDown, CircleNotch, FileText, House, Lightning, Plus, Trash } from '@phosphor-icons/react'
import type { Funnel, FunnelStep, StepPropertyFilter, CreateFunnelRequest } from '@/lib/api/funnels'
import { getDashboardPages, getDashboardGoals } from '@/lib/api/stats'
import { getDateRange } from '@/lib/utils/dateRanges'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Segmented } from '@/components/ui/segmented'
import Select from '@/components/ui/select'
import { formatNumber } from '@/lib/utils/format'

// ---------------------------------------------------------------------------
// Create/Edit funnel on the real dialog primitive (focus trap, focus return,
// Esc, aria and the sanctioned shadow come free). Path and event inputs get
// data-aware suggestion panels fed once per open from the dashboard's own
// endpoints (free text always allowed), validation is inline with
// focus-to-field, and the conversion-window control submits what it shows —
// the hardcoded 30-day overwrite dies here.
// ---------------------------------------------------------------------------

type StepWithoutOrder = Omit<FunnelStep, 'order'>

const inputClass =
  'w-full h-10 px-3 bg-transparent border border-neutral-800 rounded-none text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 transition-colors ease-apple'
const invalidClass = 'border-red-500/60'
const labelClass = 'block text-sm font-medium text-neutral-300 mb-1.5'

const MAX_STEPS = 8
const MAX_FILTERS = 10

const WINDOW_PRESETS = [
  { label: '24h', value: 24, unit: 'hours' as const },
  { label: '72h', value: 72, unit: 'hours' as const },
  { label: '7d', value: 7, unit: 'days' as const },
  { label: '14d', value: 14, unit: 'days' as const },
  { label: '30d', value: 30, unit: 'days' as const },
]

interface SuggestItem {
  value: string
  label?: string
  count: number
}

export interface FunnelPrefill {
  name?: string
  description?: string
  steps?: StepWithoutOrder[]
}

interface FunnelModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateFunnelRequest) => Promise<void>
  initialData?: Funnel
  /** Create-mode seed (e.g. from a journeys lens) — ignored when editing. */
  prefill?: FunnelPrefill
  siteId: string
}

// ─── Suggestion input ───────────────────────────────────────────────

function SuggestInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  invalid,
  items,
  failed,
  glyph,
  registerRef,
  onPanelOpenChange,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  ariaLabel: string
  invalid?: boolean
  /** null while the once-per-open fetch is in flight. */
  items: SuggestItem[] | null
  failed?: boolean
  glyph: (value: string) => React.ReactNode
  registerRef?: (el: HTMLInputElement | null) => void
  /** Lets the dialog keep Escape for the panel while one is open. */
  onPanelOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [showSpinner, setShowSpinner] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    onPanelOpenChange?.(true)
    return () => onPanelOpenChange?.(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // * 150ms rule — fast fetches never flash the spinner row
  useEffect(() => {
    if (!open || items !== null) {
      setShowSpinner(false)
      return
    }
    const t = setTimeout(() => setShowSpinner(true), 150)
    return () => clearTimeout(t)
  }, [open, items])

  const query = value.trim().toLowerCase()
  const filtered = (items ?? []).filter(
    (it) => !query || it.value.toLowerCase().includes(query) || it.label?.toLowerCase().includes(query),
  )

  useEffect(() => {
    setHighlight((h) => Math.min(Math.max(h, 0), Math.max(filtered.length - 1, 0)))
  }, [filtered.length])

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${highlight}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (filtered[highlight]) {
        e.preventDefault()
        pick(filtered[highlight].value)
      }
    } else if (e.key === 'Escape') {
      // * Close the panel only — preventDefault keeps the dialog open
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        ref={registerRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={`${inputClass} ${invalid ? invalidClass : ''}`}
      />
      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label={`${ariaLabel} suggestions`}
          className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto border border-border bg-popover py-1"
        >
          {showSpinner ? (
            <div className="flex items-center justify-center py-4">
              <CircleNotch className="h-4 w-4 animate-spin text-neutral-500" />
            </div>
          ) : failed ? (
            <p className="px-3 py-2 text-xs text-neutral-500">
              Couldn&rsquo;t load suggestions — you can still type freely.
            </p>
          ) : filtered.length > 0 ? (
            filtered.slice(0, 50).map((it, i) => (
              <button
                key={it.value}
                type="button"
                role="option"
                aria-selected={i === highlight}
                data-index={i}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  e.preventDefault() // keep input focus
                  pick(it.value)
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors duration-fast ease-apple ${
                  i === highlight ? 'bg-neutral-800 text-white' : 'text-neutral-300'
                }`}
              >
                <span className="shrink-0">{glyph(it.value)}</span>
                <span className="min-w-0 flex-1 truncate" title={it.value}>
                  {it.label ?? it.value}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                  {formatNumber(it.count)}
                </span>
              </button>
            ))
          ) : items !== null ? (
            <p className="px-3 py-2 text-xs text-neutral-500">
              No matches — free text is fine.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ─── Modal ──────────────────────────────────────────────────────────

export default function FunnelModal({ isOpen, onClose, onSubmit, initialData, prefill, siteId }: FunnelModalProps) {
  const [name, setName] = useState(initialData?.name ?? prefill?.name ?? '')
  const [description, setDescription] = useState(initialData?.description ?? prefill?.description ?? '')
  const [steps, setSteps] = useState<StepWithoutOrder[]>(
    initialData?.steps.map(({ order: _order, ...rest }) => rest) ??
      prefill?.steps ?? [
        { name: 'Step 1', value: '/', type: 'exact' },
        { name: 'Step 2', value: '', type: 'exact' },
      ],
  )
  // * Window control prefills the stored values on edit; create defaults 7d
  const [windowValue, setWindowValue] = useState<number>(initialData?.conversion_window_value ?? 7)
  const [windowUnit, setWindowUnit] = useState<'hours' | 'days'>(initialData?.conversion_window_unit ?? 'days')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const initialStepCount = initialData?.steps.length ?? prefill?.steps?.length ?? 2
  const stepIdCounter = useRef(initialStepCount)
  const [stepIds, setStepIds] = useState<number[]>(() =>
    Array.from({ length: initialStepCount }, (_, i) => i),
  )
  // * Radix's escape listener runs on document capture — this counter lets an
  // * open suggestion panel claim Escape before the dialog dismisses.
  const openPanels = useRef(0)
  const onPanelOpenChange = useCallback((open: boolean) => {
    openPanels.current += open ? 1 : -1
  }, [])
  const fieldRefs = useRef(new Map<string, HTMLInputElement>())
  const registerField = (key: string) => (el: HTMLInputElement | null) => {
    if (el) fieldRefs.current.set(key, el)
    else fieldRefs.current.delete(key)
  }

  // * Suggestions fetched once per open — top pages + event names, 30d window
  const [pageItems, setPageItems] = useState<SuggestItem[] | null>(null)
  const [goalItems, setGoalItems] = useState<SuggestItem[] | null>(null)
  const [pagesFailed, setPagesFailed] = useState(false)
  const [goalsFailed, setGoalsFailed] = useState(false)

  useEffect(() => {
    if (!isOpen || !siteId) return
    let alive = true
    const range = getDateRange(30)
    getDashboardPages(siteId, range.start, range.end, 50)
      .then((d) => {
        if (alive) setPageItems(d.top_pages.map((p) => ({ value: p.path, count: p.pageviews })))
      })
      .catch(() => {
        if (alive) {
          setPagesFailed(true)
          setPageItems([])
        }
      })
    getDashboardGoals(siteId, range.start, range.end, 50)
      .then((d) => {
        if (alive)
          setGoalItems(
            d.goal_counts.map((g) => ({
              value: g.event_name,
              label: g.display_name ?? g.event_name,
              count: g.count,
            })),
          )
      })
      .catch(() => {
        if (alive) {
          setGoalsFailed(true)
          setGoalItems([])
        }
      })
    return () => {
      alive = false
    }
  }, [isOpen, siteId])

  const clearError = (key: string) =>
    setErrors((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })

  // ── Step operations ────────────────────────────────────────────────
  const addStep = () => {
    if (steps.length >= MAX_STEPS) return
    stepIdCounter.current += 1
    setStepIds((p) => [...p, stepIdCounter.current])
    setSteps((p) => [...p, { name: `Step ${p.length + 1}`, value: '', type: 'exact' }])
  }
  const removeStep = (i: number) => {
    if (steps.length <= 1) return
    setStepIds((p) => p.filter((_, j) => j !== i))
    setSteps((p) => p.filter((_, j) => j !== i))
  }
  const updateStep = (i: number, patch: Partial<StepWithoutOrder>) => {
    setSteps((p) => {
      const n = [...p]
      const s = { ...n[i], ...patch }
      n[i] = s
      return n
    })
    clearError(`step-${i}`)
  }
  const setCategory = (i: number, category: 'page' | 'event') => {
    setSteps((p) => {
      const n = [...p]
      const s = { ...n[i], category, value: '' }
      if (category === 'page') s.property_filters = undefined
      else s.type = 'exact'
      n[i] = s
      return n
    })
    clearError(`step-${i}`)
  }
  const moveStep = (i: number, d: -1 | 1) => {
    const t = i + d
    if (t < 0 || t >= steps.length) return
    setSteps((p) => {
      const n = [...p]
      ;[n[i], n[t]] = [n[t], n[i]]
      return n
    })
    setStepIds((p) => {
      const n = [...p]
      ;[n[i], n[t]] = [n[t], n[i]]
      return n
    })
  }
  const addFilter = (si: number) => {
    setSteps((p) => {
      const n = [...p]
      const s = { ...n[si] }
      const f = [...(s.property_filters || [])]
      if (f.length >= MAX_FILTERS) return p
      f.push({ key: '', operator: 'is', value: '' })
      s.property_filters = f
      n[si] = s
      return n
    })
  }
  const updateFilter = (si: number, fi: number, field: keyof StepPropertyFilter, val: string) => {
    setSteps((p) => {
      const n = [...p]
      const s = { ...n[si] }
      const f = [...(s.property_filters || [])]
      f[fi] = { ...f[fi], [field]: val }
      s.property_filters = f
      n[si] = s
      return n
    })
    clearError(`step-${si}`)
  }
  const removeFilter = (si: number, fi: number) => {
    setSteps((p) => {
      const n = [...p]
      const s = { ...n[si] }
      const f = [...(s.property_filters || [])].filter((_, j) => j !== fi)
      s.property_filters = f.length > 0 ? f : undefined
      n[si] = s
      return n
    })
  }

  // ── Validation: inline field errors, focus the first failure ──────
  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {}
    if (!name.trim()) next['name'] = 'Give the funnel a name.'
    steps.forEach((step, i) => {
      const cat = step.category || 'page'
      if (!step.value.trim()) {
        next[`step-${i}`] = cat === 'event' ? 'Enter an event name.' : 'Enter a path.'
        return
      }
      if (cat === 'page' && step.type === 'regex') {
        try {
          new RegExp(step.value)
        } catch {
          next[`step-${i}`] = 'This regex doesn’t compile.'
          return
        }
      }
      if (cat === 'event' && step.property_filters?.some((f) => !f.key.trim())) {
        next[`step-${i}`] = 'Every property filter needs a key.'
      }
    })
    if (!Number.isFinite(windowValue) || windowValue < 1) {
      next['window'] = 'The window must be at least 1.'
    }
    setErrors(next)
    const first = ['name', ...steps.map((_, i) => `step-${i}`), 'window'].find((k) => k in next)
    if (first) fieldRefs.current.get(first)?.focus()
    return Object.keys(next).length === 0
  }, [name, steps, windowValue])

  const handleSubmit = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      await onSubmit({
        name,
        description,
        steps: steps.map((s, i) => ({ ...s, order: i })),
        conversion_window_value: windowValue,
        conversion_window_unit: windowUnit,
      })
      onClose()
    } catch {
      toast.error('Failed to save funnel')
    } finally {
      setSaving(false)
    }
  }

  const pathGlyph = (v: string) => {
    const cls = 'h-4 w-4 shrink-0 text-neutral-500'
    return v === '/' ? <House className={cls} /> : <FileText className={cls} />
  }
  const eventGlyph = () => <Lightning className="h-4 w-4 shrink-0 text-neutral-500" />

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="flex max-h-[85vh] w-full flex-col gap-0 p-0 sm:max-w-2xl"
        onEscapeKeyDown={(e) => {
          if (openPanels.current > 0) e.preventDefault()
        }}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle className="text-lg font-semibold text-white">
            {initialData ? 'Edit funnel' : 'Create funnel'}
          </DialogTitle>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            <div>
              <label htmlFor="funnel-name" className={labelClass}>Name</label>
              <input
                id="funnel-name"
                ref={registerField('name')}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  clearError('name')
                }}
                placeholder="e.g. Signup flow"
                maxLength={100}
                className={`${inputClass} ${errors['name'] ? invalidClass : ''}`}
              />
              {errors['name'] && <p className="mt-1 text-xs text-red-400">{errors['name']}</p>}
            </div>

            <div>
              <label htmlFor="funnel-description" className={labelClass}>
                Description <span className="font-normal text-neutral-600">optional</span>
              </label>
              <input
                id="funnel-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tracks users from landing page to signup"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Steps</label>
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {steps.map((step, i) => {
                    const cat = step.category || 'page'
                    const stepError = errors[`step-${i}`]
                    return (
                      <motion.div
                        key={stepIds[i]}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
                        className="overflow-hidden"
                      >
                        <div className="rounded-none border border-neutral-800 bg-neutral-800/20 p-3">
                          <div className="flex items-start gap-2">
                            <div className="flex shrink-0 items-center gap-1 pt-1">
                              <span className="flex h-5 w-5 items-center justify-center rounded-none bg-neutral-800 text-[10px] font-medium text-neutral-400">
                                {i + 1}
                              </span>
                              <div className="flex flex-col">
                                <button
                                  type="button"
                                  aria-label={`Move step ${i + 1} up`}
                                  onClick={() => moveStep(i, -1)}
                                  disabled={i === 0}
                                  className="flex h-8 w-8 items-center justify-center rounded-none text-neutral-500 transition-colors duration-fast ease-apple hover:text-neutral-300 disabled:opacity-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                                >
                                  <CaretUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Move step ${i + 1} down`}
                                  onClick={() => moveStep(i, 1)}
                                  disabled={i === steps.length - 1}
                                  className="flex h-8 w-8 items-center justify-center rounded-none text-neutral-500 transition-colors duration-fast ease-apple hover:text-neutral-300 disabled:opacity-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                                >
                                  <CaretDown className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Segmented
                                  ariaLabel={`Step ${i + 1} type`}
                                  value={cat}
                                  onChange={(v) => setCategory(i, v)}
                                  options={[
                                    { value: 'page', label: 'Page' },
                                    { value: 'event', label: 'Event' },
                                  ]}
                                />
                                <input
                                  value={step.name}
                                  onChange={(e) => updateStep(i, { name: e.target.value })}
                                  placeholder="Step name"
                                  aria-label={`Step ${i + 1} name`}
                                  className={`${inputClass} min-w-0 flex-1`}
                                />
                              </div>

                              {cat === 'page' ? (
                                <div className="flex gap-2">
                                  <Select
                                    variant="input"
                                    className="w-32 shrink-0"
                                    value={step.type}
                                    onChange={(v) => updateStep(i, { type: v })}
                                    options={[
                                      { value: 'exact', label: 'Exact' },
                                      { value: 'contains', label: 'Contains' },
                                      { value: 'regex', label: 'Regex' },
                                    ]}
                                  />
                                  <SuggestInput
                                    value={step.value}
                                    onChange={(v) => updateStep(i, { value: v })}
                                    placeholder={step.type === 'exact' ? '/pricing' : 'pricing'}
                                    ariaLabel={`Step ${i + 1} path`}
                                    invalid={!!stepError}
                                    items={pageItems}
                                    failed={pagesFailed}
                                    glyph={pathGlyph}
                                    registerRef={registerField(`step-${i}`)}
                                    onPanelOpenChange={onPanelOpenChange}
                                  />
                                </div>
                              ) : (
                                <SuggestInput
                                  value={step.value}
                                  onChange={(v) => updateStep(i, { value: v })}
                                  placeholder="e.g. signup, purchase"
                                  ariaLabel={`Step ${i + 1} event`}
                                  invalid={!!stepError}
                                  items={goalItems}
                                  failed={goalsFailed}
                                  glyph={eventGlyph}
                                  registerRef={registerField(`step-${i}`)}
                                  onPanelOpenChange={onPanelOpenChange}
                                />
                              )}

                              {cat === 'event' && step.property_filters && step.property_filters.length > 0 && (
                                <div className="space-y-1.5">
                                  {step.property_filters.map((f, fi) => (
                                    <div key={fi} className="flex items-center gap-1.5">
                                      <input
                                        value={f.key}
                                        onChange={(e) => updateFilter(i, fi, 'key', e.target.value)}
                                        placeholder="key"
                                        aria-label={`Step ${i + 1} filter ${fi + 1} key`}
                                        className={`${inputClass} flex-1`}
                                      />
                                      <Select
                                        variant="input"
                                        className="w-40 shrink-0"
                                        value={f.operator}
                                        onChange={(v) => updateFilter(i, fi, 'operator', v)}
                                        options={[
                                          { value: 'is', label: 'is' },
                                          { value: 'is_not', label: 'is not' },
                                          { value: 'contains', label: 'contains' },
                                          { value: 'not_contains', label: 'does not contain' },
                                        ]}
                                      />
                                      <input
                                        value={f.value}
                                        onChange={(e) => updateFilter(i, fi, 'value', e.target.value)}
                                        placeholder="value"
                                        aria-label={`Step ${i + 1} filter ${fi + 1} value`}
                                        className={`${inputClass} flex-1`}
                                      />
                                      <button
                                        type="button"
                                        aria-label="Remove property filter"
                                        onClick={() => removeFilter(i, fi)}
                                        className="shrink-0 rounded-none p-1.5 text-neutral-500 transition-colors duration-fast ease-apple hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                                      >
                                        <Trash className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {cat === 'event' && (!step.property_filters || step.property_filters.length < MAX_FILTERS) && (
                                <button
                                  type="button"
                                  onClick={() => addFilter(i)}
                                  className="flex items-center gap-1 text-xs text-neutral-500 transition-colors duration-fast ease-apple hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                                >
                                  <Plus className="h-3 w-3" /> Filter by property
                                </button>
                              )}

                              {stepError && <p className="text-xs text-red-400">{stepError}</p>}
                            </div>

                            <button
                              type="button"
                              aria-label={`Remove step ${i + 1}`}
                              onClick={() => removeStep(i)}
                              disabled={steps.length <= 1}
                              className="mt-1 shrink-0 rounded-none p-1.5 text-neutral-500 transition-colors duration-fast ease-apple hover:text-red-400 disabled:opacity-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                            >
                              <Trash className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>

                {steps.length < MAX_STEPS && (
                  <button
                    type="button"
                    onClick={addStep}
                    className="flex w-full items-center justify-center gap-2 rounded-none border border-dashed border-neutral-700 py-2.5 text-sm text-neutral-500 transition-colors duration-fast ease-apple hover:border-neutral-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add step
                  </button>
                )}
              </div>
            </div>

            {/* Conversion window — submits exactly what it shows */}
            <div>
              <label htmlFor="funnel-window" className={labelClass}>Conversion window</label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="funnel-window"
                  ref={registerField('window')}
                  type="number"
                  min={1}
                  value={Number.isFinite(windowValue) ? windowValue : ''}
                  onChange={(e) => {
                    setWindowValue(parseInt(e.target.value, 10))
                    clearError('window')
                  }}
                  aria-label="Conversion window value"
                  className={`${inputClass} w-24 ${errors['window'] ? invalidClass : ''}`}
                />
                <Select
                  variant="input"
                  className="w-28"
                  value={windowUnit}
                  onChange={(v) => setWindowUnit(v as 'hours' | 'days')}
                  options={[
                    { value: 'hours', label: 'Hours' },
                    { value: 'days', label: 'Days' },
                  ]}
                />
                <div className="flex items-center gap-1.5">
                  {WINDOW_PRESETS.map((preset) => {
                    const active = windowValue === preset.value && windowUnit === preset.unit
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setWindowValue(preset.value)
                          setWindowUnit(preset.unit)
                          clearError('window')
                        }}
                        className={`rounded-none border px-2 py-1 text-xs tabular-nums transition-colors duration-fast ease-apple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange ${
                          active
                            ? 'border-brand-orange/40 text-brand-orange'
                            : 'border-neutral-800 text-neutral-500 hover:text-neutral-300'
                        }`}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <p className="mt-1.5 text-xs text-neutral-500">
                How long a visitor has to finish the funnel after starting it.
              </p>
              {errors['window'] && <p className="mt-1 text-xs text-red-400">{errors['window']}</p>}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-3">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="default" onClick={handleSubmit} disabled={saving}>
            {saving && <Spinner className="h-4 w-4" />}
            {initialData ? 'Save changes' : 'Create funnel'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
