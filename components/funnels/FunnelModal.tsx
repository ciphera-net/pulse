'use client'

import { useState, useRef } from 'react'
import { Modal, Input, Button, Select, Spinner, PlusIcon, TrashIcon, toast } from '@ciphera-net/ui'
import { CaretUp, CaretDown } from '@phosphor-icons/react'
import type { Funnel, FunnelStep, StepPropertyFilter, CreateFunnelRequest } from '@/lib/api/funnels'

type StepWithoutOrder = Omit<FunnelStep, 'order'>

const OPERATOR_OPTIONS = [
  { value: 'is', label: 'is' },
  { value: 'is_not', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
]

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

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('Please enter a funnel name'); return }
    if (steps.some(s => !s.name.trim())) { toast.error('Please enter a name for all steps'); return }

    for (const step of steps) {
      const category = step.category || 'page'
      if (!step.value.trim()) {
        toast.error(category === 'event' ? `Enter an event name for: ${step.name}` : `Enter a path for: ${step.name}`)
        return
      }
      if (category === 'page' && step.type === 'regex') {
        try { new RegExp(step.value) } catch { toast.error(`Invalid regex in: ${step.name}`); return }
      }
      if (category === 'event' && step.property_filters) {
        for (const f of step.property_filters) {
          if (!f.key.trim()) { toast.error(`Property filter key required in: ${step.name}`); return }
        }
      }
    }

    setSaving(true)
    try {
      await onSubmit({
        name,
        description,
        steps: steps.map((s, i) => ({ ...s, order: i })),
        conversion_window_value: 30,
        conversion_window_unit: 'days',
      })
      onClose()
    } catch {
      toast.error('Failed to save funnel')
    } finally {
      setSaving(false)
    }
  }

  const addStep = () => {
    if (steps.length >= MAX_STEPS) return
    stepIdCounter.current += 1
    setStepIds(prev => [...prev, stepIdCounter.current])
    setSteps(prev => [...prev, { name: `Step ${prev.length + 1}`, value: '', type: 'exact' }])
  }

  const removeStep = (index: number) => {
    if (steps.length <= 1) return
    setStepIds(prev => prev.filter((_, i) => i !== index))
    setSteps(prev => prev.filter((_, i) => i !== index))
  }

  const updateStep = (index: number, field: string, value: string) => {
    setSteps(prev => {
      const next = [...prev]
      const step = { ...next[index] }
      if (field === 'category') {
        step.category = value as 'page' | 'event'
        step.value = ''
        if (value === 'page') step.property_filters = undefined
        else step.type = 'exact'
      } else {
        ;(step as Record<string, unknown>)[field] = value
      }
      next[index] = step
      return next
    })
  }

  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= steps.length) return
    setSteps(prev => { const n = [...prev]; [n[index], n[target]] = [n[target], n[index]]; return n })
    setStepIds(prev => { const n = [...prev]; [n[index], n[target]] = [n[target], n[index]]; return n })
  }

  const addFilter = (stepIndex: number) => {
    setSteps(prev => {
      const next = [...prev]
      const step = { ...next[stepIndex] }
      const filters = [...(step.property_filters || [])]
      if (filters.length >= MAX_FILTERS) return prev
      filters.push({ key: '', operator: 'is', value: '' })
      step.property_filters = filters
      next[stepIndex] = step
      return next
    })
  }

  const updateFilter = (stepIndex: number, filterIndex: number, field: keyof StepPropertyFilter, value: string) => {
    setSteps(prev => {
      const next = [...prev]
      const step = { ...next[stepIndex] }
      const filters = [...(step.property_filters || [])]
      filters[filterIndex] = { ...filters[filterIndex], [field]: value }
      step.property_filters = filters
      next[stepIndex] = step
      return next
    })
  }

  const removeFilter = (stepIndex: number, filterIndex: number) => {
    setSteps(prev => {
      const next = [...prev]
      const step = { ...next[stepIndex] }
      const filters = [...(step.property_filters || [])].filter((_, i) => i !== filterIndex)
      step.property_filters = filters.length > 0 ? filters : undefined
      next[stepIndex] = step
      return next
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'Edit Funnel' : 'Create Funnel'}
      className="max-w-2xl max-h-[85vh] !bg-neutral-900/80 !backdrop-blur-xl !border-white/[0.08]"
    >
      <div className="space-y-5 overflow-y-auto max-h-[calc(85vh-10rem)] pr-1 -mr-1">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1.5">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Signup Flow" maxLength={100} />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1.5">Description <span className="text-neutral-600 font-normal">optional</span></label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tracks users from landing page to signup" />
        </div>

        {/* Steps */}
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-3">Steps</label>
          <div className="space-y-2">
            {steps.map((step, index) => {
              const category = step.category || 'page'
              return (
                <div key={stepIds[index]} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                  <div className="flex items-start gap-2">
                    {/* Number + reorder */}
                    <div className="flex items-center gap-1 mt-1.5 flex-shrink-0">
                      <span className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] font-medium text-neutral-400">{index + 1}</span>
                      <div className="flex flex-col">
                        <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} className="p-0.5 text-neutral-500 hover:text-neutral-300 disabled:opacity-20 transition-colors ease-apple">
                          <CaretUp className="w-3 h-3" />
                        </button>
                        <button type="button" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1} className="p-0.5 text-neutral-500 hover:text-neutral-300 disabled:opacity-20 transition-colors ease-apple">
                          <CaretDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Fields */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Category toggle + Name */}
                      <div className="flex items-center gap-2">
                        <div className="flex gap-0.5 flex-shrink-0">
                          <button type="button" onClick={() => updateStep(index, 'category', 'page')} className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${category === 'page' ? 'bg-brand-orange-button text-white' : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'} ease-apple`}>Page</button>
                          <button type="button" onClick={() => updateStep(index, 'category', 'event')} className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${category === 'event' ? 'bg-brand-orange-button text-white' : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'} ease-apple`}>Event</button>
                        </div>
                        <Input value={step.name} onChange={(e) => updateStep(index, 'name', e.target.value)} placeholder="Step name" className="flex-1" />
                      </div>

                      {/* Value field */}
                      {category === 'page' ? (
                        <div className="grid grid-cols-[100px_1fr] gap-2">
                          <Select
                            value={step.type}
                            onChange={(value) => updateStep(index, 'type', value)}
                            options={[
                              { value: 'exact', label: 'Exact' },
                              { value: 'contains', label: 'Contains' },
                              { value: 'regex', label: 'Regex' },
                            ]}
                          />
                          <Input value={step.value} onChange={(e) => updateStep(index, 'value', e.target.value)} placeholder={step.type === 'exact' ? '/pricing' : 'pricing'} />
                        </div>
                      ) : (
                        <Input value={step.value} onChange={(e) => updateStep(index, 'value', e.target.value)} placeholder="e.g. signup, purchase" />
                      )}

                      {/* Property filters (event only) */}
                      {category === 'event' && step.property_filters && step.property_filters.length > 0 && (
                        <div className="space-y-1.5">
                          {step.property_filters.map((filter, fi) => (
                            <div key={fi} className="flex gap-1.5 items-center">
                              <Input value={filter.key} onChange={(e) => updateFilter(index, fi, 'key', e.target.value)} placeholder="key" className="flex-1" />
                              <Select value={filter.operator} onChange={(value) => updateFilter(index, fi, 'operator', value)} options={OPERATOR_OPTIONS} className="w-28 flex-shrink-0" />
                              <Input value={filter.value} onChange={(e) => updateFilter(index, fi, 'value', e.target.value)} placeholder="value" className="flex-1" />
                              <button type="button" onClick={() => removeFilter(index, fi)} className="p-1 text-neutral-500 hover:text-red-400 transition-colors ease-apple flex-shrink-0">
                                <TrashIcon className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {category === 'event' && (!step.property_filters || step.property_filters.length < MAX_FILTERS) && (
                        <button type="button" onClick={() => addFilter(index)} className="text-xs text-neutral-500 hover:text-white flex items-center gap-1 transition-colors ease-apple">
                          <PlusIcon className="w-3 h-3" /> Filter by property
                        </button>
                      )}
                    </div>

                    {/* Remove */}
                    <button type="button" onClick={() => removeStep(index)} disabled={steps.length <= 1} className="p-1.5 mt-1 text-neutral-500 hover:text-red-400 disabled:opacity-20 rounded-lg transition-colors ease-apple flex-shrink-0">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}

            {steps.length < MAX_STEPS && (
              <button type="button" onClick={addStep} className="w-full py-2.5 rounded-xl border border-dashed border-neutral-700 text-sm text-neutral-500 hover:text-white hover:border-neutral-500 transition-colors ease-apple flex items-center justify-center gap-2">
                <PlusIcon className="w-3.5 h-3.5" /> Add Step
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-white/[0.06]">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={saving}>
          {saving && <Spinner className="w-4 h-4" />}
          {initialData ? 'Save Changes' : 'Create Funnel'}
        </Button>
      </div>
    </Modal>
  )
}
