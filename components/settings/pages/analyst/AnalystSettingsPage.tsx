'use client'

import * as React from 'react'
import useSWR from 'swr'
import { Button, Textarea, Toggle, toast } from '@ciphera-net/facet'
import { HoldDialog, useUndo } from '@ciphera-net/facet-hold'
import { Brain, PencilSimple, StarFour, Trash, WarningCircle } from '@phosphor-icons/react'
import { memoriesKey } from '@/components/analyst/memories'
import { KitDialogTitle, KitPage, KitRow, KitRows, KitSection } from '@/components/settings/kit/Kit'
import {
  deleteAnalystMemory,
  getAnalystMemories,
  setAnalystMemoriesEnabled,
  updateAnalystMemory,
  type AnalystMemory,
} from '@/lib/api/analyst'
import { ApiError } from '@/lib/api/client'
import { useFeature } from '@/lib/features'
import { usePendingKeys, whilePending } from '@/lib/hold/pending'
import { SkeletonBar } from '@/components/skeletons'

/**
 * Site Settings, Analyst (P1, picked 14-11-2026): one Memories section, the switch as its first row, then the memories,
 * each with a pencil and a bin as the Goals list has them. No Add button: a memory is added by telling Analyst. Everyone
 * with Analyst reads and changes them (owner ruling, 14-11-2026), so the page asks for no permission; a team without
 * Analyst is told so.
 */
export default function AnalystSettingsPage({ siteId }: { siteId: string }) {
  // Keyed by site: an open form or dialog never carries over to another site.
  return <MemoriesForSite key={siteId} siteId={siteId} />
}

// R24: the Goals list's row buttons, so a memory's pencil and bin sit where a goal's do.
const ROW_BUTTONS = '-mr-[9px] flex shrink-0 items-center justify-end gap-1'
const ICON_BUTTON = 'h-8 w-8 text-muted-foreground hover:bg-accent hover:text-foreground'
const DANGER_BUTTON = 'h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive'

const DESCRIPTION =
  "Memories are facts Analyst keeps from your team's chats about this site, like what a source is or when a campaign ran. Analyst reads them with every question about the site."
const SWITCH_CAPTION =
  'When someone tells Analyst something worth keeping, Analyst saves it here for everyone on the team. While this is off, Analyst saves nothing new, and the memories below stay until you delete them.'

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' })
const DAY_YEAR = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

/** "Saved 10 November", with the year when it is not this one. */
export function savedOn(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Saved'
  return `Saved ${(d.getFullYear() === now.getFullYear() ? DAY : DAY_YEAR).format(d)}`
}

