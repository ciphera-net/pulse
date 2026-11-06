'use client'

import * as React from 'react'
import { flushSync } from 'react-dom'
import { useReducedMotion } from 'framer-motion'
import { Button, toast } from '@ciphera-net/facet'
import { HoldDialog, useUndo } from '@ciphera-net/facet-hold'
import { ArrowSquareOut, LockSimple, PencilSimple, Plus, Trash, WarningCircle } from '@phosphor-icons/react'
import { KitDialogTitle, KitPage, KitRow, KitRows, KitSection, KitStatus } from '@/components/settings/kit/Kit'
import { MastheadAction } from '@/components/settings/shell-slots'
import { ApiError } from '@/lib/api/client'
import { createGoal, deleteGoal, updateGoal, type Goal } from '@/lib/api/goals'
import { useCan } from '@/lib/auth/permissions'
import { docsUrl } from '@/lib/docs'
import { usePendingKeys, whilePending } from '@/lib/hold/pending'
import { useGoals } from '@/lib/swr/dashboard'
import { checkGoal, hasProblems, NO_PROBLEMS, type GoalProblems } from './checkGoal'
import { GoalForm } from './GoalForm'

/**
 * Goals (settings overhaul P3), from its approved drawing and the copy deck's §5. The page has no section heading: the
 * page is Goals already (§5.1). Its line comes first, then the form when it is open (R13: above the list), then the list
 * between two hairlines. Owners and admins only (`goals.manage`).
 */
export default function GoalsPage({ siteId }: { siteId: string }) {
  // Keyed by site: an open form or dialog never carries over to another site.
  return <GoalsForSite key={siteId} siteId={siteId} />
}

type FormState = { mode: 'add' } | { mode: 'edit'; goal: Goal }

// R24: a ghost icon button centres its 14 px glyph in 32 px, 9 px in from its edge; the negative margin takes the inset
// back, so a row's last glyph sits on the right edge the masthead button and the fields share.
const ROW_BUTTONS = '-mr-[9px] flex shrink-0 items-center justify-end gap-1'
const ICON_BUTTON = 'h-8 w-8 text-muted-foreground hover:bg-accent hover:text-foreground'
const DANGER_BUTTON = 'h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive'

/** The server's refusal of a second goal for one event: another person added it after this list loaded. */
function isTakenRefusal(err: unknown): boolean {
  return err instanceof ApiError && err.status === 400 && err.data?.error === 'A goal with this event name already exists'
}

function Intro() {
  return (
    <p data-goals-intro="" className="max-w-[60ch] text-sm text-muted-foreground">
      A goal gives one of your site&apos;s events a name. It shows by that name on the dashboard and in funnels, and
      growth reports list it.
    </p>
  )
}

