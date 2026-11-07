'use client'

import { Fragment, useState, type ChangeEvent, type ReactNode } from 'react'
import useSWR from 'swr'
import { Button, Input, Select } from '@ciphera-net/facet'
import { CalendarBlank, CaretDown, CaretRight, ClockCounterClockwise } from '@phosphor-icons/react'
import { KitBlock, KitRow, KitRows, KitSection } from '@/components/settings/kit/Kit'
import { getAuditLog, type AuditLogEntry, type GetAuditLogResponse } from '@/lib/api/audit'
import { useAuth } from '@/lib/auth/context'
import { AUDIT_ACTIONS, actionLabelFor } from '@/lib/audit/actions'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { formatPlanName } from '@/lib/plans'
import { cn } from '@/lib/utils'
import { KitLoadError, KitLoadingRows } from './states'
import { personName, shortDayTime } from './words'
import { useMembers } from '@/lib/swr/members'
import { PersonAvatar, PersonInline } from '@/components/settings/names/people'
import { usePeopleNames } from '@/components/settings/names/useNames'

const PAGE_SIZE = 20

// Facet's Select shows its placeholder for an empty value, so "All actions" needs a value of its own; it is sent as
// no `action` filter at all.
const ALL_ACTIONS = 'all'

// "site_id" reads as "Site id".
function humanizeKey(key: string): string {
  const words = key.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// A payload key that names an id, a credential or a path is code and renders mono; everything else, a boolean, a
// number or an English word included, is copy and stays sans.
function isIdentifierKey(key: string): boolean {
  return /(^|_)(id|key|token|slug|hash)$/.test(key) || key === 'domain' || key === 'path' || key === 'url'
}

function formatPayloadValue(key: string, value: unknown): { text: string; mono: boolean } {
  if (key === 'plan_id' && typeof value === 'string') return { text: formatPlanName(value), mono: false }
  if (value === null || value === undefined) return { text: 'None', mono: false }
  if (typeof value === 'boolean') return { text: value ? 'Yes' : 'No', mono: false }
  if (typeof value === 'number') return { text: value.toLocaleString(), mono: false }
  // A nested object's dump is JSON: code by the typography rule's own test.
  if (typeof value === 'object') return { text: JSON.stringify(value), mono: true }
  return { text: String(value), mono: isIdentifierKey(key) }
}

function PayloadDetails({ payload }: { payload: Record<string, unknown> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-2 py-3 sm:grid-cols-2">
      {Object.entries(payload).map(([key, value]) => {
        const { text, mono } = formatPayloadValue(key, value)
        return (
          <div key={key} className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
            <dt className="text-xs text-muted-foreground">{humanizeKey(key)}</dt>
            <dd className={cn('text-right text-xs text-foreground', mono && 'break-all font-mono')}>{text}</dd>
          </div>
        )
      })}
    </dl>
  )
}

// The browser's own calendar glyph is hidden but still covers the field, so the whole field opens the picker; a
// Phosphor glyph sits in its place.
const DATE_INPUT = cn(
  'w-40 pr-9 [color-scheme:dark] placeholder-shown:text-muted-foreground',
  '[&::-webkit-calendar-picker-indicator]:opacity-0',
  '[&::-webkit-calendar-picker-indicator]:absolute',
  '[&::-webkit-calendar-picker-indicator]:inset-0',
  '[&::-webkit-calendar-picker-indicator]:w-full',
  '[&::-webkit-calendar-picker-indicator]:cursor-pointer',
)

/**
 * Activity log (copy deck §9.8): the team's changes, with the action and date filters, details and pages of today's
 * Audit log. Teams only, and only for the owner and admins (`audit.view`); the page decides whether it shows. Who
 * did it is "You", "Teammate" and the id, or "Pulse" when no person did.
 *
 * With the team-names beta on (design §7, R63), Who takes the People row's device: the avatar, then the name, with the
 * id beside it only for a former member (the name they had when they left, marked "former"), a name another person
 * has, or a name equal to one of Pulse's words. Pulse's own words stay grey. The details stay ids, shown as code.
 */
export function ActivityLogSection() {
  const { user } = useAuth()
  const orgId = user?.org_id ?? null
  const { zone } = useDisplayZone()
  const [page, setPage] = useState(1)
  const [action, setAction] = useState<string | null>(null)
  const [startDate, setStartDate] = useState<string | null>(null)
  const [endDate, setEndDate] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())

  // The previous page stays on screen while a filter, a date or a page is read (keepPreviousData), so the filters
  // stay mounted and focus survives picking a "from" and a "to" date in a row. A failure waits for Try again.
  const { data, error, isLoading, mutate } = useSWR<GetAuditLogResponse>(
    orgId ? ['team-activity-log', orgId, page, action, startDate, endDate] : null,
    () =>
      getAuditLog({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        ...(action && { action }),
        ...(startDate && { start_date: startDate }),
        ...(endDate && { end_date: endDate }),
      }),
    { keepPreviousData: true, revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const entries: AuditLogEntry[] = data?.entries ?? []
  const total = data?.total ?? 0
  const hasLoadedOnce = data !== undefined
  const names = usePeopleNames()
  const { list: members } = useMembers()

  const who = (actorId: string | undefined): ReactNode => {
    if (!names.on) return actorId ? personName(actorId, user?.id) : 'Pulse'
    // Not in the team any more: the members the page already read say so while the session cannot (locked).
    const current = actorId && members ? members.some((m) => m.user_id === actorId) : null
    const inline = <PersonInline who={names.who(actorId, current)} id={actorId ?? ''} />
    if (!actorId) return inline
    // A block-level flex: an inline one sits on the text's baseline, and the rows with an avatar come out taller.
    return (
      <span className="flex items-center gap-2">
        <PersonAvatar id={actorId} seed={data?.avatar_seeds[actorId] ?? null} />
        {inline}
      </span>
    )
  }

  const retry = () => void mutate()
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Date inputs give YYYY-MM-DD, so comparing the strings finds a range the wrong way round, which the API would
  // answer with nothing.
  const invalidRange = Boolean(startDate && endDate && startDate > endDate)
  const filtersOn = Boolean(action || startDate || endDate)
  const refetching = hasLoadedOnce && isLoading
  const failed = Boolean(error) && !isLoading
  const rangeStart = (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)

  const filters = (
    <KitBlock>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="team-log-action" className="block text-xs font-medium text-muted-foreground">
            Action
          </label>
          <Select
            id="team-log-action"
            aria-label="Filter by action"
            value={action ?? ALL_ACTIONS}
            onChange={(v) => {
              setAction(v === ALL_ACTIONS ? null : v)
              setPage(1)
            }}
            placeholder="All actions"
            disabled={refetching}
            className="w-52"
            options={[{ value: ALL_ACTIONS, label: 'All actions' }, ...AUDIT_ACTIONS.map((value) => ({ value, label: actionLabelFor(value, false) }))]}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="team-log-from" className="block text-xs font-medium text-muted-foreground">
            From
          </label>
          <div className="relative">
            <Input
              id="team-log-from"
              type="date"
              value={startDate ?? ''}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setStartDate(e.target.value || null)
                setPage(1)
              }}
              disabled={refetching}
              className={DATE_INPUT}
            />
            <CalendarBlank className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="team-log-to" className="block text-xs font-medium text-muted-foreground">
            To
          </label>
          <div className="relative">
            <Input
              id="team-log-to"
              type="date"
              value={endDate ?? ''}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setEndDate(e.target.value || null)
                setPage(1)
              }}
              disabled={refetching}
              className={DATE_INPUT}
            />
            <CalendarBlank className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
        {filtersOn && (
          <Button
            variant="outline"
            size="sm"
            disabled={refetching}
            onClick={() => {
              setAction(null)
              setStartDate(null)
              setEndDate(null)
              setPage(1)
            }}
          >
            Clear
          </Button>
        )}
      </div>
      {invalidRange && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          The start date is after the end date.
        </p>
      )}
    </KitBlock>
  )

  let body: ReactNode
  if (!hasLoadedOnce) {
    body = failed ? <KitLoadError title="Couldn't load the activity log" onRetry={retry} /> : <KitLoadingRows rows={3} />
  } else {
    body = (
      <>
        {filters}
        {failed ? (
          // A later read failing keeps the filters in place; only a first read fails the whole section.
          <KitLoadError title="Couldn't load the activity log. Try again." onRetry={retry} />
        ) : entries.length === 0 ? (
          filtersOn ? (
            <KitRow label="Nothing matches these filters." />
          ) : (
            <KitRow label="No activity yet" caption="Changes to sites, people and billing show here." />
          )
        ) : (
          <KitBlock>
            <div aria-busy={refetching || undefined} className={cn(refetching && 'pointer-events-none opacity-60')}>
              <table data-team-audit="" aria-label="Activity log" className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Time</th>
                    <th className="pb-2 pr-4 font-medium">Who</th>
                    <th className="pb-2 font-medium">What</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entries.map((e) => {
                    const payload = e.payload && Object.keys(e.payload).length > 0 ? e.payload : null
                    const isOpen = expanded.has(e.id)
                    return (
                      <Fragment key={e.id}>
                        <tr>
                          <td className="whitespace-nowrap py-2 pr-4 align-top tabular-nums text-muted-foreground">{shortDayTime(e.occurred_at, zone)}</td>
                          <td className="py-2 pr-4 align-top">{who(e.actor_id)}</td>
                          <td className="py-2 align-top">
                            <span className="flex items-center justify-between gap-2">
                              <span>{actionLabelFor(e.action, false)}</span>
                              {payload && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                                  onClick={() => toggle(e.id)}
                                  aria-expanded={isOpen}
                                  aria-controls={`team-log-details-${e.id}`}
                                  aria-label={isOpen ? 'Hide details' : 'Show details'}
                                >
                                  {isOpen ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}
                                </Button>
                              )}
                            </span>
                          </td>
                        </tr>
                        {payload && isOpen && (
                          <tr>
                            <td colSpan={3} id={`team-log-details-${e.id}`}>
                              <PayloadDetails payload={payload} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {rangeStart.toLocaleString()} to {rangeEnd.toLocaleString()} of {total.toLocaleString()}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || refetching}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page * PAGE_SIZE >= total || refetching}>
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </KitBlock>
        )}
      </>
    )
  }

  return (
    <KitSection
      title="Activity log"
      description="Changes made in this team over the last 12 months: sites, goals, connected services, people and billing."
      icon={<ClockCounterClockwise />}
    >
      <KitRows>{body}</KitRows>
    </KitSection>
  )
}