function MemoriesForSite({ siteId }: { siteId: string }) {
  const analyst = useFeature('barry')
  const { data, error, isLoading, isValidating, mutate } = useSWR(analyst === true ? memoriesKey(siteId) : null, () => getAnalystMemories(siteId), {
    revalidateOnFocus: false,
  })
  const { defer } = useUndo()
  // A memory whose delete waits behind the Undo bar is hidden now (PUL-28).
  const pendingKeys = usePendingKeys()
  const [switching, setSwitching] = React.useState(false)
  const [editing, setEditing] = React.useState<AnalystMemory | null>(null)
  const [text, setText] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState<AnalystMemory | null>(null)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)

  // * A team without Analyst: the page exists only while the beta is on, and says so instead of failing.
  const off = analyst === false || (error instanceof ApiError && error.status === 404)
  if (off) {
    return (
      <KitPage>
        <KitSection
          title="Analyst is not on for this team"
          description="Analyst is in beta. Your team's owners and admins can turn on beta features in Settings → Team."
          icon={<StarFour />}
        />
      </KitPage>
    )
  }

  if (analyst === null || isLoading || (!data && !error)) {
    return (
      <KitPage>
        <KitSection title="Memories" description={DESCRIPTION} icon={<Brain />}>
          <div role="status" aria-busy="true" aria-label="Loading" className="animate-skeleton-fade">
            <KitRows>
              {[0, 1, 2].map((i) => (
                <KitRow
                  key={i}
                  label={<SkeletonBar as="span" aria-hidden="true" className="block h-3.5 w-48 max-w-full bg-input" />}
                  caption={<SkeletonBar as="span" aria-hidden="true" className="mt-1 block h-3 w-24 bg-input" />}
                />
              ))}
            </KitRows>
          </div>
        </KitSection>
      </KitPage>
    )
  }

  // A failed read is not an empty list: never "No memories yet" for a site whose memories did not load.
  if (error || !data) {
    return (
      <KitPage>
        <KitSection title="Memories" description={DESCRIPTION} icon={<Brain />}>
          <div role="alert">
            <KitRow
              state
              icon={<WarningCircle weight="fill" />}
              tone="coral"
              label="Couldn't load the memories"
              control={
                <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isValidating}>
                  {isValidating ? 'Retrying…' : 'Try again'}
                </Button>
              }
            />
          </div>
        </KitSection>
      </KitPage>
    )
  }

  const memories = data.memories.filter((m) => !pendingKeys.has(`memory:${m.id}`))
  const on = data.enabled === true

  const toggle = async () => {
    const next = !on
    setSwitching(true)
    try {
      await setAnalystMemoriesEnabled(siteId, next)
      await mutate((cur) => (cur ? { ...cur, enabled: next, offer_snoozed_until: null } : cur), { revalidate: false })
    } catch {
      toast.error(next ? "Couldn't turn on memories. Try again." : "Couldn't turn off memories. Try again.")
    } finally {
      setSwitching(false)
    }
  }

  const openEdit = (m: AnalystMemory) => {
    setEditing(m)
    setText(m.body)
    // The form opens above the list (R13): bring it into view and put the cursor in it.
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ block: 'nearest' })
      formRef.current?.querySelector('textarea')?.focus()
    })
  }
  const close = () => {
    setEditing(null)
    setText('')
  }
  const save = async () => {
    if (!editing) return
    const body = text.split(/\s+/).filter(Boolean).join(' ')
    if (!body) return
    setSaving(true)
    try {
      await updateAnalystMemory(siteId, editing.id, body)
      await mutate()
      close()
      toast.success('Memory saved')
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        close()
        void mutate()
        toast.error('Someone deleted this memory while you were editing it.')
      } else if (err instanceof ApiError && err.status === 400 && typeof err.data?.error === 'string') {
        toast.error(err.data.error)
      } else {
        toast.error("Couldn't save the memory. Try again.")
      }
    } finally {
      setSaving(false)
    }
  }

  // The memory disappears at once; the request is sent when the Undo window runs out (PUL-28).
  const remove = (m: AnalystMemory) => {
    if (editing?.id === m.id) close()
    defer(
      whilePending(`memory:${m.id}`, {
        message: 'Memory deleted',
        commit: ({ keepalive }) => deleteAnalystMemory(siteId, m.id, { keepalive }),
        // Awaited before the key is released, so a deleted memory never flashes back while the list refetches.
        onCommitted: () => mutate(),
        onError: () => {
          toast.error("Couldn't delete the memory. Try again.")
        },
      }),
    )
  }

  const length = [...text].length

  return (
    <>
      <KitPage>
        {editing && (
          <KitSection title="Edit memory" icon={<PencilSimple />}>
            <form
              ref={formRef}
              className="flex flex-col gap-5 py-5 md:max-w-xl"
              onSubmit={(e) => {
                e.preventDefault()
                void save()
              }}
            >
              <div className="space-y-1.5">
                <label htmlFor="analyst-memory-body" className="block text-sm font-medium text-foreground">
                  Memory
                </label>
                <Textarea
                  id="analyst-memory-body"
                  value={text}
                  rows={3}
                  maxLength={data.max_length}
                  onChange={(e) => setText(e.target.value)}
                  aria-describedby="analyst-memory-count"
                />
                <p id="analyst-memory-count" className="text-xs tabular-nums text-muted-foreground">
                  {length} of {data.max_length} characters
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={close} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving || text.trim() === ''}>
                  {saving ? 'Saving…' : 'Save memory'}
                </Button>
              </div>
            </form>
          </KitSection>
        )}
        <KitSection
          title="Memories"
          description={DESCRIPTION}
          icon={<Brain />}
          aside={
            <span data-analyst-memories-count="" className="text-xs tabular-nums text-muted-foreground">
              {memories.length} of {data.max_memories}
            </span>
          }
        >
          <KitRows>
            <KitRow
              label="Save memories from chats"
              htmlFor="analyst-memories-switch"
              caption={SWITCH_CAPTION}
              control={<Toggle id="analyst-memories-switch" checked={on} onChange={() => void toggle()} disabled={switching} />}
            />
            {memories.length === 0 ? (
              <KitRow
                label="No memories yet"
                caption={'Tell Analyst something worth keeping in a chat, like "Shared Link is our newsletter", and it shows here.'}
              />
            ) : (
              memories.map((m) => (
                <KitRow
                  key={m.id}
                  label={<span className="block break-words">{m.body}</span>}
                  caption={savedOn(m.created_at)}
                  control={
                    <span className={ROW_BUTTONS}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={ICON_BUTTON}
                        aria-label="Edit memory"
                        disabled={saving}
                        onClick={() => openEdit(m)}
                      >
                        <PencilSimple className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={DANGER_BUTTON}
                        aria-label="Delete memory"
                        aria-haspopup="dialog"
                        disabled={saving}
                        onClick={() => {
                          setDeleting(m)
                          setDeleteOpen(true)
                        }}
                      >
                        <Trash className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </span>
                  }
                />
              ))
            )}
          </KitRows>
        </KitSection>
      </KitPage>

      <HoldDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={<KitDialogTitle icon={<Trash weight="bold" />}>Delete this memory?</KitDialogTitle>}
        description={
          deleting && (
            <>
              Analyst stops reading &quot;{deleting.body}&quot; with questions about this site. Anyone on the team can tell
              Analyst again.
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
