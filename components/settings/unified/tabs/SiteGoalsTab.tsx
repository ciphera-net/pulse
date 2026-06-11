'use client'

import { useState } from 'react'
import { Input, Button, toast, Spinner } from '@ciphera-net/facet'
import { Plus, Pencil, Trash, X, Target } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useGoals } from '@/lib/swr/dashboard'
import { createGoal, updateGoal, deleteGoal } from '@/lib/api/goals'
import { getAuthErrorMessage } from '@ciphera-net/facet'
import { useCan } from '@/lib/auth/permissions'

export default function SiteGoalsTab({ siteId }: { siteId: string }) {
  const canManageGoals = useCan('goals.manage')
  const { data: goals = [], mutate, isLoading } = useGoals(siteId)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [eventName, setEventName] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const startCreate = () => {
    setCreating(true)
    setEditing(null)
    setName('')
    setEventName('')
  }

  const startEdit = (goal: { id: string; name: string; event_name: string }) => {
    setEditing(goal.id)
    setCreating(false)
    setName(goal.name)
    setEventName(goal.event_name)
  }

  const cancel = () => {
    setCreating(false)
    setEditing(null)
    setName('')
    setEventName('')
  }

  const handleSave = async () => {
    if (!name.trim() || !eventName.trim()) {
      toast.error('Name and event name are required')
      return
    }
    if (!/^[a-zA-Z0-9_]+$/.test(eventName)) {
      toast.error('Event name can only contain letters, numbers, and underscores')
      return
    }

    setSaving(true)
    try {
      if (editing) {
        await updateGoal(siteId, editing, { name, event_name: eventName })
        toast.success('Goal updated')
      } else {
        await createGoal(siteId, { name, event_name: eventName })
        toast.success('Goal created')
      }
      await mutate()
      cancel()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to save goal')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (goalId: string) => {
    try {
      await deleteGoal(siteId, goalId)
      toast.success('Goal deleted')
      await mutate()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to delete goal')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="w-6 h-6 text-neutral-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white mb-1">Goals</h3>
          <p className="text-sm text-neutral-400">Track custom events as conversion goals.</p>
        </div>
        {!creating && !editing && canManageGoals && (
          <Button onClick={startCreate} variant="default" className="text-sm gap-1.5">
            <Plus weight="bold" className="w-3.5 h-3.5" /> Add Goal
          </Button>
        )}
      </div>

      {/* Create/Edit form */}
      {(creating || editing) && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-800/30 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">Display Name</label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Sign Up"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">Event Name</label>
              <Input
                value={eventName}
                onChange={e => setEventName(e.target.value)}
                placeholder="e.g. signup_click"
                disabled={!!editing}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <Button onClick={cancel} variant="secondary" className="text-sm">Cancel</Button>
            <Button onClick={handleSave} variant="default" className="text-sm" disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      )}

      {/* Goals list */}
      {goals.length === 0 && !creating ? (
        <EmptyState
          title="No goals yet"
          description="Track custom events like signups, purchases, or button clicks."
          action={canManageGoals ? { label: 'Add your first goal', onClick: startCreate } : undefined}
          icon={<Target weight="regular" />}
          className="py-8"
        />
      ) : (
        <div className="rounded-xl border border-neutral-800 bg-neutral-800/30 divide-y divide-neutral-800">
          {goals.map(goal => (
            <div
              key={goal.id}
              className="flex items-center justify-between px-4 py-3 group"
            >
              <div>
                <p className="text-sm font-medium text-white">{goal.name}</p>
                <p className="text-xs text-neutral-500 font-mono">{goal.event_name}</p>
              </div>
              {canManageGoals && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ease-apple">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => startEdit(goal)}
                  >
                    <Pencil weight="bold" className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-400 hover:text-red-300"
                    onClick={() => setConfirmDeleteId(goal.id)}
                  >
                    <Trash weight="bold" className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null) }}
        title="Delete goal"
        description="This goal and all its associated data will be permanently deleted."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={async () => {
          if (confirmDeleteId) await handleDelete(confirmDeleteId)
        }}
      />
    </div>
  )
}
