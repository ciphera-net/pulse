'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Input, Button, ChevronLeftIcon, ChevronDownIcon, PlusIcon, TrashIcon } from '@ciphera-net/ui'
import { CaretUp } from '@phosphor-icons/react'
import type { FunnelStep, StepPropertyFilter, CreateFunnelRequest } from '@/lib/api/funnels'

type StepWithoutOrder = Omit<FunnelStep, 'order'>

interface FunnelFormProps {
  siteId: string
  initialData?: {
    name: string
    description: string
    steps: StepWithoutOrder[]
    conversion_window_value: number
    conversion_window_unit: 'hours' | 'days'
  }
  onSubmit: (data: CreateFunnelRequest) => Promise<void>
  submitLabel: string
  cancelHref: string
}

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

const WINDOW_PRESETS = [
  { label: '1h', value: 1, unit: 'hours' as const },
  { label: '24h', value: 24, unit: 'hours' as const },
  { label: '7d', value: 7, unit: 'days' as const },
  { label: '14d', value: 14, unit: 'days' as const },
  { label: '30d', value: 30, unit: 'days' as const },
]

const OPERATOR_OPTIONS: { value: StepPropertyFilter['operator']; label: string }[] = [
  { value: 'is', label: 'is' },
  { value: 'is_not', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
]

const MAX_STEPS = 8
const MAX_FILTERS = 10

export default function FunnelForm({ siteId, initialData, onSubmit, submitLabel, cancelHref }: FunnelFormProps) {
  const [name, setName] = useState(initialData?.name ?? '')
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [steps, setSteps] = useState<StepWithoutOrder[]>(
    initialData?.steps ?? [
      { name: 'Step 1', value: '/', type: 'exact' },
      { name: 'Step 2', value: '', type: 'exact' },
    ]
  )
  const [windowValue, setWindowValue] = useState(initialData?.conversion_window_value ?? 7)
  const [windowUnit, setWindowUnit] = useState<'hours' | 'days'>(initialData?.conversion_window_unit ?? 'days')

  const handleAddStep = () => {
    if (steps.length >= MAX_STEPS) return
    setSteps([...steps, { name: `Step ${steps.length + 1}`, value: '', type: 'exact' }])
  }

  const handleRemoveStep = (index: number) => {
    if (steps.length <= 1) return
    setSteps(steps.filter((_, i) => i !== index))
  }

  const handleUpdateStep = (index: number, field: string, value: string) => {
    const newSteps = [...steps]
    const step = { ...newSteps[index] }

    if (field === 'category') {
      step.category = value as 'page' | 'event'
      // Reset fields when switching category
      if (value === 'event') {
        step.type = 'exact'
        step.value = ''
      } else {
        step.value = ''
        step.property_filters = undefined
      }
    } else {
      ;(step as Record<string, unknown>)[field] = value
    }

    newSteps[index] = step
    setSteps(newSteps)
  }

  const moveStep = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= steps.length) return
    const newSteps = [...steps]
    const temp = newSteps[index]
    newSteps[index] = newSteps[targetIndex]
    newSteps[targetIndex] = temp
    setSteps(newSteps)
  }

  // Property filter handlers
  const addPropertyFilter = (stepIndex: number) => {
    const newSteps = [...steps]
    const step = { ...newSteps[stepIndex] }
    const filters = [...(step.property_filters || [])]
    if (filters.length >= MAX_FILTERS) return
    filters.push({ key: '', operator: 'is', value: '' })
    step.property_filters = filters
    newSteps[stepIndex] = step
    setSteps(newSteps)
  }

  const updatePropertyFilter = (stepIndex: number, filterIndex: number, field: keyof StepPropertyFilter, value: string) => {
    const newSteps = [...steps]
    const step = { ...newSteps[stepIndex] }
    const filters = [...(step.property_filters || [])]
    filters[filterIndex] = { ...filters[filterIndex], [field]: value }
    step.property_filters = filters
    newSteps[stepIndex] = step
    setSteps(newSteps)
  }

  const removePropertyFilter = (stepIndex: number, filterIndex: number) => {
    const newSteps = [...steps]
    const step = { ...newSteps[stepIndex] }
    const filters = [...(step.property_filters || [])]
    filters.splice(filterIndex, 1)
    step.property_filters = filters.length > 0 ? filters : undefined
    newSteps[stepIndex] = step
    setSteps(newSteps)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      const { toast } = await import('@ciphera-net/ui')
      toast.error('Please enter a funnel name')
      return
    }

    if (steps.some(s => !s.name.trim())) {
      const { toast } = await import('@ciphera-net/ui')
      toast.error('Please enter a name for all steps')
      return
    }

    // Validate based on category
    for (const step of steps) {
      const category = step.category || 'page'

      if (!step.value.trim()) {
        const { toast } = await import('@ciphera-net/ui')
        toast.error(category === 'event'
          ? `Please enter an event name for step: ${step.name}`
          : `Please enter a path for step: ${step.name}`)
        return
      }

      if (category === 'page' && step.type === 'regex' && !isValidRegex(step.value)) {
        const { toast } = await import('@ciphera-net/ui')
        toast.error(`Invalid regex pattern in step: ${step.name}`)
        return
      }

      if (category === 'event' && step.property_filters) {
        for (const filter of step.property_filters) {
          if (!filter.key.trim()) {
            const { toast } = await import('@ciphera-net/ui')
            toast.error(`Property filter key is required in step: ${step.name}`)
            return
          }
        }
      }
    }

    const funnelSteps = steps.map((s, i) => ({
      ...s,
      order: i,
    }))

    await onSubmit({
      name,
      description,
      steps: funnelSteps,
      conversion_window_value: windowValue,
      conversion_window_unit: windowUnit,
    })
  }

  const selectClass = 'px-2 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange outline-none'

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 pb-8">
      <div className="mb-8">
        <Link
          href={cancelHref}
          className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white mb-6 rounded-xl hover:bg-neutral-800 px-2 py-1.5 -ml-2 transition-colors ease-apple"
        >
          <ChevronLeftIcon className="w-4 h-4" />
          Back to Funnels
        </Link>

        <h1 className="text-2xl font-semibold text-white mb-2">
          {initialData ? 'Edit Funnel' : 'Create New Funnel'}
        </h1>
        <p className="text-neutral-400">
          Define the steps users take to complete a goal.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Name & Description */}
        <div className="glass-surface rounded-2xl p-6 mb-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">
                Funnel Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Signup Flow"
                autoFocus
                required
                maxLength={100}
              />
              {name.length > 80 && (
                <span className={`text-xs tabular-nums mt-1 ${name.length > 90 ? 'text-amber-500' : 'text-neutral-400'}`}>
                  {name.length}/100
                </span>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">
                Description (Optional)
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tracks users from landing page to signup"
              />
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-4 mb-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">
              Funnel Steps
            </h3>
          </div>

          {steps.map((step, index) => {
            const category = step.category || 'page'

            return (
              <div key={`step-${index}`} className="glass-surface rounded-2xl p-6">
                <div className="flex items-start gap-4">
                  {/* Step number + reorder */}
                  <div className="mt-3 text-neutral-400 flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-sm font-medium text-neutral-400">
                      {index + 1}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveStep(index, -1)}
                        disabled={index === 0}
                        className="p-0.5 text-neutral-400 hover:text-neutral-300 disabled:opacity-30 transition-colors ease-apple"
                      >
                        <CaretUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStep(index, 1)}
                        disabled={index === steps.length - 1}
                        className="p-0.5 text-neutral-400 hover:text-neutral-300 disabled:opacity-30 transition-colors ease-apple"
                      >
                        <ChevronDownIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1">
                    {/* Category toggle */}
                    <div className="flex gap-1 mb-3">
                      <button
                        type="button"
                        onClick={() => handleUpdateStep(index, 'category', 'page')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          category === 'page'
                            ? 'bg-brand-orange-button text-white'
                            : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                        } ease-apple`}
                      >
                        Page Visit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateStep(index, 'category', 'event')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          category === 'event'
                            ? 'bg-brand-orange-button text-white'
                            : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                        } ease-apple`}
                      >
                        Custom Event
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-neutral-500 uppercase mb-1">
                          Step Name
                        </label>
                        <Input
                          value={step.name}
                          onChange={(e) => handleUpdateStep(index, 'name', e.target.value)}
                          placeholder="e.g. Landing Page"
                        />
                      </div>

                      {category === 'page' ? (
                        <div>
                          <label className="block text-xs font-medium text-neutral-500 uppercase mb-1">
                            Path / URL
                          </label>
                          <div className="flex gap-2">
                            <select
                              value={step.type}
                              onChange={(e) => handleUpdateStep(index, 'type', e.target.value)}
                              className={`w-24 ${selectClass}`}
                            >
                              <option value="exact">Exact</option>
                              <option value="contains">Contains</option>
                              <option value="regex">Regex</option>
                            </select>
                            <Input
                              value={step.value}
                              onChange={(e) => handleUpdateStep(index, 'value', e.target.value)}
                              placeholder={step.type === 'exact' ? '/pricing' : 'pricing'}
                              className="flex-1"
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs font-medium text-neutral-500 uppercase mb-1">
                            Event Name
                          </label>
                          <Input
                            value={step.value}
                            onChange={(e) => handleUpdateStep(index, 'value', e.target.value)}
                            placeholder="e.g. signup, purchase"
                          />
                        </div>
                      )}
                    </div>

                    {/* Property filters (event steps only) */}
                    {category === 'event' && (
                      <div className="mt-3">
                        {step.property_filters && step.property_filters.length > 0 && (
                          <div className="space-y-2 mb-2">
                            {step.property_filters.map((filter, filterIndex) => (
                              <div key={filterIndex} className="flex gap-2 items-center">
                                <Input
                                  value={filter.key}
                                  onChange={(e) => updatePropertyFilter(index, filterIndex, 'key', e.target.value)}
                                  placeholder="key"
                                  className="flex-1"
                                />
                                <select
                                  value={filter.operator}
                                  onChange={(e) => updatePropertyFilter(index, filterIndex, 'operator', e.target.value)}
                                  className={selectClass}
                                >
                                  {OPERATOR_OPTIONS.map(op => (
                                    <option key={op.value} value={op.value}>{op.label}</option>
                                  ))}
                                </select>
                                <Input
                                  value={filter.value}
                                  onChange={(e) => updatePropertyFilter(index, filterIndex, 'value', e.target.value)}
                                  placeholder="value"
                                  className="flex-1"
                                />
                                <button
                                  type="button"
                                  onClick={() => removePropertyFilter(index, filterIndex)}
                                  className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-900/20 rounded-lg transition-colors ease-apple"
                                >
                                  <TrashIcon className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {(!step.property_filters || step.property_filters.length < MAX_FILTERS) && (
                          <button
                            type="button"
                            onClick={() => addPropertyFilter(index)}
                            className="text-xs text-neutral-500 hover:text-white flex items-center gap-1 transition-colors ease-apple"
                          >
                            <PlusIcon className="w-3.5 h-3.5" />
                            Add property filter
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveStep(index)}
                    disabled={steps.length <= 1}
                    aria-label="Remove step"
                    className={`mt-3 p-2 rounded-xl transition-colors ${
                      steps.length <= 1
                        ? 'text-neutral-300 cursor-not-allowed'
                        : 'text-neutral-400 hover:text-red-500 hover:bg-red-900/20'
                    } ease-apple`}
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )
          })}

          {steps.length < MAX_STEPS ? (
            <button
              type="button"
              onClick={handleAddStep}
              className="w-full py-3 glass-surface rounded-2xl text-neutral-500 hover:text-white hover:border-white/[0.15] transition-colors duration-fast ease-apple flex items-center justify-center gap-2 font-medium"
            >
              <PlusIcon className="w-4 h-4" />
              Add Step
            </button>
          ) : (
            <p className="text-center text-sm text-neutral-400">Maximum 8 steps</p>
          )}
        </div>

        {/* Conversion Window */}
        <div className="glass-surface rounded-2xl p-6 mb-6">
          <h3 className="text-sm font-medium text-neutral-300 mb-3">
            Conversion Window
          </h3>
          <p className="text-xs text-neutral-500 mb-4">
            Visitors must complete all steps within this time to count as converted.
          </p>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-2 mb-4">
            {WINDOW_PRESETS.map(preset => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setWindowValue(preset.value)
                  setWindowUnit(preset.unit)
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  windowValue === preset.value && windowUnit === preset.unit
                    ? 'bg-brand-orange-button text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                } ease-apple`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom input */}
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              min={1}
              max={2160}
              value={windowValue}
              onChange={(e) => setWindowValue(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20"
            />
            <select
              value={windowUnit}
              onChange={(e) => setWindowUnit(e.target.value as 'hours' | 'days')}
              className={selectClass}
            >
              <option value="hours">hours</option>
              <option value="days">days</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <Link href={cancelHref}>
            <Button variant="secondary">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            variant="primary"
          >
            {submitLabel}
          </Button>
        </div>
      </form>
    </div>
  )
}
