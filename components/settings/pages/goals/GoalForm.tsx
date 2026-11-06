'use client'

import * as React from 'react'
import { Button, Input } from '@ciphera-net/facet'
import { cn } from '@/lib/utils'
import type { EventProblem, GoalProblems, NameProblem } from './checkGoal'

// The copy deck's words for each refusal (§5.3).
const NAME_WORDS: Record<NameProblem, React.ReactNode> = {
  empty: 'Give the goal a name.',
  long: 'Use 255 characters or fewer.',
}

const EVENT_WORDS: Record<EventProblem, React.ReactNode> = {
  empty: 'Enter the event name your site sends.',
  characters: 'Use letters, numbers and underscores only.',
  long: 'Use 64 characters or fewer.',
  pageview: (
    <>
      <code className="font-mono">pageview</code> can&apos;t be a goal. Every pageview is counted already.
    </>
  ),
  taken: 'This event already has a goal.',
}

const INVALID = 'border-destructive focus:border-destructive'

/**
 * Adding or changing a goal (R13: the form opens above the list): the two fields stacked, each with its label and
 * caption over the input, then Cancel and the form's own button. The event name stays open while editing (R14).
 */
export function GoalForm({
  mode,
  name,
  eventName,
  problems,
  saving,
  nameRef,
  onName,
  onEventName,
  onSubmit,
  onCancel,
}: {
  mode: 'add' | 'edit'
  name: string
  eventName: string
  problems: GoalProblems
  saving: boolean
  nameRef: React.Ref<HTMLInputElement>
  onName: (value: string) => void
  onEventName: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <form
      noValidate
      data-goals-form="above"
      data-goals-mode={mode}
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor="goal-name" className="block text-sm font-medium text-foreground">Name</label>
        <p id="goal-name-caption" className="text-xs text-muted-foreground">
          Shown on the dashboard, in funnels and in growth reports.
        </p>
        <Input
          ref={nameRef}
          id="goal-name"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Sign up"
          disabled={saving}
          aria-invalid={problems.name ? true : undefined}
          aria-describedby={problems.name ? 'goal-name-caption goal-name-problem' : 'goal-name-caption'}
          className={cn(problems.name && INVALID)}
        />
        {problems.name && (
          <p id="goal-name-problem" className="text-xs text-destructive">{NAME_WORDS[problems.name]}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="goal-event" className="block text-sm font-medium text-foreground">Event name</label>
        <p id="goal-event-caption" className="text-xs text-muted-foreground">
          The name your site sends, as in <code className="font-mono">pulse.track(&apos;signup_click&apos;)</code>.
        </p>
        <Input
          id="goal-event"
          value={eventName}
          onChange={(e) => onEventName(e.target.value)}
          placeholder="signup_click"
          disabled={saving}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={problems.eventName ? true : undefined}
          aria-describedby={problems.eventName ? 'goal-event-caption goal-event-problem' : 'goal-event-caption'}
          className={cn('font-mono', problems.eventName && INVALID)}
        />
        {problems.eventName && (
          <p id="goal-event-problem" className="text-xs text-destructive">{EVENT_WORDS[problems.eventName]}</p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving…' : mode === 'edit' ? 'Save goal' : 'Add goal'}
        </Button>
      </div>
    </form>
  )
}
