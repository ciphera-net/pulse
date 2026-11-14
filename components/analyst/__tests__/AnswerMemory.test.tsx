// Analyst's memories under an answer (picked 14-11-2026: Q1 and S2), against assistant-ui's real local runtime: a card
// asks once to turn memories on and keep what the person said, the yes keeps it and names it, Not now holds the ask
// back, a site that has decided is never asked, and a kept memory is named word for word with a way to the list. The
// save is no lookup: it is neither listed nor counted with the figures. Only the API functions, the site, the display
// zone and Facet's toast are stubbed.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { ApiError } from '@/lib/api/client'
import type { AnalystAnswer, AnalystMemories, AnalystStep, AnalystStreamEvent, AnalystUsage } from '@/lib/api/analyst'

const askAnalyst = vi.hoisted(() => vi.fn())
const askAnalystStream = vi.hoisted(() => vi.fn())
const getAnalystUsage = vi.hoisted(() => vi.fn())
const getAnalystConversations = vi.hoisted(() => vi.fn())
const getAnalystMemories = vi.hoisted(() => vi.fn())
const acceptAnalystMemory = vi.hoisted(() => vi.fn())
const snoozeAnalystMemories = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/analyst', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/analyst')>()),
  askAnalyst,
  askAnalystStream,
  getAnalystUsage,
  getAnalystConversations,
  getAnalystMemories,
  acceptAnalystMemory,
  snoozeAnalystMemories,
}))
const toastError = vi.hoisted(() => vi.fn())
vi.mock('@ciphera-net/facet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ciphera-net/facet')>()),
  toast: { error: toastError, success: vi.fn() },
}))
vi.mock('@/lib/swr/dashboard', () => ({ useSite: () => ({ data: { id: 's1', domain: 'example.com', timezone: 'UTC' } }) }))
vi.mock('@/lib/hooks/useDisplayZone', () => ({ useDisplayZone: () => ({ mode: 'local', zone: 'UTC', label: 'UTC' }) }))
vi.mock('@/lib/utils/icons', () => ({ getReferrerIcon: () => null }))
vi.mock('@/components/funnels/FunnelRail', () => ({
  RailDelta: ({ change }: { change: number | null }) => <span data-testid="delta">{String(change)}</span>,
}))

import AnalystPage from '../AnalystPage'

beforeAll(() => {
  class NoResize {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver ??= NoResize as unknown as typeof ResizeObserver
  Element.prototype.scrollTo ??= function scrollTo() {}
})

const MEMORY = 'Shared Link is our newsletter.'
const usage = (used: number): AnalystUsage => ({ used, limit: 50, resets_at: '2026-12-01T00:00:00Z' })
const memories = (over: Partial<AnalystMemories> = {}): AnalystMemories => ({
  memories: [], max_memories: 20, max_length: 280, enabled: null, offer_snoozed_until: null, ...over,
})

/** An answer whose question looked up the totals and called save_memory, which came to `result`. */
const answerWith = (result: Record<string, unknown>): AnalystAnswer => {
  const steps: AnalystStep[] = [
    { tool: 'get_stats', args: {}, ms: 80, result: { range: { from: '2026-11-04', to: '2026-11-10' }, visitors: 42 } },
    { tool: 'save_memory', args: { memory: MEMORY }, ms: 9, result: { memory: MEMORY, ...result } },
  ]
  return {
    conversation_id: 'c1',
    saved: true,
    usage: usage(4),
    turn: {
      id: 'turn-4', conversation_id: 'c1', site_id: 's1', question: 'q', answer: 'Shared Link sent 42 visitors last week.',
      outcome: 'answered', created_at: '2026-11-14T16:00:00Z', steps,
    },
  }
}

const mount = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <main id="main-content">
        <AnalystPage siteId="s1" />
      </main>
    </SWRConfig>,
  )

const ask = async (text: string) => {
  fireEvent.change(await screen.findByLabelText('Your question'), { target: { value: text } })
  fireEvent.click(screen.getByLabelText('Ask'))
  await screen.findByText('Shared Link sent 42 visitors last week.')
}

beforeEach(() => {
  askAnalyst.mockReset()
  askAnalystStream.mockReset()
  askAnalystStream.mockImplementation(async function* (
    siteId: string,
    question: string,
    conversationId: string | null,
    signal?: AbortSignal,
  ): AsyncGenerator<AnalystStreamEvent> {
    yield { type: 'done', answer: await askAnalyst(siteId, question, conversationId, signal) }
  })
  getAnalystUsage.mockReset().mockResolvedValue(usage(3))
  getAnalystConversations.mockReset().mockResolvedValue({ conversations: [], kept_days: 30 })
  getAnalystMemories.mockReset().mockResolvedValue(memories())
  acceptAnalystMemory.mockReset()
  snoozeAnalystMemories.mockReset().mockResolvedValue(undefined)
  toastError.mockReset()
})
afterEach(() => cleanup())

