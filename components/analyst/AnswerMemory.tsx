'use client'

import { createContext, useContext, useId, useState, type FC } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useAuiState } from '@assistant-ui/react'
import { Brain } from '@phosphor-icons/react'
import { toast } from '@ciphera-net/facet'
import { acceptAnalystMemory, getAnalystMemories, isAnalystMemoriesFull, snoozeAnalystMemories } from '@/lib/api/analyst'
import { ApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { memoriesHref, memoriesKey, memoryAskOpen } from './memories'
import { RAISED } from './raised'
import { memoryOf } from './turn'

/**
 * Analyst's memories under an answer (picked 14-11-2026: Q1 and S2). When the question offered a memory and the site's
 * memories are still undecided, a card asks to turn them on and keep it (Turn on memories, Not now); once a memory is
 * kept, a line says what Analyst kept, word for word, with a way to the list. A memory reaches every member's answers,
 * so the person who caused one sees its exact words at once.
 */

/** The site a thread is about, for its memories: the id the calls name and the domain the card asks about. */
export const MemorySite = createContext<{ siteId: string; domain: string } | null>(null)

/** What a failed yes reads: the server's words for a full site (memories are on, this one was not kept), else ours. */
function acceptFailure(err: unknown): string {
  if (isAnalystMemoriesFull(err) && err instanceof ApiError && typeof err.data?.error === 'string') return err.data.error
  return "Couldn't turn on memories. Try again."
}

export const AnswerMemory: FC = () => {
  const site = useContext(MemorySite)
  const titleId = useId()
  // * Strings, never an object: a selector that builds a new object each time re-renders forever. A memory is in a
  // * message only once its answer is finished: the page puts it there with the whole turn, never while it streams.
  const kind = useAuiState((s) => memoryOf(s.message.metadata)?.kind ?? null)
  const memory = useAuiState((s) => memoryOf(s.message.metadata)?.memory ?? null)
  const [state, setState] = useState<'idle' | 'busy' | 'kept' | 'closed'>('idle')
  const { data, mutate } = useSWR(site && kind === 'offered' ? memoriesKey(site.siteId) : null, () => getAnalystMemories(site!.siteId), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  if (!site || !kind || !memory) return null

  if (kind === 'saved' || state === 'kept') {
    return (
      <p data-analyst="memory-saved" role={state === 'kept' ? 'status' : undefined} className="mt-2.5 flex items-start gap-2 text-xs text-neutral-500">
        <Brain aria-hidden="true" className="mt-px h-4 w-4 shrink-0 text-brand-orange" />
        <span className="min-w-0">
          <span className="text-neutral-400">Remembered: {memory}</span>
          <span aria-hidden="true"> · </span>
          <Link href={memoriesHref(site.siteId)} className="text-neutral-400 underline underline-offset-2 transition-colors hover:text-white">
            Manage
          </Link>
        </span>
      </p>
    )
  }
  if (kind !== 'offered' || state === 'closed' || !memoryAskOpen(data, Date.now())) return null

  const accept = async () => {
    setState('busy')
    try {
      const res = await acceptAnalystMemory(site.siteId, memory)
      setState('kept')
      void mutate((cur) => (cur ? { ...cur, enabled: true, offer_snoozed_until: null, memories: [...cur.memories, res.memory] } : cur), {
        revalidate: false,
      })
    } catch (err) {
      // * A full site still turned memories on: the card goes, and the list is read again.
      if (isAnalystMemoriesFull(err)) {
        setState('closed')
        void mutate()
      } else {
        setState('idle')
      }
      toast.error(acceptFailure(err))
    }
  }
  const notNow = async () => {
    setState('busy')
    try {
      await snoozeAnalystMemories(site.siteId)
      setState('closed')
      void mutate()
    } catch {
      setState('idle')
      toast.error("Couldn't save your choice. Try again.")
    }
  }
  const busy = state === 'busy'

  return (
    <div
      data-analyst="memory-ask"
      role="group"
      aria-labelledby={titleId}
      className={cn('mt-3 flex flex-col gap-3 border border-white/[0.08] px-4 py-3.5', RAISED)}
    >
      <div className="flex items-start gap-3">
        <Brain aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span id={titleId} className="text-sm font-medium text-neutral-200">
            Remember this for {site.domain}?
          </span>
          <span className="border-l-2 border-brand-orange/60 pl-2.5 text-sm text-neutral-300">{memory}</span>
          <span className="text-xs text-neutral-500">
            Turning on memories lets Analyst keep facts like this and use them in everyone&apos;s answers about this site. You can see
            and delete them in Site Settings.
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 pl-7">
        <button
          type="button"
          onClick={accept}
          disabled={busy}
          aria-busy={busy}
          className="inline-flex h-8 items-center bg-brand-orange px-3 text-sm text-white transition-colors hover:bg-brand-orange-button-hover disabled:bg-white/[0.06] disabled:text-neutral-500"
        >
          Turn on memories
        </button>
        <button
          type="button"
          onClick={notNow}
          disabled={busy}
          className="inline-flex h-8 items-center px-2.5 text-sm text-neutral-400 transition-colors hover:text-white disabled:text-neutral-600"
        >
          Not now
        </button>
      </div>
    </div>
  )
}
