'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DURATION_FAST, DURATION_BASE, EASE_APPLE } from '@/lib/motion'
import { Button, Spinner, toast } from '@ciphera-net/ui'
import { CaretUp, CaretDown, X, Plus, Trash } from '@phosphor-icons/react'
import type { Funnel, FunnelStep, StepPropertyFilter, CreateFunnelRequest } from '@/lib/api/funnels'

type StepWithoutOrder = Omit<FunnelStep, 'order'>

const inputClass = 'w-full h-10 px-4 bg-transparent border border-neutral-800 rounded-lg text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 transition-colors ease-apple'
const selectClass = 'h-10 px-3 bg-transparent border border-neutral-800 rounded-lg text-sm text-white focus:outline-none focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 transition-colors ease-apple appearance-none cursor-pointer'
const labelClass = 'block text-sm font-medium text-neutral-300 mb-1.5'

const MAX_STEPS = 8
const MAX_FILTERS = 10

interface FunnelModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateFunnelRequest) => Promise<void>
  initialData?: Funnel
}

export default function FunnelModal({ isOpen, onClose, onSubmit, initialData }: FunnelModalProps) {
  const [name, setName] = useState(initialData?.name ?? '')
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [steps, setSteps] = useState<StepWithoutOrder[]>(
    initialData?.steps.map(({ order, ...rest }) => rest) ?? [
      { name: 'Step 1', value: '/', type: 'exact' },
      { name: 'Step 2', value: '', type: 'exact' },
    ]
  )
  const [saving, setSaving] = useState(false)
  const stepIdCounter = useRef(initialData?.steps.length ?? 2)
  const [stepIds, setStepIds] = useState<number[]>(() =>
    Array.from({ length: initialData?.steps.length ?? 2 }, (_, i) => i)
  )

  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey) }
  }, [isOpen, onClose])

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('Please enter a funnel name'); return }
    if (steps.some(s => !s.name.trim())) { toast.error('Please enter a name for all steps'); return }
    for (const step of steps) {
      const cat = step.category || 'page'
      if (!step.value.trim()) { toast.error(cat === 'event' ? `Enter an event name for: ${step.name}` : `Enter a path for: ${step.name}`); return }
      if (cat === 'page' && step.type === 'regex') { try { new RegExp(step.value) } catch { toast.error(`Invalid regex in: ${step.name}`); return } }
      if (cat === 'event' && step.property_filters) { for (const f of step.property_filters) { if (!f.key.trim()) { toast.error(`Property key required in: ${step.name}`); return } } }
    }
    setSaving(true)
    try {
      await onSubmit({ name, description, steps: steps.map((s, i) => ({ ...s, order: i })), conversion_window_value: 30, conversion_window_unit: 'days' })
      onClose()
    } catch { toast.error('Failed to save funnel') } finally { setSaving(false) }
  }

  const addStep = () => { if (steps.length >= MAX_STEPS) return; stepIdCounter.current += 1; setStepIds(p => [...p, stepIdCounter.current]); setSteps(p => [...p, { name: `Step ${p.length + 1}`, value: '', type: 'exact' }]) }
  const removeStep = (i: number) => { if (steps.length <= 1) return; setStepIds(p => p.filter((_, j) => j !== i)); setSteps(p => p.filter((_, j) => j !== i)) }
  const updateStep = (i: number, field: string, value: string) => {
    setSteps(p => { const n = [...p]; const s = { ...n[i] }; if (field === 'category') { s.category = value as 'page' | 'event'; s.value = ''; if (value === 'page') s.property_filters = undefined; else s.type = 'exact' } else { (s as any)[field] = value }; n[i] = s; return n })
  }
  const moveStep = (i: number, d: -1 | 1) => { const t = i + d; if (t < 0 || t >= steps.length) return; setSteps(p => { const n = [...p]; [n[i], n[t]] = [n[t], n[i]]; return n }); setStepIds(p => { const n = [...p]; [n[i], n[t]] = [n[t], n[i]]; return n }) }
  const addFilter = (si: number) => { setSteps(p => { const n = [...p]; const s = { ...n[si] }; const f = [...(s.property_filters || [])]; if (f.length >= MAX_FILTERS) return p; f.push({ key: '', operator: 'is', value: '' }); s.property_filters = f; n[si] = s; return n }) }
  const updateFilter = (si: number, fi: number, field: keyof StepPropertyFilter, val: string) => { setSteps(p => { const n = [...p]; const s = { ...n[si] }; const f = [...(s.property_filters || [])]; f[fi] = { ...f[fi], [field]: val }; s.property_filters = f; n[si] = s; return n }) }
  const removeFilter = (si: number, fi: number) => { setSteps(p => { const n = [...p]; const s = { ...n[si] }; const f = [...(s.property_filters || [])].filter((_, j) => j !== fi); s.property_filters = f.length > 0 ? f : undefined; n[si] = s; return n }) }

  return (
    <>
      {/* Backdrop — identical to UnifiedSettingsModal */}
      <div
        className={`fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm transition-opacity duration-base ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        } ease-apple`}
        onClick={onClose}
      />

      {/* Centering wrapper — identical to UnifiedSettingsModal */}
      <div
        className={`fixed inset-0 z-[61] flex items-center justify-center p-4 ${
          isOpen
            ? 'opacity-100 pointer-events-auto transition-opacity duration-fast'
            : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      >
        {/* Glass panel — static, not animated. Identical class to UnifiedSettingsModal. */}
        <div
          className="relative w-full max-w-2xl max-h-[85vh] glass-overlay rounded-2xl shadow-xl shadow-black/20 flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Content animates inside the static panel — identical to UnifiedSettingsModal */}
          <AnimatePresence>
            {isOpen && (
              <motion.div
                className="flex flex-col h-full"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
              >
                {/* Header — matches UnifiedSettingsModal */}
                <div className="shrink-0 px-6 pt-5 pb-4 border-b border-white/[0.06]">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">{initialData ? 'Edit Funnel' : 'Create Funnel'}</h2>
                    <button
                      onClick={onClose}
                      className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors ease-apple"
                    >
                      <X weight="bold" className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                  <div className="p-6 space-y-5">
                    <div>
                      <label className={labelClass}>Name</label>
                      <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Signup Flow" maxLength={100} className={inputClass} />
                    </div>

                    <div>
                      <label className={labelClass}>Description <span className="text-neutral-600 font-normal">optional</span></label>
                      <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Tracks users from landing page to signup" className={inputClass} />
                    </div>

                    <div>
                      <label className={labelClass}>Steps</label>
                      <div className="space-y-2">
                        {steps.map((step, i) => {
                          const cat = step.category || 'page'
                          return (
                            <div key={stepIds[i]} className="rounded-xl border border-neutral-800 bg-neutral-800/20 p-3">
                              <div className="flex items-start gap-2">
                                <div className="flex items-center gap-1 mt-1.5 flex-shrink-0">
                                  <span className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] font-medium text-neutral-400">{i + 1}</span>
                                  <div className="flex flex-col">
                                    <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="p-0.5 text-neutral-500 hover:text-neutral-300 disabled:opacity-20"><CaretUp className="w-3 h-3" /></button>
                                    <button type="button" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="p-0.5 text-neutral-500 hover:text-neutral-300 disabled:opacity-20"><CaretDown className="w-3 h-3" /></button>
                                  </div>
                                </div>

                                <div className="flex-1 min-w-0 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <div className="flex gap-0.5 flex-shrink-0">
                                      <button type="button" onClick={() => updateStep(i, 'category', 'page')} className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${cat === 'page' ? 'bg-brand-orange text-white' : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'} ease-apple`}>Page</button>
                                      <button type="button" onClick={() => updateStep(i, 'category', 'event')} className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${cat === 'event' ? 'bg-brand-orange text-white' : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'} ease-apple`}>Event</button>
                                    </div>
                                    <input value={step.name} onChange={e => updateStep(i, 'name', e.target.value)} placeholder="Step name" className={inputClass} />
                                  </div>

                                  {cat === 'page' ? (
                                    <div className="flex gap-2">
                                      <select value={step.type} onChange={e => updateStep(i, 'type', e.target.value)} className={`${selectClass} w-28 flex-shrink-0`}>
                                        <option value="exact">Exact</option>
                                        <option value="contains">Contains</option>
                                        <option value="regex">Regex</option>
                                      </select>
                                      <input value={step.value} onChange={e => updateStep(i, 'value', e.target.value)} placeholder={step.type === 'exact' ? '/pricing' : 'pricing'} className={inputClass} />
                                    </div>
                                  ) : (
                                    <input value={step.value} onChange={e => updateStep(i, 'value', e.target.value)} placeholder="e.g. signup, purchase" className={inputClass} />
                                  )}

                                  {cat === 'event' && step.property_filters && step.property_filters.length > 0 && (
                                    <div className="space-y-1.5">
                                      {step.property_filters.map((f, fi) => (
                                        <div key={fi} className="flex gap-1.5 items-center">
                                          <input value={f.key} onChange={e => updateFilter(i, fi, 'key', e.target.value)} placeholder="key" className={`${inputClass} flex-1`} />
                                          <select value={f.operator} onChange={e => updateFilter(i, fi, 'operator', e.target.value)} className={`${selectClass} w-28 flex-shrink-0`}>
                                            <option value="is">is</option>
                                            <option value="is_not">is not</option>
                                            <option value="contains">contains</option>
                                            <option value="not_contains">does not contain</option>
                                          </select>
                                          <input value={f.value} onChange={e => updateFilter(i, fi, 'value', e.target.value)} placeholder="value" className={`${inputClass} flex-1`} />
                                          <button type="button" onClick={() => removeFilter(i, fi)} className="p-1 text-neutral-500 hover:text-red-400 flex-shrink-0"><Trash className="w-3.5 h-3.5" /></button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {cat === 'event' && (!step.property_filters || step.property_filters.length < MAX_FILTERS) && (
                                    <button type="button" onClick={() => addFilter(i)} className="text-xs text-neutral-500 hover:text-white flex items-center gap-1 transition-colors ease-apple">
                                      <Plus className="w-3 h-3" /> Filter by property
                                    </button>
                                  )}
                                </div>

                                <button type="button" onClick={() => removeStep(i)} disabled={steps.length <= 1} className="p-1.5 mt-1 text-neutral-500 hover:text-red-400 disabled:opacity-20 rounded-lg flex-shrink-0">
                                  <Trash className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )
                        })}

                        {steps.length < MAX_STEPS && (
                          <button type="button" onClick={addStep} className="w-full py-2.5 rounded-xl border border-dashed border-neutral-700 text-sm text-neutral-500 hover:text-white hover:border-neutral-500 transition-colors ease-apple flex items-center justify-center gap-2">
                            <Plus className="w-3.5 h-3.5" /> Add Step
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer — matches UnifiedSettingsModal save bar border */}
                <div className="shrink-0 px-6 py-3 border-t border-white/[0.06] flex justify-end gap-2">
                  <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
                  <Button variant="primary" onClick={handleSubmit} disabled={saving}>
                    {saving && <Spinner className="w-4 h-4" />}
                    {initialData ? 'Save Changes' : 'Create Funnel'}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  )
}