describe('memories under an answer', () => {
  it('asks once to keep what the person said, and the yes keeps it and names it with a way to the list', async () => {
    askAnalyst.mockResolvedValue(answerWith({ offered: true }))
    acceptAnalystMemory.mockResolvedValue({
      memory: { id: 'm1', site_id: 's1', body: MEMORY, created_at: '2026-11-14T16:00:00Z', updated_at: '2026-11-14T16:00:00Z' },
      enabled: true,
    })
    mount()
    await ask('Shared Link is our newsletter. How many visitors did it send last week?')

    expect(await screen.findByText('Remember this for example.com?')).toBeInTheDocument()
    expect(screen.getByText(MEMORY)).toBeInTheDocument()
    // * The save is no lookup: the figures count the totals only.
    expect(screen.getByRole('button', { name: /Figures behind this answer/ }).textContent).toContain('1')

    fireEvent.click(screen.getByRole('button', { name: 'Turn on memories' }))
    await waitFor(() => expect(acceptAnalystMemory).toHaveBeenCalledWith('s1', MEMORY))
    expect(await screen.findByText(`Remembered: ${MEMORY}`)).toBeInTheDocument()
    expect(screen.queryByText('Remember this for example.com?')).toBeNull()
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute('href', '/settings/site/analyst?siteId=s1')
  })

  it('asks nothing while the answer streams, its save done or not, and asks once the answer is finished', async () => {
    let finish!: () => void
    const finished = new Promise<void>((resolve) => {
      finish = resolve
    })
    askAnalystStream.mockImplementation(async function* (): AsyncGenerator<AnalystStreamEvent> {
      yield { type: 'start', conversation_id: 'c1', turn_id: 'turn-4' }
      yield { type: 'step', index: 0, tool: 'save_memory', args: { memory: MEMORY } }
      yield { type: 'step_done', index: 0, ms: 9, error: '', result: { offered: true, memory: MEMORY } }
      yield { type: 'text', delta: 'Shared Link sent 42 visitors' }
      await finished
      yield { type: 'done', answer: answerWith({ offered: true }) }
    })
    mount()
    fireEvent.change(await screen.findByLabelText('Your question'), { target: { value: 'Shared Link is our newsletter. How many?' } })
    fireEvent.click(screen.getByLabelText('Ask'))
    expect(await screen.findByText(/Shared Link sent 42 visitors/)).toBeInTheDocument()
    expect(screen.queryByText('Remember this for example.com?')).toBeNull()
    expect(getAnalystMemories).not.toHaveBeenCalled()
    finish()
    expect(await screen.findByText('Remember this for example.com?')).toBeInTheDocument()
  })

  it('closes the card on Not now and holds the ask back', async () => {
    askAnalyst.mockResolvedValue(answerWith({ offered: true }))
    mount()
    await ask('Shared Link is our newsletter. How many visitors did it send last week?')
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }))
    await waitFor(() => expect(snoozeAnalystMemories).toHaveBeenCalledWith('s1'))
    await waitFor(() => expect(screen.queryByText('Remember this for example.com?')).toBeNull())
    expect(screen.queryByText(/Remembered:/)).toBeNull()
    expect(acceptAnalystMemory).not.toHaveBeenCalled()
  })

  it('never asks a site that has decided, or one a Not now still holds back', async () => {
    for (const state of [memories({ enabled: true }), memories({ enabled: false }), memories({ offer_snoozed_until: '2099-01-01T00:00:00Z' })]) {
      cleanup()
      getAnalystMemories.mockResolvedValue(state)
      askAnalyst.mockResolvedValue(answerWith({ offered: true }))
      mount()
      await ask('Shared Link is our newsletter. How many visitors did it send last week?')
      await waitFor(() => expect(getAnalystMemories).toHaveBeenCalled())
      expect(screen.queryByText('Remember this for example.com?')).toBeNull()
    }
  })

  it('names a memory Analyst kept, word for word, without reading the switch', async () => {
    askAnalyst.mockResolvedValue(answerWith({ saved: true, id: 'm1' }))
    mount()
    await ask('Shared Link is our newsletter. How many visitors did it send last week?')
    expect(await screen.findByText(`Remembered: ${MEMORY}`)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute('href', '/settings/site/analyst?siteId=s1')
    expect(getAnalystMemories).not.toHaveBeenCalled()
  })

  it('shows nothing for a memory the site keeps already', async () => {
    askAnalyst.mockResolvedValue(answerWith({ already_kept: true }))
    mount()
    await ask('Shared Link is our newsletter. How many visitors did it send last week?')
    expect(screen.queryByText(/Remembered:/)).toBeNull()
    expect(screen.queryByText('Remember this for example.com?')).toBeNull()
  })

  it('closes the card with the server words when the site is full, as memories are on all the same', async () => {
    askAnalyst.mockResolvedValue(answerWith({ offered: true }))
    const full = 'This site keeps 20 memories, the most Analyst keeps. Delete one to save another.'
    acceptAnalystMemory.mockRejectedValue(new ApiError(full, 409, { error: full, code: 'barry_memories_full', enabled: true }))
    mount()
    await ask('Shared Link is our newsletter. How many visitors did it send last week?')
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on memories' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(full))
    await waitFor(() => expect(screen.queryByText('Remember this for example.com?')).toBeNull())
    expect(screen.queryByText(/Remembered:/)).toBeNull()
  })

  it('keeps the card and says so when the yes fails', async () => {
    askAnalyst.mockResolvedValue(answerWith({ offered: true }))
    acceptAnalystMemory.mockRejectedValue(new Error('network'))
    mount()
    await ask('Shared Link is our newsletter. How many visitors did it send last week?')
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on memories' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Couldn't turn on memories. Try again."))
    expect(screen.getByText('Remember this for example.com?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn on memories' })).not.toBeDisabled()
  })
})
