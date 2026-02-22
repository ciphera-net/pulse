'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createFunnel, type CreateFunnelRequest, type FunnelStep } from '@/lib/api/funnels'
import { toast, Input, Button, ChevronLeftIcon, PlusIcon, TrashIcon } from '@ciphera-net/ui'
import Link from 'next/link'

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

export default function CreateFunnelPage() {
  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  // * Backend requires at least one step (API binding min=1, DB rejects empty steps)
  const [steps, setSteps] = useState<Omit<FunnelStep, 'order'>[]>([
    { name: 'Step 1', value: '/', type: 'exact' },
    { name: 'Step 2', value: '', type: 'exact' }
  ])
  const [saving, setSaving] = useState(false)

  const handleAddStep = () => {
    setSteps([...steps, { name: `Step ${steps.length + 1}`, value: '', type: 'exact' }])
  }

  const handleRemoveStep = (index: number) => {
    if (steps.length <= 1) return
    const newSteps = steps.filter((_, i) => i !== index)
    setSteps(newSteps)
  }

  const handleUpdateStep = (index: number, field: keyof Omit<FunnelStep, 'order'>, value: string) => {
    const newSteps = [...steps]
    newSteps[index] = { ...newSteps[index], [field]: value }
    setSteps(newSteps)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      toast.error('Please enter a funnel name')
      return
    }

    if (steps.some(s => !s.name.trim())) {
      toast.error('Please enter a name for all steps')
      return
    }

    if (steps.some(s => !s.value.trim())) {
      toast.error('Please enter a path for all steps')
      return
    }
    const invalidRegexStep = steps.find(s => s.type === 'regex' && !isValidRegex(s.value))
    if (invalidRegexStep) {
      toast.error(`Invalid regex pattern in step: ${invalidRegexStep.name}`)
      return
    }

    try {
      setSaving(true)
      const funnelSteps = steps.map((s, i) => ({
        ...s,
        order: i + 1
      }))

      await createFunnel(siteId, {
        name,
        description,
        steps: funnelSteps
      })

      toast.success('Funnel created')
      router.push(`/sites/${siteId}/funnels`)
    } catch (error) {
      toast.error('Failed to create funnel. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <Link 
          href={`/sites/${siteId}/funnels`}
          className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white mb-6 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 px-2 py-1.5 -ml-2 transition-colors"
        >
          <ChevronLeftIcon className="w-4 h-4" />
          Back to Funnels
        </Link>
        
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
          Create New Funnel
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Define the steps users take to complete a goal.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 mb-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Funnel Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Signup Flow"
                autoFocus
                required
                maxLength={255}
              />
              {name.length > 200 && (
                <span className={`text-xs tabular-nums mt-1 ${name.length > 240 ? 'text-amber-500' : 'text-neutral-400'}`}>{name.length}/255</span>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
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

        <div className="space-y-4 mb-8">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Funnel Steps
            </h3>
          </div>

          {steps.map((step, index) => (
            <div key={index} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4">
              <div className="flex items-start gap-4">
                <div className="mt-3 text-neutral-400">
                  <div className="w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-sm font-medium text-neutral-600 dark:text-neutral-400">
                    {index + 1}
                  </div>
                </div>
                
                <div className="flex-1 grid gap-4 md:grid-cols-2">
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
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 uppercase mb-1">
                      Path / URL
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={step.type}
                        onChange={(e) => handleUpdateStep(index, 'type', e.target.value)}
                        className="w-24 px-2 py-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange outline-none"
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
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveStep(index)}
                  disabled={steps.length <= 1}
                  aria-label="Remove step"
                  className={`mt-3 p-2 rounded-xl transition-colors ${
                    steps.length <= 1 
                      ? 'text-neutral-300 cursor-not-allowed' 
                      : 'text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                  }`}
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={handleAddStep}
            className="w-full py-3 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors flex items-center justify-center gap-2 font-medium"
          >
            <PlusIcon className="w-4 h-4" />
            Add Step
          </button>
        </div>

        <div className="flex justify-end gap-4">
          <Link href={`/sites/${siteId}/funnels`}>
            <Button variant="secondary">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={saving}
            variant="primary"
          >
            {saving ? 'Creating...' : 'Create Funnel'}
          </Button>
        </div>
      </form>
    </div>
  )
}
