'use client'

import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Input, Button, toast, Spinner, getAuthErrorMessage } from '@ciphera-net/facet'
import { Plus, Pencil, Trash, Target } from '@phosphor-icons/react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsPanel, PanelRow, PanelRows, EmptyRow } from '@/components/settings/panels'
import { MastheadAction } from '@/components/settings/shell-slots'
import { DURATION_FAST, DURATION_BASE, EASE_APPLE } from '@/lib/motion'
import { useGoals } from '@/lib/swr/dashboard'
import { createGoal, updateGoal, deleteGoal, type Goal } from '@/lib/api/goals'
import { useCan } from '@/lib/auth/permissions'

export default function SiteGoalsTab({ siteId }: { siteId: string }) {
  const canManageGoals = useCan('goals.manage')
  const reducedMotion = useReducedMotion()
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

  const startEdit = (goal: Goal) => {
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
      toast.error(
        getAuthErrorMessage(err as Error) ||
          (editing ? "Couldn't save the goal. Try again." : "Couldn't create the goal. Try again."),
      )
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
      toast.error(getAuthErrorMessage(err as Error) || "Couldn't delete the goal. Try again.")
    } finally {
      setDeletingId(null)
    }
  }

  // A loading fetch reads as the panel filling in, never a bare spinner.
  if (isLoading) {
    return <SettingsLoadingState rows={3} />
  }

  // Error is not empty: a failed fetch surfaces a named retry, never a
  // "No goals yet" state that reads as if the site genuinely had none.
  if (error) {
    return (
      <SettingsErrorState
        title="Couldn't load your goals"
        message={getAuthErrorMessage(error as Error) || undefined}
        onRetry={() => mutate()}
        retrying={isValidating}
      />
    )
  }

  const formOpen = creating || !!editing
  const confirmGoal = goals.find(goal => goal.id === confirmDeleteId) ?? null

  return (
    <div className="space-y-8">
      {/* The tab's one orange: the primary CTA, portaled into the masthead.
          Hidden while the form panel is open so its own Save button stays the
          only solid-orange element in view. */}
      {canManageGoals && !formOpen && (
        <MastheadAction>
          <Button size="sm" onClick={startCreate}>
            <Plus weight="bold" className="mr-1.5 h-4 w-4" />
            Add goal
          </Button>
        </MastheadAction>
      )}

      {/* A standing panel, not a kicker inside the list: the same device
          TokenReveal uses for a form-shaped in-flow state (API keys tab).
          M6: the reveal grows height and fades in/out rather than popping,
          the same device GoalStats uses for its expanded property row. */}
      <AnimatePresence initial={false}>
        {formOpen && (
          <motion.div
            key="goal-form"
            data-testid="goal-form-reveal"
            initial={reducedMotion ? false : { height: 0, opacity: 0 }}
            animate={reducedMotion ? undefined : { height: 'auto', opacity: 1 }}
            exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}
            className="overflow-hidden"
          >
            <SettingsPanel title={editing ? 'Edit goal' : 'New goal'}>
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
                  caption="The event key sent from your site. It can't be changed after creation."
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
                <Button variant="ghost" size="sm" onClick={cancel} disabled={saving}>
                  Cancel
                </Button>
                <Button variant="default" size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
                </Button>
              </div>
            </SettingsPanel>
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsPanel title="Goals" description="Track custom events as conversion goals.">
        {goals.length === 0 ? (
          <EmptyRow
            icon={<Target weight="regular" />}
            title="No goals yet"
            caption="Track custom events like sign-ups, purchases, and button clicks as conversion goals."
            ghost={
              <>
                <span className="text-sm text-muted-foreground">Sign up</span>
                <span className="font-mono text-xs text-muted-foreground">signup_click</span>
              </>
            }
            ghostLabel="Example"
          />
        ) : (
          <PanelRows>
            <AnimatePresence initial={false}>
              {goals.map(goal => (
                <motion.div
                  key={goal.id}
                  layout={!reducedMotion}
                  initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={
                    reducedMotion
                      ? undefined
                      : { opacity: 1, y: 0, transition: { duration: DURATION_BASE, ease: EASE_APPLE } }
                  }
                  exit={
                    reducedMotion
                      ? undefined
                      : { opacity: 0, y: 4, transition: { duration: DURATION_FAST, ease: EASE_APPLE } }
                  }
                >
                  <PanelRow
                    label={<span className="truncate">{goal.name}</span>}
                    caption={
                      <>
                        Fires on the <code className="font-mono">{goal.event_name}</code> event.
                      </>
                    }
                    control={
                      canManageGoals && (
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
                      )
                    }
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </PanelRows>
        )}
      </SettingsPanel>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null) }}
        title="Delete this goal?"
        description={
          confirmGoal
            ? `"${confirmGoal.name}" and everything recorded against it are deleted immediately. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete goal"
        variant="danger"
        onConfirm={async () => {
          if (confirmDeleteId) await handleDelete(confirmDeleteId)
        }}
      />
    </div>
  )
}