function GoalsForSite({ siteId }: { siteId: string }) {
  const canManage = useCan('goals.manage')
  const reducedMotion = useReducedMotion()
  const { data, mutate, isLoading, isValidating, error } = useGoals(siteId)
  const goals = data ?? []
  const { defer } = useUndo()
  // A goal whose delete is waiting behind the Undo bar is hidden now (PUL-28).
  const pendingKeys = usePendingKeys()
  const visibleGoals = goals.filter((g) => !pendingKeys.has(`goal:${g.id}`))

  const [form, setForm] = React.useState<FormState | null>(null)
  const [name, setName] = React.useState('')
  const [eventName, setEventName] = React.useState('')
  const [problems, setProblems] = React.useState<GoalProblems>(NO_PROBLEMS)
  const [saving, setSaving] = React.useState(false)
  // The goal the delete dialog names; kept once the dialog closes, so its words hold while it animates out.
  const [deleting, setDeleting] = React.useState<Goal | null>(null)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  const formRef = React.useRef<HTMLDivElement>(null)
  const nameRef = React.useRef<HTMLInputElement>(null)

  const open = (next: FormState) => {
    // Rendered now, so the form exists to scroll to.
    flushSync(() => {
      setForm(next)
      setName(next.mode === 'edit' ? next.goal.name : '')
      setEventName(next.mode === 'edit' ? next.goal.event_name : '')
      setProblems(NO_PROBLEMS)
    })
    // R13: a pencil pressed low on a long list brings the form into view and puts the cursor in Name. `nearest` leaves
    // the page still when the form is in view already.
    formRef.current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
    nameRef.current?.focus({ preventScroll: true })
  }

  const close = () => {
    setForm(null)
    setName('')
    setEventName('')
    setProblems(NO_PROBLEMS)
  }

  const save = async () => {
    if (!form || saving) return
    const editing = form.mode === 'edit' ? form.goal : null
    const found = checkGoal({ name, eventName }, goals, editing?.id ?? null)
    if (hasProblems(found)) {
      setProblems(found)
      return
    }
    const body = { name: name.trim(), event_name: eventName.trim() }
    setSaving(true)
    try {
      if (editing) await updateGoal(siteId, editing.id, body)
      else await createGoal(siteId, body)
    } catch (err) {
      setSaving(false)
      if (isTakenRefusal(err)) setProblems({ ...NO_PROBLEMS, eventName: 'taken' })
      // The page's own words (§5.6, finding 3): Facet's message for a status would read "Invalid credentials" on a 403.
      else toast.error(editing ? "Couldn't save the goal. Try again." : "Couldn't add the goal. Try again.")
      return
    }
    // A failed refetch shows as the list's own error; the goal itself was saved.
    await mutate()
    setSaving(false)
    close()
    toast.success(editing ? 'Goal saved' : 'Goal added')
  }

  // The goal disappears at once; the request is sent when the Undo window runs out (PUL-28).
  const remove = (goal: Goal) => {
    if (form?.mode === 'edit' && form.goal.id === goal.id) close()
    defer(
      whilePending(`goal:${goal.id}`, {
        message: `"${goal.name}" deleted`,
        commit: ({ keepalive }) => deleteGoal(siteId, goal.id, { keepalive }),
        // Awaited before the goal's key is released, so a deleted goal never flashes back while the list refetches.
        onCommitted: () => mutate(),
        // The page's own words: the shared helper's fallback never shows, since Facet always returns a sentence.
        onError: () => {
          toast.error(`Couldn't delete "${goal.name}". Try again.`)
        },
      }),
    )
  }

  if (!canManage) {
    return (
      <KitPage>
        <KitSection
          title="Owners and admins only"
          description="Only your team's owners and admins can add and change goals."
          icon={<LockSimple />}
        />
      </KitPage>
    )
  }

  // A loading list reads as rows filling in, in the list's own place.
  if (isLoading) {
    return (
      <KitPage>
        <div>
          <Intro />
          <div role="status" aria-busy="true" aria-label="Loading" className="mt-4 border-y border-border">
            <div className="animate-skeleton-fade">
              <KitRows>
                {[0, 1, 2].map((i) => (
                  <KitRow
                    key={i}
                    label={<span aria-hidden="true" className="block h-3.5 w-24 bg-input" />}
                    caption={<span aria-hidden="true" className="mt-1 block h-3 w-48 max-w-full bg-input" />}
                  />
                ))}
              </KitRows>
            </div>
          </div>
        </div>
      </KitPage>
    )
  }

  // A failed fetch is not an empty list: never "No goals yet" for a site whose goals did not load.
  if (error) {
    return (
      <KitPage>
        <div>
          <Intro />
          <div role="alert" className="mt-4 border-y border-border">
            <KitRow
              state
              icon={<WarningCircle weight="fill" />}
              tone="coral"
              label="Couldn't load your goals"
              control={
                <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isValidating}>
                  {isValidating ? 'Retrying…' : 'Try again'}
                </Button>
              }
            />
          </div>
        </div>
      </KitPage>
    )
  }

  const goalRow = (goal: Goal) => (
    <KitRow
      key={goal.id}
      label={<span className="block truncate">{goal.name}</span>}
      caption={
        <>
          Counts the <code className="font-mono">{goal.event_name}</code> event.
        </>
      }
      control={
        <span className={ROW_BUTTONS}>
          <Button
            variant="ghost"
            size="icon"
            className={ICON_BUTTON}
            aria-label={`Edit ${goal.name}`}
            // Dimmed while a goal is being saved, so the form cannot change under the request (R24: dimmed, not gone).
            disabled={saving}
            onClick={() => open({ mode: 'edit', goal })}
          >
            <PencilSimple className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={DANGER_BUTTON}
            aria-label={`Delete ${goal.name}`}
            aria-haspopup="dialog"
            disabled={saving}
            onClick={() => {
              setDeleting(goal)
              setDeleteOpen(true)
            }}
          >
            <Trash className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </span>
      }
    />
  )

  // No goals yet: the title and caption, the guide that shows how to send an event (§5.2), and an example of a goal,
  // drawn as a row and dimmed, its status leading the caption as a dot and a word (R24: no chip).
  const empty = (
    <div data-goals-empty="">
      <KitRow label="No goals yet" caption="Send an event from your site, like a sign-up or a purchase, then add it here." />
      <div className="-mt-1 pb-4">
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <a href={docsUrl('custom-events')} target="_blank" rel="noopener noreferrer" className="group">
            How to send an event
            <ArrowSquareOut className="h-3.5 w-3.5 transition-colors group-hover:text-brand-ink" aria-hidden="true" />
          </a>
        </Button>
      </div>
      <div data-goals-example="" className="border-t border-border">
        <KitRow
          label={
            <span aria-hidden="true" className="pointer-events-none select-none opacity-40">
              Sign up
            </span>
          }
          caption={
            <>
              <KitStatus tone="off">Example</KitStatus>
              <span aria-hidden="true" className="pointer-events-none select-none opacity-40">
                {' · '}Counts the <code className="font-mono">signup_click</code> event.
              </span>
            </>
          }
        />
      </div>
    </div>
  )

  return (
    <>
      <KitPage>
        {/* While the form is open its own button is the page's one orange, as today. */}
        {!form && (
          <MastheadAction>
            <Button size="sm" onClick={() => open({ mode: 'add' })} data-goals-add="">
              <Plus weight="bold" className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Add goal
            </Button>
          </MastheadAction>
        )}
        <div>
          <Intro />
          {form && (
            <div ref={formRef} className="mt-8 scroll-mt-24">
              <KitSection
                title={form.mode === 'edit' ? 'Edit goal' : 'New goal'}
                icon={form.mode === 'edit' ? <PencilSimple /> : <Plus />}
              >
                <div className="py-5 md:max-w-md">
                  <GoalForm
                    mode={form.mode}
                    name={name}
                    eventName={eventName}
                    problems={problems}
                    saving={saving}
                    nameRef={nameRef}
                    onName={(v) => {
                      setName(v)
                      if (problems.name) setProblems((p) => ({ ...p, name: null }))
                    }}
                    onEventName={(v) => {
                      setEventName(v)
                      if (problems.eventName) setProblems((p) => ({ ...p, eventName: null }))
                    }}
                    onSubmit={() => void save()}
                    onCancel={close}
                  />
                </div>
              </KitSection>
            </div>
          )}
          {/* Under an open form the form's closing hairline is the list's first. */}
          <div data-goals-list="" className={form ? '' : 'mt-4'}>
            <div className={form ? 'border-b border-border' : 'border-y border-border'}>
              <KitRows>{visibleGoals.length === 0 ? empty : visibleGoals.map(goalRow)}</KitRows>
            </div>
          </div>
        </div>
      </KitPage>

      <HoldDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={
          <KitDialogTitle icon={<Trash weight="bold" />}>
            {deleting ? `Delete the goal "${deleting.name}"?` : 'Delete the goal?'}
          </KitDialogTitle>
        }
        description={
          deleting && (
            <>
              The name goes, and growth reports and exports stop listing{' '}
              <code className="font-mono">{deleting.event_name}</code> as a goal. Every{' '}
              <code className="font-mono">{deleting.event_name}</code> event stays counted on the dashboard. You can
              add the goal again at any time.
            </>
          )
        }
        holdLabel="Hold to delete"
        icon={<Trash weight="bold" className="h-4 w-4" aria-hidden="true" />}
        onConfirm={() => {
          if (deleting) remove(deleting)
        }}
      />
    </>
  )
}
