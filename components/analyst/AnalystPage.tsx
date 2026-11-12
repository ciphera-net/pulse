'use client'

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type FC, type ReactNode } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  groupPartByType,
  useAui,
  useAuiState,
  useLocalRuntime,
  type ChatModelAdapter,
  type TextMessagePartComponent,
} from '@assistant-ui/react'
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown'
import {
  ArrowRight,
  ArrowUp,
  CaretDown,
  Check,
  CheckCircle,
  ClockCounterClockwise,
  Compass,
  Copy,
  DeviceMobile,
  Files,
  NotePencil,
  StarFour,
  Stop,
  TrendUp,
  Warning,
} from '@phosphor-icons/react'
import { RailDelta } from '@/components/funnels/FunnelRail'
import {
  askAnalystStream,
  getAnalystConversations,
  getAnalystTurn,
  getAnalystUsage,
  type AnalystConversation,
  type AnalystStep,
  type AnalystUsage,
} from '@/lib/api/analyst'
import { ApiError } from '@/lib/api/client'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { useSite } from '@/lib/swr/dashboard'
import { cn } from '@/lib/utils'
import { getReferrerIcon } from '@/lib/utils/icons'
import { pctChange } from '@/lib/utils/pctChange'
import { FooterHorizon, WelcomeHorizon } from './AnalystHorizon'
import { RECENT_SHOWN, chatMessages, chatWhenLabel, recentChats } from './history'
import { RECOVERY_LIMIT_MS, waitForTurn } from './recover'
import { describeStep, finishedLookup, runningLookup } from './steps'
import {
  CONNECTION_DROPPED,
  COULD_NOT_ANSWER,
  analystErrorMessage,
  followUpsOf,
  liveParts,
  lookupCounts,
  skippedLine,
  turnMetadata,
  turnParts,
  type LiveStep,
} from './turn'

/**
 * Analyst: a page of its own for asking about one site (PUL-78, Pulse/docs/plans/09-11-2026-barry-ai-analyst-plan.md
 * §4). Built on assistant-ui's primitives (they own the composer, scrolling, copy and cancel); the look is Pulse's:
 * square corners, depth from light (a faint top-lit gradient and a 1px highlight, the content panel's own device), and
 * orange only in the mark, hovers and the send button.
 *
 * The page runs assistant-ui's local runtime with an adapter that streams pulse-backend's answer: each lookup as a
 * tool call while it runs, then the words as they are written, then the whole turn ("Figures behind this answer").
 *
 * Round 6 (ruled 10-11-2026): the Pulse hero's horizon behind the welcome and in the footer while a conversation runs
 * (./AnalystHorizon), and the person's recent chats under the suggestions, each reopened by picking it (./history).
 *
 * Round 7 (picked 11-11-2026): a last row in the lookup list while Analyst works out its answer, lookups named with
 * what they were narrowed to (./steps), and "Ask next" under the newest answer: the questions written for it.
 *
 * Round 8 (picked 12-11-2026): an answer whose stream breaks after it started is read back from the server (./recover)
 * with a line under what had come in, then shows as any answer; one not kept in time says the connection dropped.
 */

const RAISED = 'bg-gradient-to-b from-white/[0.035] to-white/[0.01] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'

const SUGGESTIONS = [
  { title: 'Why did visitors change', label: 'this week?', prompt: 'Why did visitors change this week?', icon: TrendUp },
  { title: 'Where do visitors come from', label: 'this month?', prompt: 'Where do visitors come from this month?', icon: Compass },
  { title: 'Which pages are growing', label: 'compared with last month?', prompt: 'Which pages are growing compared with last month?', icon: Files },
  { title: 'How do phones compare', label: 'with desktops?', prompt: 'How do phones compare with desktops?', icon: DeviceMobile },
]

const groupBy = groupPartByType({ 'tool-call': ['group-tool'] })

/** The past chats' key: read by the list, refreshed after each answer. */
const chatsKey = (siteId: string) => ['analyst-conversations', siteId] as const

/** What a question stopped while its answer is read back throws: assistant-ui marks the message stopped, not failed. */
function stoppedError(): Error {
  const err = new Error('The question was stopped.')
  err.name = 'AbortError'
  return err
}

