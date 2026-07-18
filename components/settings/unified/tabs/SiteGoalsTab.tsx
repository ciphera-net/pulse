'use client'

import { useState } from 'react'
import { Input, Button, toast, Spinner, getAuthErrorMessage } from '@ciphera-net/facet'
import { Plus, Pencil, Trash, Target } from '@phosphor-icons/react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsPanel, PanelRow, PanelRows, EmptyRow } from '@/components/settings/panels'
import { MastheadAction } from '@/components/settings/shell-slots'
import { useGoals } from '@/lib/swr/dashboard'
import { createGoal, updateGoal, deleteGoal } from '@/lib/api/goals'
import { useCan } from '@/lib/auth/permissions'

export default function SiteGoalsTab({ siteId }: { siteId: string }) {
  const canManageGoals = useCan('goals.manage')
  const { data: goals = [], mutate, isLoading, isValidating, error } = useGoals(siteId)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [eventName, setEventName] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; eventName?: string }>({})

  const startCreate = () => {
    setCreating(true)
    setEditing(null)
    setName('')
    setEventName('')
    setFieldErrors({})
  }

  const startEdit = (goal: { id: string; name: string; event_name: string }) => {
    setEditing(goal.id)
    setCreating(false)
    setName(goal.name)
    setEventName(goal.event_name)
    setFieldErrors({})
  }

  const cancel = () => {
    setCreating(false)
    setEditing(null)
    setName('')
    setEventName('')
    setFieldErrors({})
  }

  const validate = () => {
    const next: { name?: string; eventName?: string } = {}
    if (!name.trim()) next.name = 'Display name is required'
    if (!eventName.trim()) next.eventName = 'Event name is required'
    else if (!/^[a-zA-Z0-9_]+$/.test(eventName)) next.eventName = 'Only letters, numbers, and underscores'
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return

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
    if (deletingId) return
    setDeletingId(goalId)
    try {
      await deleteGoal(siteId, goalId)
      toast.success('Goal deleted')
      await mutate()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to delete goal')
    } finally {
      setDeletingId(null)
    }
  }

  // A loading fetch reads as the panel filling in — never a bare spinner.
  if (isLoading) {
    return <SettingsLoadingState rows={3} />
  }

  // error ≠ empty (B6): a failed fetch must surface a retry, never fall through
  // to the "No goals yet" empty state as if the site genuinely had none.
  if (error) {
    return (
      <SettingsErrorState
        message={getAuthErrorMessage(error as Error) || 'Failed to load goals.'}
        onRetry={() => mutate()}
        retrying={isValidating}
      />
    )
  }

  const formOpen = creating || !!editing

  return (
    <div className="space-y-8">
      {/* The tab's one orange: the primary CTA, portaled into the masthead. Hidden
          while the inline form is open so the form's Save button is the only
          solid-orange element in view (spec §2.3). */}
      {canManageGoals && !formOpen && (
        <MastheadAction>
          <Button onClick={startCreate} variant="default" className="gap-1.5">
            <Plus weight="bold" className="h-4 w-4" /> Add goal
          </Button>
        </MastheadAction>
      )}

      <SettingsPanel kicker="Goals" description="Track custom events as conversion goals.">
        {/* Inline create / edit form — per-field validation preserved. */}
        {formOpen && (
          <div className="border-b border-border">
            <div className="px-5 py-3">
              <p className="font-semibold text-micro-label uppercase text-muted-foreground">
                {editing ? 'Edit goal' : 'New goal'}
              </p>
            </div>
            <PanelRows>
              <PanelRow label="Display name" htmlFor="goal-name" caption="Shown across reports and funnels.">
                <Input
                  id="goal-name"
                  value={name}
                  onChange={e => {
                    setName(e.target.value)
                    if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: undefined }))
                  }}
                  placeholder="e.g. Sign up"
                  disabled={saving}
                  aria-invalid={!!fieldErrors.name || undefined}
                  className={fieldErrors.name ? 'border-destructive focus:border-destructive' : undefined}
                />
                {fieldErrors.name && <p className="mt-1 text-xs text-destructive">{fieldErrors.name}</p>}
              </PanelRow>
              <PanelRow
                label="Event name"
                htmlFor="goal-event"
                caption="The event key sent from your site. Can't be changed after creation."
              >
                <Input
                  id="goal-event"
                  value={eventName}
                  onChange={e => {
                    setEventName(e.target.value)
                    if (fieldErrors.eventName) setFieldErrors(prev => ({ ...prev, eventName: undefined }))
                  }}
                  placeholder="e.g. signup_click"
                  disabled={!!editing || saving}
                  aria-invalid={!!fieldErrors.eventName || undefined}
                  className={`font-mono ${fieldErrors.eventName ? 'border-destructive focus:border-destructive' : ''}`}
                />
                {fieldErrors.eventName && <p className="mt-1 text-xs text-destructive">{fieldErrors.eventName}</p>}
              </PanelRow>
            </PanelRows>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <Button onClick={cancel} variant="secondary" size="sm" disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} variant="default" size="sm" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        )}

        {/* Goals list — ruled rows with ALWAYS-visible actions (no hover reveal). */}
        {goals.length === 0 && !creating ? (
          <EmptyRow
            icon={<Target weight="regular" />}
            title="No goals yet"
            caption="Track custom events like signups, purchases, or button clicks as conversion goals."
            action={
              canManageGoals ? (
                <Button variant="secondary" size="sm" onClick={startCreate}>Add your first goal</Button>
              ) : undefined
            }
            ghost={
              <div className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium text-foreground">Sign up</p>
                  <p className="font-mono text-xs text-muted-foreground">signup_click</p>
                </div>
              </div>
            }
          />
        ) : (
          <PanelRows>
            {goals.map(goal => (
              <div key={goal.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{goal.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{goal.event_name}</p>
                </div>
                {canManageGoals && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Edit ${goal.name}`}
                      onClick={() => startEdit(goal)}
                      disabled={deletingId === goal.id}
                    >
                      <Pencil weight="bold" className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Delete ${goal.name}`}
                      onClick={() => setConfirmDeleteId(goal.id)}
                      disabled={deletingId === goal.id}
                    >
                      {deletingId === goal.id
                        ? <Spinner className="h-3.5 w-3.5" />
                        : <Trash weight="bold" className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </PanelRows>
        )}
      </SettingsPanel>

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
