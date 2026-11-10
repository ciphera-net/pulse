'use client'

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type FC, type ReactNode } from 'react'
import useSWR from 'swr'
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  groupPartByType,
  useAuiState,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react'
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown'
import {
  ArrowRight,
  ArrowUp,
  CaretDown,
  Check,
  CheckCircle,
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
import { askAnalyst, getAnalystUsage, type AnalystStep, type AnalystUsage } from '@/lib/api/analyst'
import { ApiError } from '@/lib/api/client'
import { useSite } from '@/lib/swr/dashboard'
import { cn } from '@/lib/utils'
import { getReferrerIcon } from '@/lib/utils/icons'
import { pctChange } from '@/lib/utils/pctChange'
import { describeStep } from './steps'
import { analystErrorMessage, turnParts } from './turn'

/**
 * Analyst: a page of its own for asking about one site (PUL-78, Pulse/docs/plans/09-11-2026-barry-ai-analyst-plan.md
 * §4). Built on assistant-ui's primitives (they own the composer, scrolling, copy and cancel); the look is Pulse's:
 * square corners, depth from light (a faint top-lit gradient and a 1px highlight, the content panel's own device), and
 * orange only in the mark, hovers and the send button.
 *
 * pulse-backend answers a question in one response with the whole turn, so the page runs assistant-ui's local runtime
 * with an adapter that returns that turn: every lookup as a tool call ("Figures behind this answer"), then the answer.
 */

const RAISED = 'bg-gradient-to-b from-white/[0.035] to-white/[0.01] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'

const SUGGESTIONS = [
  { title: 'Why did visitors change', label: 'this week?', prompt: 'Why did visitors change this week?', icon: TrendUp },
  { title: 'Where do visitors come from', label: 'this month?', prompt: 'Where do visitors come from this month?', icon: Compass },
  { title: 'Which pages are growing', label: 'compared with last month?', prompt: 'Which pages are growing compared with last month?', icon: Files },
  { title: 'How do phones compare', label: 'with desktops?', prompt: 'How do phones compare with desktops?', icon: DeviceMobile },
]

const groupBy = groupPartByType({ 'tool-call': ['group-tool'] })

export default function AnalystPage({ siteId }: { siteId: string }) {
  const { data: site } = useSite(siteId)
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  // * A new conversation is a new runtime: the key remounts the thread with nothing in it.
  const [threadKey, setThreadKey] = useState(0)

  // * The shell's <main> scrolls and gives a page no height of its own; a chat needs one, so its viewport scrolls and
  // * the question box stays at the bottom. The page fills <main> from where it starts down to main's bottom edge.
  useLayoutEffect(() => {
    const fit = () => {
      const main = document.getElementById('main-content')
      if (!main || !ref.current) return
      setHeight(Math.floor(main.getBoundingClientRect().bottom - ref.current.getBoundingClientRect().top))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  return (
    <div ref={ref} className="relative" style={{ height: height ?? undefined }}>
      <div className="absolute right-6 top-0 z-10">
        <button
          type="button"
          onClick={() => setThreadKey((k) => k + 1)}
          className={cn(
            'inline-flex h-9 items-center gap-2 border border-white/[0.08] px-3.5 text-sm text-neutral-300 transition-colors hover:border-white/[0.16] hover:text-white',
            RAISED,
          )}
        >
          <NotePencil className="h-4 w-4" />
          New chat
        </button>
      </div>
      {site && <AnalystThread key={threadKey} siteId={siteId} siteName={site.domain} />}
    </div>
  )
}

const AnalystThread: FC<{ siteId: string; siteName: string }> = ({ siteId, siteName }) => {
  const { data: usage, mutate: setUsage } = useSWR(['analyst-usage', siteId], () => getAnalystUsage(), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  const conversation = useRef<string | null>(null)
  const keepUsage = useCallback((u: AnalystUsage | undefined) => {
    if (u) void setUsage(u, { revalidate: false })
  }, [setUsage])

  const adapter = useMemo<ChatModelAdapter>(
    () => ({
      async run({ messages, abortSignal }) {
        const last = messages[messages.length - 1]
        const question =
          last?.role === 'user'
            ? last.content.map((p) => (p.type === 'text' ? p.text : '')).join('\n').trim()
            : ''
        try {
          const res = await askAnalyst(siteId, question, conversation.current, abortSignal)
          conversation.current = res.conversation_id
          keepUsage(res.usage)
          return { content: turnParts(res.turn) }
        } catch (err) {
          if (abortSignal.aborted) throw err
          if (err instanceof ApiError) keepUsage(err.data?.usage as AnalystUsage | undefined)
          throw new Error(analystErrorMessage(err))
        }
      },
    }),
    [siteId, keepUsage],
  )
  const runtime = useLocalRuntime(adapter)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <PageThread siteName={siteName} usage={usage ?? null} />
    </AssistantRuntimeProvider>
  )
}

const PageThread: FC<{ siteName: string; usage: AnalystUsage | null }> = ({ siteName, usage }) => {
  const empty = useAuiState((s) => s.thread.messages.length === 0)
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col">
      {/* * The welcome opens at its top: on a phone it is taller than the screen, and the viewport's scroll to the
          * bottom hid the mark. Once there is a conversation, new answers scroll into view as usual. */}
      <ThreadPrimitive.Viewport
        autoScroll={!empty}
        scrollToBottomOnInitialize={false}
        className="flex h-full flex-col overflow-y-auto [scrollbar-gutter:stable]"
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
            className={cn(
              'flex flex-col gap-4 pb-8',
              empty
                ? 'mb-auto'
                : // * Solid behind the question box, with the fade ABOVE it: a gradient behind it let the answer's last
                  // * line show through (seen in the options round).
                  "sticky bottom-0 mt-auto bg-neutral-950 pt-4 before:pointer-events-none before:absolute before:inset-x-0 before:-top-10 before:h-10 before:bg-gradient-to-t before:from-neutral-950 before:to-transparent before:content-['']",
            )}
          >
            <PageComposer siteName={siteName} usage={usage} />
            <AuiIf condition={(s) => s.thread.messages.length === 0}>
              <PageSuggestions />
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
  <div className="mb-9 mt-auto flex flex-col items-center gap-6 pt-16 text-center sm:pt-0">
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

const PageMessage: FC = () => {
  const role = useAuiState((s) => s.message.role)
  if (role === 'user') {
    return (
      <MessagePrimitive.Root className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap border border-white/[0.08] bg-neutral-800/70 px-4 py-2.5 text-[15px] leading-6 text-neutral-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <MessagePrimitive.Parts />
        </div>
      </MessagePrimitive.Root>
    )
  }
  return (
    <MessagePrimitive.Root className="flex gap-4">
      <AnalystMark size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
        <MessagePrimitive.GroupedParts groupBy={groupBy} indicator="empty">
          {({ part, children }) => {
            switch (part.type) {
              case 'group-tool':
                return <PageChecks count={'indices' in part ? part.indices.length : 0}>{children}</PageChecks>
              case 'tool-call':
                return <PageCheck step={(part as { result?: AnalystStep }).result} />
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
        <MessagePrimitive.Error>
          <ErrorPrimitive.Root className="flex items-start gap-2.5 border border-white/[0.08] px-4 py-3 text-sm text-neutral-300">
            <Warning className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
            <ErrorPrimitive.Message />
          </ErrorPrimitive.Root>
        </MessagePrimitive.Error>
        {/* A question that failed or was stopped has no answer to copy. */}
        <AuiIf condition={(s) => s.message.status?.type !== 'incomplete'}>
          <ActionBarPrimitive.Root hideWhenRunning autohide="not-last" className="-ml-2 mt-2 flex items-center gap-0.5 text-neutral-500">
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
      </div>
    </MessagePrimitive.Root>
  )
}

const PageChecks: FC<{ count: number; children: ReactNode }> = ({ count, children }) => {
  const [open, setOpen] = useState(false)
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
    </div>
  )
}

const PageCheck: FC<{ step?: AnalystStep }> = ({ step }) => {
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
const PageMarkdown: FC = () => (
  <MarkdownTextPrimitive
    className="flex flex-col gap-4"
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
// * between the question and its toolbar, and the send button the only orange that is not the mark.
const PageComposer: FC<{ siteName: string; usage: AnalystUsage | null }> = ({ siteName, usage }) => (
  <ComposerPrimitive.Root className="flex flex-col border border-white/[0.12] bg-neutral-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_24px_60px_-24px_rgba(0,0,0,0.9)] transition-colors focus-within:border-white/[0.24]">
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