export default function AnalystPage({ siteId }: { siteId: string }) {
  const { data: site } = useSite(siteId)
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ height: number; reach: number } | null>(null)
  // * A new chat, or a past one reopened, is a new runtime: the key remounts the thread with that chat's turns in it.
  const [thread, setThread] = useState<{ key: number; chat: AnalystConversation | null }>({ key: 0, chat: null })
  const openChat = useCallback((chat: AnalystConversation | null) => setThread((t) => ({ key: t.key + 1, chat })), [])

  // * The shell's <main> scrolls and gives a page no height of its own; a chat needs one, so its viewport scrolls and
  // * the question box stays at the bottom. The page fills <main> from where it starts down to main's bottom edge, and
  // * `reach` is how far main's top edge is above the page (where the welcome's glow starts). Layout boxes, never
  // * bounding boxes: the shell slides each page in with a 16 px translate, and measured mid-slide the page came out
  // * 11 px short of main's bottom (production, 10-11-2026).
  useLayoutEffect(() => {
    const main = document.getElementById('main-content')
    if (!main) return
    const fit = () => {
      if (!ref.current) return
      let top = 0
      for (let el: HTMLElement | null = ref.current; el && el !== main; el = el.offsetParent as HTMLElement | null) {
        top += el.offsetTop
      }
      setBox({ height: main.clientHeight - top, reach: top })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(main)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className="relative" style={{ height: box?.height }}>
      <div className="absolute right-6 top-0 z-10">
        <button
          type="button"
          onClick={() => openChat(null)}
          className={cn(
            'inline-flex h-9 items-center gap-2 border border-white/[0.08] px-3.5 text-sm text-neutral-300 transition-colors hover:border-white/[0.16] hover:text-white',
            RAISED,
          )}
        >
          <NotePencil className="h-4 w-4" />
          New chat
        </button>
      </div>
      {site && (
        <AnalystThread
          key={thread.key}
          siteId={siteId}
          siteName={site.domain}
          siteTimezone={site.timezone ?? null}
          chat={thread.chat}
          reach={box?.reach ?? 0}
          onOpenChat={openChat}
        />
      )}
    </div>
  )
}

interface ThreadProps {
  siteId: string
  siteName: string
  siteTimezone: string | null
  /** A past chat to carry on with, or null for a new one. */
  chat: AnalystConversation | null
  reach: number
  onOpenChat: (chat: AnalystConversation) => void
}

const AnalystThread: FC<ThreadProps> = ({ siteId, siteName, siteTimezone, chat, reach, onOpenChat }) => {
  const { mutate } = useSWRConfig()
  const { data: usage, mutate: setUsage } = useSWR(['analyst-usage', siteId], () => getAnalystUsage(), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  // * A reopened chat's follow-ups go to that conversation, so its earlier turns go with them.
  const conversation = useRef<string | null>(chat?.id ?? null)
  const keepUsage = useCallback((u: AnalystUsage | undefined) => {
    if (u) void setUsage(u, { revalidate: false })
  }, [setUsage])

  const adapter = useMemo<ChatModelAdapter>(
    () => ({
      // * The answer streams (round 6, live answers): each lookup shows as it starts and ticks off as it ends, then
      // * the words come as they are written. The finished turn replaces what streamed, so the message ends exactly
      // * as a whole answer would, figures included.
      async *run({ messages, abortSignal }) {
        const last = messages[messages.length - 1]
        const question =
          last?.role === 'user'
            ? last.content.map((p) => (p.type === 'text' ? p.text : '')).join('\n').trim()
            : ''
        const steps: LiveStep[] = []
        let text = ''
        // * The turn as the server will keep it (round 8), named by `start`: read back when the stream breaks.
        let turnId: string | null = null
        const askedAt = Date.now()
        try {
          for await (const ev of askAnalystStream(siteId, question, conversation.current, abortSignal)) {
            switch (ev.type) {
              case 'start':
                // * Known from the first event, so a question stopped halfway still carries on its conversation.
                conversation.current = ev.conversation_id
                turnId = ev.turn_id
                continue
              case 'step':
                steps[ev.index] = { tool: ev.tool, args: ev.args ?? {} }
                break
              case 'step_done': {
                const step = steps[ev.index] ?? { tool: '', args: {} }
                steps[ev.index] = {
                  ...step,
                  done: { tool: step.tool, args: step.args, result: ev.result, ...(ev.error ? { error: ev.error } : {}), ms: ev.ms },
                }
                break
              }
              case 'text':
                text += ev.delta
                break
              case 'discard':
                text = ''
                break
              case 'done':
                conversation.current = ev.answer.conversation_id
                keepUsage(ev.answer.usage)
                // * The past chats list this one now (seen after New chat).
                void mutate(chatsKey(siteId))
                yield { content: turnParts(ev.answer.turn), metadata: turnMetadata(ev.answer.turn) }
                return
              case 'error':
                throw new ApiError(ev.error, 503, { error: ev.error, usage: ev.usage })
            }
            // * The counts go with every yield: a yield's custom metadata replaces the one before it.
            yield { content: liveParts(steps, text), metadata: { custom: lookupCounts(steps.map((s) => s?.done)) } }
          }
          throw new Error('The answer stopped before it was finished.')
        } catch (err) {
          if (abortSignal.aborted) throw err
          if (err instanceof ApiError) keepUsage(err.data?.usage as AnalystUsage | undefined)
          // * The stream broke after Analyst started (round 8, picks 1B, 2A and 3B), while the question carries on at
          // * the server: a line under what had come in says so while the page reads the turn back, which then shows
          // * as any answer. An ApiError is the server's own answer (a refusal, or its `error` event), not a break.
          if (turnId && !(err instanceof ApiError)) {
            yield {
              content: liveParts(steps, text),
              metadata: { custom: { ...lookupCounts(steps.map((s) => s?.done)), connectionDropped: true } },
            }
            const id = turnId
            const turn = await waitForTurn((signal) => getAnalystTurn(siteId, id, signal), askedAt + RECOVERY_LIMIT_MS, abortSignal)
            if (abortSignal.aborted) throw stoppedError()
            // * The team's count and the past chats moved at the server whatever came of it.
            void setUsage()
            void mutate(chatsKey(siteId))
            if (turn && turn.outcome !== 'error') {
              yield { content: turnParts(turn), metadata: turnMetadata(turn) }
              return
            }
            // * A turn kept as a failure was given back to the allowance, as the `error` event says.
            yield { content: [], metadata: { custom: { connectionDropped: false } } }
            throw new Error(turn ? COULD_NOT_ANSWER : CONNECTION_DROPPED)
          }
          // * A failed question shows only its sentence, never lookups for an answer that did not come.
          yield { content: [] }
          throw new Error(analystErrorMessage(err))
        }
      },
    }),
    [siteId, keepUsage, setUsage, mutate],
  )
  const options = useMemo(() => ({ initialMessages: chat ? chatMessages(chat) : undefined }), [chat])
  const runtime = useLocalRuntime(adapter, options)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadHorizon reach={reach} />
      <PageThread
        siteId={siteId}
        siteName={siteName}
        siteTimezone={siteTimezone}
        usage={usage ?? null}
        onOpenChat={onOpenChat}
      />
    </AssistantRuntimeProvider>
  )
}

/** The welcome's glow, behind the thread while it has no messages; once a conversation starts, the footer has its own. */
const ThreadHorizon: FC<{ reach: number }> = ({ reach }) => {
  const empty = useAuiState((s) => s.thread.messages.length === 0)
  return empty ? <WelcomeHorizon reach={reach} /> : null
}

const PageThread: FC<Omit<ThreadProps, 'chat' | 'reach'> & { usage: AnalystUsage | null }> = ({
  siteId,
  siteName,
  siteTimezone,
  usage,
  onOpenChat,
}) => {
  const empty = useAuiState((s) => s.thread.messages.length === 0)
  const running = useAuiState((s) => s.thread.isRunning)
  return (
    // * Above the welcome's glow, which is drawn behind it in the page's root.
    <ThreadPrimitive.Root className="relative z-[1] flex h-full flex-col">
      {/* * The welcome opens at its top: on a phone it is taller than the screen, and the viewport's scroll to the
          * bottom hid the mark. Once there is a conversation, new answers scroll into view as usual, and a reopened
          * chat opens at its latest answer. */}
      <ThreadPrimitive.Viewport
        data-analyst="viewport"
        autoScroll={!empty}
        scrollToBottomOnInitialize={!empty}
        className="flex h-full flex-col overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]"
      >
        {/* * The welcome is centred with auto margins (its own mt-auto, the footer's mb-auto), never justify-center:
            * on a phone it is taller than the screen, and centring overflow pushed its top out of reach. Auto margins
            * fall to zero there, so it starts at the top and scrolls. */}
        <div className="mx-auto flex w-full max-w-[46rem] flex-1 flex-col px-6">
          <AuiIf condition={(s) => s.thread.messages.length === 0}>
            <PageWelcome siteName={siteName} />
          </AuiIf>
          <div className="flex flex-col gap-10 pb-10 pt-14 empty:hidden">
            <ThreadPrimitive.Messages>{() => <PageMessage />}</ThreadPrimitive.Messages>
          </div>
          <ThreadPrimitive.ViewportFooter
            data-analyst="footer"
            className={cn(
              'flex flex-col gap-4 pb-8',
              empty
                ? 'mb-auto'
                : // * Solid behind the question box, with the fade ABOVE it: a gradient behind it let the answer's last
                  // * line show through (seen in the options round). The horizon draws over the band.
                  "sticky bottom-0 mt-auto bg-neutral-950 pt-4 before:pointer-events-none before:absolute before:inset-x-0 before:-top-10 before:h-10 before:bg-gradient-to-t before:from-neutral-950 before:to-transparent before:content-['']",
            )}
          >
            {!empty && <FooterHorizon lit={running} />}
            <PageComposer siteName={siteName} usage={usage} />
            <AuiIf condition={(s) => s.thread.messages.length === 0}>
              <PageSuggestions />
              <PageRecent siteId={siteId} siteTimezone={siteTimezone} onOpen={onOpenChat} />
            </AuiIf>
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}

// * The mark: the four-point star in the active menu row's own device (its orange tint and orange icon).
const AnalystMark: FC<{ size: 'sm' | 'lg' }> = ({ size }) => (
  <span
    className={cn(
      'flex shrink-0 items-center justify-center border border-brand-orange/25 bg-brand-orange/10 text-brand-orange',
      size === 'lg' ? 'h-14 w-14' : 'h-8 w-8',
    )}
  >
    <StarFour className={size === 'lg' ? 'h-7 w-7' : 'h-[18px] w-[18px]'} />
  </span>
)

// * pt-16 below sm clears the New chat button, which sits over the top of a phone's narrow column.
const PageWelcome: FC<{ siteName: string }> = ({ siteName }) => (
  <div data-analyst="welcome" className="mb-9 mt-auto flex flex-col items-center gap-6 pt-16 text-center sm:pt-0">
    <AnalystMark size="lg" />
    <div className="flex flex-col gap-2.5">
      <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-white">
        What would you like to know about {siteName}?
      </h1>
      <p className="text-[15px] text-neutral-400">Answers come from this site&apos;s Pulse data, with the figures behind each one.</p>
    </div>
  </div>
)

const PageSuggestions: FC = () => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    {SUGGESTIONS.map(({ title, label, prompt, icon: Icon }) => (
      <ThreadPrimitive.Suggestion
        key={prompt}
        prompt={prompt}
        send
        className={cn(
          'group flex items-start gap-3.5 border border-white/[0.07] p-4 text-left transition-colors hover:border-white/[0.16]',
          RAISED,
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/[0.08] bg-neutral-900 text-neutral-400 transition-colors group-hover:text-brand-orange">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium text-neutral-100">{title}</span>
          <span className="text-sm text-neutral-500">{label}</span>
        </span>
        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-neutral-700 transition-colors group-hover:text-neutral-300" />
      </ThreadPrimitive.Suggestion>
    ))}
  </div>
)

// * Past chats (round 6, pick 3): the newest under the suggestions, all of them a click away. Picking one reopens it,
// * and a question asked there carries on that chat. Times follow Account › Profile › Show times in.
const PageRecent: FC<{ siteId: string; siteTimezone: string | null; onOpen: (chat: AnalystConversation) => void }> = ({
  siteId,
  siteTimezone,
  onOpen,
}) => {
  const { data, error, mutate } = useSWR(chatsKey(siteId), () => getAnalystConversations(siteId), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  const { zone } = useDisplayZone(siteTimezone)
  const [all, setAll] = useState(false)
  const rows = useMemo(() => recentChats(data?.conversations ?? []), [data])

  if (error && !data) {
    return (
      <p className="flex flex-wrap items-baseline gap-x-3 px-2.5 text-[13px] text-neutral-500">
        Your recent chats did not load.
        <button type="button" onClick={() => void mutate()} className="text-neutral-300 transition-colors hover:text-white">
          Try again
        </button>
      </p>
    )
  }
  if (!rows.length) return null
  const shown = all ? rows : rows.slice(0, RECENT_SHOWN)
  return (
    <section aria-labelledby="analyst-recent" className="mt-2 flex flex-col">
      <div className="flex items-baseline justify-between gap-4 px-2.5 pb-1.5">
        <h2 id="analyst-recent" className="text-[13px] text-neutral-400">
          Recent chats
        </h2>
        {rows.length > RECENT_SHOWN && (
          <button
            type="button"
            onClick={() => setAll((a) => !a)}
            aria-expanded={all}
            className="text-[13px] text-neutral-500 transition-colors hover:text-white"
          >
            {all ? 'Show fewer' : `Show all ${rows.length}`}
          </button>
        )}
      </div>
      <ul className="flex flex-col border-t border-white/[0.06]">
        {shown.map(({ chat, title, lastAt }) => (
          <li key={chat.id} className="border-b border-white/[0.06]">
            <button
              type="button"
              onClick={() => onOpen(chat)}
              title={title}
              className="group flex w-full items-center gap-3 p-2.5 text-left text-sm text-neutral-400 transition-colors hover:bg-white/[0.03] hover:text-white"
            >
              <ClockCounterClockwise className="h-[15px] w-[15px] shrink-0 text-neutral-600 transition-colors group-hover:text-brand-orange" />
              <span className="min-w-0 flex-1 truncate">{title}</span>
              <span className="shrink-0 text-xs tabular-nums text-neutral-500">{chatWhenLabel(lastAt, zone)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

// * The question as the server stores it (trimmed, as a reopened chat shows it), so a newline typed after the question
// * adds no blank line to its bubble. pre-line as assistant-ui's own text part has it.
const QuestionText: TextMessagePartComponent = ({ text }) => <p className="whitespace-pre-line">{text.trim()}</p>

const PageMessage: FC = () => {
  const role = useAuiState((s) => s.message.role)
  if (role === 'user') {
    return (
      <MessagePrimitive.Root className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap border border-white/[0.08] bg-neutral-800/70 px-4 py-2.5 text-[15px] leading-6 text-neutral-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <MessagePrimitive.Parts components={{ Text: QuestionText }} />
        </div>
      </MessagePrimitive.Root>
    )
  }
  return (
    <MessagePrimitive.Root className="relative flex gap-4">
      <AnalystMark size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
        <MessagePrimitive.GroupedParts groupBy={groupBy} indicator="empty">
          {({ part, children }) => {
            switch (part.type) {
              case 'group-tool':
                return <PageChecks count={'indices' in part ? part.indices.length : 0}>{children}</PageChecks>
              case 'tool-call':
                return <PageCheck part={part as LookupPart} />
              case 'text':
                return <PageMarkdown />
              case 'indicator':
                return (
                  <span className="inline-flex items-center gap-2 text-[15px] text-neutral-400">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-orange" />
                    Reading this site&apos;s figures
                  </span>
                )
              default:
                return null
            }
          }}
        </MessagePrimitive.GroupedParts>
        <PageConnectionDropped />
        <MessagePrimitive.Error>
          <ErrorPrimitive.Root className="flex items-start gap-2.5 border border-white/[0.08] px-4 py-3 text-sm text-neutral-300">
            <Warning className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
            <ErrorPrimitive.Message />
          </ErrorPrimitive.Root>
        </MessagePrimitive.Error>
        {/* A question that failed or was stopped has no answer to copy. The newest answer keeps its bar in the
            * flow; on an earlier one it shows on hover and floats (data-floating) in the gap under the answer, so
            * showing it never changes the thread's height. In the flow, every answer the pointer crossed grew and
            * shrank by the bar, and the thread, pinned to its newest answer, jumped under the pointer (reported
            * 11-11-2026). Its box starts at the answer's bottom edge (padding, not margin), so the pointer can move
            * down onto it without leaving the answer. */}
        <AuiIf condition={(s) => s.message.status?.type !== 'incomplete'}>
          <ActionBarPrimitive.Root
            hideWhenRunning
            autohide="not-last"
            autohideFloat="always"
            className="-ml-2 mt-2 flex items-center gap-0.5 text-neutral-500 data-[floating]:absolute data-[floating]:left-12 data-[floating]:top-full data-[floating]:mt-0 data-[floating]:pt-3"
          >
            <ActionBarPrimitive.Copy asChild>
              <button
                type="button"
                aria-label="Copy the answer"
                className="inline-flex h-8 w-8 items-center justify-center transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <AuiIf condition={(s) => s.message.isCopied}>
                  <Check className="h-4 w-4" />
                </AuiIf>
                <AuiIf condition={(s) => !s.message.isCopied}>
                  <Copy className="h-4 w-4" />
                </AuiIf>
              </button>
            </ActionBarPrimitive.Copy>
          </ActionBarPrimitive.Root>
        </AuiIf>
        <PageAskNext />
      </div>
    </MessagePrimitive.Root>
  )
}

// * The stream broke after Analyst started and the page reads the answer back (round 8, pick 1B): a line under what had
// * come in, with the pulsing dot the page shows before its first lookup, until the answer or the error replaces it.
const PageConnectionDropped: FC = () => {
  const dropped = useAuiState(
    (s) => s.message.status?.type === 'running' && s.message.metadata?.custom?.connectionDropped === true,
  )
  if (!dropped) return null
  return (
    <div data-analyst="connection-dropped" role="status" className="pt-3">
      <span className="inline-flex items-center gap-2 text-[15px] text-neutral-400">
        <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-orange" />
        The connection dropped. Analyst is still writing the answer.
      </span>
    </div>
  )
}

// * Ask next (round 7, pick B): the questions written for this answer, in the recent chats' rows, under the newest
// * answer once it is in. Picking one asks it in this conversation; asking anything moves the list to the next answer.
// * The thread takes the question itself: inside a message, assistant-ui's suggestion primitive reaches the message's
// * own edit box instead of the question box ("Composer is not available"), and a draft in the box stays as it is.
const PageAskNext: FC = () => {
  const aui = useAui()
  const questions = useAuiState((s) =>
    s.message.isLast && !s.thread.isRunning ? followUpsOf(s.message.metadata) : followUpsOf(undefined),
  )
  if (!questions.length) return null
  const askNext = (question: string) => {
    const thread = aui.thread.getState()
    if (thread.isRunning || thread.isDisabled || thread.isSendDisabled) return
    aui.thread.append({ content: [{ type: 'text', text: question }] })
  }
  return (
    <section aria-labelledby="analyst-ask-next" data-analyst="ask-next" className="mt-5 flex flex-col">
      <h2 id="analyst-ask-next" className="px-2.5 pb-1.5 text-[13px] text-neutral-400">
        Ask next
      </h2>
      <ul className="flex flex-col border-t border-white/[0.06]">
        {questions.map((question) => (
          <li key={question} className="border-b border-white/[0.06]">
            <button
              type="button"
              onClick={() => askNext(question)}
              className="group flex w-full items-center gap-3 p-2.5 text-left text-sm text-neutral-400 transition-colors hover:bg-white/[0.03] hover:text-white"
            >
              <TrendUp className="h-[15px] w-[15px] shrink-0 text-neutral-600 transition-colors group-hover:text-brand-orange" />
              <span className="min-w-0 flex-1">{question}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** A lookup as the message holds it: what the model asked for, and its step once it has answered. */
type LookupPart = { toolName: string; args: Record<string, unknown>; result?: AnalystStep }

/** True while Analyst looks things up and has not written a word: the lookups then show as a list (round 6, S2). */
function useLookingUp(): boolean {
  return useAuiState(
    (s) => s.message.status?.type === 'running' && !s.message.content.some((p) => p.type === 'text' && p.text.length > 0),
  )
}

const PageChecks: FC<{ count: number; children: ReactNode }> = ({ count, children }) => {
  const [open, setOpen] = useState(false)
  const allDone = useAuiState((s) => s.message.content.every((p) => p.type !== 'tool-call' || p.result !== undefined))
  // * Lookups skipped at the question's limit are not in the list (round 8, pick B): one line under it counts them.
  const skipped = useAuiState((s) => skippedLine(s.message.metadata))
  // * Each lookup shows as it starts and ticks off as it ends; at the first word the list folds into the button.
  if (useLookingUp()) {
    return (
      <>
        <div className={cn('flex flex-col divide-y divide-white/[0.06] border border-white/[0.08]', skipped ? 'mb-2' : 'mb-5', RAISED)}>
          {children}
          {allDone && <PageWorking />}
        </div>
        {skipped && <p className="mb-5 text-sm text-neutral-500">{skipped}</p>}
      </>
    )
  }
  return (
    <div className="mb-5 flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-2 self-start border border-white/[0.08] py-1.5 pl-2.5 pr-3 text-xs text-neutral-400 transition-colors hover:border-white/[0.16] hover:text-white',
          RAISED,
        )}
      >
        <CheckCircle className="h-3.5 w-3.5 text-neutral-500" />
        Figures behind this answer
        <span className="tabular-nums text-neutral-600">{count}</span>
        <CaretDown className={cn('h-3 w-3 transition-transform duration-fast', open ? 'rotate-180' : 'rotate-0')} />
      </button>
      {open && (
        <div className={cn('mt-3 flex flex-col divide-y divide-white/[0.06] border border-white/[0.08]', RAISED)}>{children}</div>
      )}
      {open && skipped && <p className="mt-2 text-sm text-neutral-500">{skipped}</p>}
    </div>
  )
}

// * While Analyst works out what the figures say after its lookups (round 7, pick B): a last row with the running
// * spinner, so the list reads as work still going. Measured 11-11-2026: questions of 33 to 36 s, with nothing on the
// * page after the last tick while the model thought.
const PageWorking: FC = () => (
  <div data-analyst="working" className="flex items-center gap-2.5 px-4 py-[11px] text-sm text-neutral-400">
    <span
      aria-hidden="true"
      className="h-[13px] w-[13px] shrink-0 animate-spin rounded-full border-[1.5px] border-white/[0.18] border-t-brand-orange motion-reduce:animate-none"
    />
    Working out what the figures say
  </div>
)

const PageCheck: FC<{ part: LookupPart }> = ({ part }) => {
  const lookingUp = useLookingUp()
  const step = part.result
  if (lookingUp) {
    const done = step ? finishedLookup(step) : null
    return (
      <div className={cn('flex items-center gap-2.5 px-4 py-[11px] text-sm', done ? 'text-neutral-400' : 'text-neutral-200')}>
        {!done ? (
          <span
            aria-hidden="true"
            className="h-[13px] w-[13px] shrink-0 animate-spin rounded-full border-[1.5px] border-white/[0.18] border-t-brand-orange motion-reduce:animate-none"
          />
        ) : done.failed ? (
          <Warning className="h-[15px] w-[15px] shrink-0" />
        ) : (
          <Check className="h-[15px] w-[15px] shrink-0 text-neutral-500" />
        )}
        {done ? done.text : runningLookup(part.toolName, part.args)}
      </div>
    )
  }
  if (!step) return null
  const view = describeStep(step)
  if (view.kind === 'line') {
    return (
      <div className={cn('flex items-center gap-2.5 px-5 py-3 text-sm', view.failed ? 'text-neutral-500' : 'text-neutral-300')}>
        {view.failed ? <Warning className="h-4 w-4 shrink-0" /> : <Check className="h-4 w-4 shrink-0 text-neutral-500" />}
        {view.text}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5 px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <span className="text-sm font-medium text-neutral-200">{view.title}</span>
        {view.range && <span className="text-xs text-neutral-500">{view.range}</span>}
      </div>
      <div className="flex flex-col">
        {view.rows.map((r) => (
          <div key={r.name} className="flex items-center gap-2.5 py-1 text-sm">
            {r.logo && (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center [&_img]:h-4 [&_img]:w-4 [&_svg]:h-4 [&_svg]:w-4">
                {getReferrerIcon(r.name)}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-neutral-300">{r.name}</span>
            <span className="tabular-nums text-neutral-500">{r.before}</span>
            <ArrowRight className="h-3 w-3 shrink-0 text-neutral-600" />
            <span className="min-w-[1.75rem] text-right tabular-nums text-neutral-100">{r.now}</span>
            <span className="flex w-14 justify-end">
              <RailDelta change={pctChange(r.now, r.before)} />
            </span>
          </div>
        ))}
        {view.more > 0 && <span className="pt-1 text-xs text-neutral-600">and {view.more} more</span>}
      </div>
    </div>
  )
}

// * Each element takes only what it draws; a link opens in a new tab, so following one never loses the conversation.
// * While the words come, a caret follows the last one (an-md in styles/globals.css, off once the answer is in).
const PageMarkdown: FC = () => (
  <MarkdownTextPrimitive
    className="an-md flex flex-col gap-4"
    components={{
      p: ({ children }) => <p className="text-[15px] leading-7 text-neutral-200">{children}</p>,
      strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
      ul: ({ children }) => <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-7 text-neutral-200">{children}</ul>,
      ol: ({ children, start }) => (
        <ol start={start} className="flex list-decimal flex-col gap-1.5 pl-5 text-[15px] leading-7 text-neutral-200">
          {children}
        </ol>
      ),
      a: ({ children, href }) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white underline decoration-neutral-600 underline-offset-2 hover:decoration-white"
        >
          {children}
        </a>
      ),
    }}
  />
)

// * The question box is the page's one elevated object: lit from the top, a deep soft shadow under it, a hairline
// * between the question and its toolbar, and the send button the only orange that is not the mark. It sits above
// * the horizon, which measures where the box is to put the rim over it.
const PageComposer: FC<{ siteName: string; usage: AnalystUsage | null }> = ({ siteName, usage }) => (
  <ComposerPrimitive.Root
    data-analyst="composer"
    className="relative z-[1] flex flex-col border border-white/[0.12] bg-neutral-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_24px_60px_-24px_rgba(0,0,0,0.9)] transition-colors focus-within:border-white/[0.24]"
  >
    <ComposerPrimitive.Input
      placeholder={`Ask about ${siteName}`}
      rows={1}
      maxLength={1000}
      aria-label="Your question"
      className="max-h-48 min-h-[60px] w-full resize-none bg-transparent px-4 pb-2 pt-4 text-[15px] leading-6 text-white outline-none placeholder:text-neutral-500"
    />
    <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] py-2 pl-4 pr-2">
      <span className="text-xs tabular-nums text-neutral-500">
        {usage ? `${usage.used} of ${usage.limit} questions this month` : ''}
      </span>
      <AuiIf condition={(s) => !s.thread.isRunning}>
        <ComposerPrimitive.Send asChild>
          <button
            type="button"
            aria-label="Ask"
            className="inline-flex h-9 w-9 items-center justify-center bg-brand-orange text-white transition-colors hover:bg-brand-orange-button-hover disabled:bg-white/[0.06] disabled:text-neutral-500"
          >
            <ArrowUp className="h-4 w-4" weight="bold" />
          </button>
        </ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel asChild>
          <button
            type="button"
            aria-label="Stop"
            className="inline-flex h-9 w-9 items-center justify-center bg-white/[0.08] text-white transition-colors hover:bg-white/[0.14]"
          >
            <Stop className="h-4 w-4" weight="fill" />
          </button>
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </div>
  </ComposerPrimitive.Root>
)
