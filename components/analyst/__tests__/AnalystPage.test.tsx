// Analyst's page against assistant-ui's real local runtime (PUL-78): a question goes to pulse-backend through the
// adapter, the answer and its figures come back as one turn, a follow-up carries the conversation, New chat starts
// over, and a refused question shows a sentence a person can act on. Round 6: the recent chats under the suggestions
// reopen a chat to carry on, and the horizon sits behind the welcome, then in the footer, lit while Analyst answers.
// Round 7: a last row while Analyst works after its lookups, and "Ask next" under the newest answer.
// Round 8: an answer whose stream broke after it started is read back, with a line under the words while it is.
// Only the API functions, the site and the display zone are stubbed.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { ApiError } from '@/lib/api/client'
import type { AnalystAnswer, AnalystConversation, AnalystStreamEvent, AnalystUsage } from '@/lib/api/analyst'
import { RECOVERY_LIMIT_MS } from '../recover'

const askAnalyst = vi.hoisted(() => vi.fn())
const askAnalystStream = vi.hoisted(() => vi.fn())
const getAnalystUsage = vi.hoisted(() => vi.fn())
const getAnalystConversations = vi.hoisted(() => vi.fn())
const getAnalystTurn = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/analyst', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/analyst')>()),
  askAnalyst,
  askAnalystStream,
  getAnalystUsage,
  getAnalystConversations,
  getAnalystTurn,
}))
vi.mock('@/lib/swr/dashboard', () => ({ useSite: () => ({ data: { id: 's1', domain: 'example.com', timezone: 'UTC' } }) }))
vi.mock('@/lib/hooks/useDisplayZone', () => ({ useDisplayZone: () => ({ mode: 'local', zone: 'UTC', label: 'UTC' }) }))
vi.mock('@/lib/utils/icons', () => ({ getReferrerIcon: () => null }))
vi.mock('@/components/funnels/FunnelRail', () => ({
  RailDelta: ({ change }: { change: number | null }) => <span data-testid="delta">{String(change)}</span>,
}))

import AnalystPage from '../AnalystPage'

// jsdom has no layout: assistant-ui's viewport watches its size and scrolls to the newest message.
beforeAll(() => {
  class NoResize {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver ??= NoResize as unknown as typeof ResizeObserver
  Element.prototype.scrollTo ??= function scrollTo() {}
})

const usage = (used: number): AnalystUsage => ({ used, limit: 50, resets_at: '2026-12-01T00:00:00Z' })

const answer = (conversationId: string, text: string, used: number): AnalystAnswer => ({
  conversation_id: conversationId,
  saved: true,
  usage: usage(used),
  turn: {
    id: `turn-${used}`,
    conversation_id: conversationId,
    site_id: 's1',
    question: 'q',
    answer: text,
    outcome: 'answered',
    created_at: '2026-11-10T21:00:00Z',
    steps: [
      {
        tool: 'compare_periods',
        args: { dimension: 'referrer' },
        ms: 210,
        result: {
          current: { range: { from: '2026-11-04', to: '2026-11-10' }, visitors: 56 },
          previous: { range: { from: '2026-10-28', to: '2026-11-03' }, visitors: 48 },
          dimension: 'referrer',
          rows: [{ value: 'google.com', source: '', current_visitors: 13, previous_visitors: 5 }],
        },
      },
      { tool: 'get_stats', args: {}, ms: 80, result: { range: { from: '2026-11-04', to: '2026-11-10' }, visitors: 56 } },
    ],
  },
})

const mount = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <main id="main-content">
        <AnalystPage siteId="s1" />
      </main>
    </SWRConfig>,
  )

const ask = (text: string) => {
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: text } })
  fireEvent.click(screen.getByLabelText('Ask'))
}

/** A past chat of one turn, asked `minutesAgo` minutes ago. */
const chat = (id: string, question: string, text: string, minutesAgo: number): AnalystConversation => {
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString()
  return {
    id,
    started_at: at,
    turns: [
      { id: `${id}-t1`, conversation_id: id, site_id: 's1', question, answer: text, outcome: 'answered', steps: [], created_at: at },
    ],
  }
}
const chats = (...conversations: AnalystConversation[]) => ({ conversations, kept_days: 30 })

/** The horizon in the footer, if there is one. */
const footerHorizon = (container: HTMLElement) =>
  container.querySelector('[data-analyst="footer"] [data-analyst="horizon"]')

/** A gate the test opens step by step, so a streamed answer can be looked at between its events. */
function gate() {
  let credits = 0
  const waiting: Array<() => void> = []
  return {
    wait: (signal?: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')))
        if (credits > 0) {
          credits--
          resolve()
        } else waiting.push(resolve)
      }),
    open: () => {
      const next = waiting.shift()
      if (next) next()
      else credits++
    },
  }
}

beforeEach(() => {
  askAnalyst.mockReset()
  askAnalystStream.mockReset()
  // * By default the stream is one done event with whatever askAnalyst answers, so every test written for whole
  // * answers still drives the page through askAnalyst.
  askAnalystStream.mockImplementation(async function* (
    siteId: string,
    question: string,
    conversationId: string | null,
    signal?: AbortSignal,
  ): AsyncGenerator<AnalystStreamEvent> {
    yield { type: 'done', answer: await askAnalyst(siteId, question, conversationId, signal) }
  })
  getAnalystUsage.mockReset()
  getAnalystUsage.mockResolvedValue(usage(3))
  getAnalystConversations.mockReset()
  getAnalystConversations.mockResolvedValue(chats())
  getAnalystTurn.mockReset()
  getAnalystTurn.mockResolvedValue(null)
})
afterEach(() => cleanup())

describe('the Analyst page', () => {
  it("welcomes with the site's name, the team's questions this month and four suggestions", async () => {
    mount()
    expect(await screen.findByText('What would you like to know about example.com?')).toBeInTheDocument()
    expect(await screen.findByText('3 of 50 questions this month')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ask about example.com')).toBeInTheDocument()
    expect(screen.getByText('Why did visitors change')).toBeInTheDocument()
    expect(screen.getByText('How do phones compare')).toBeInTheDocument()
  })

  it('asks a suggestion, then shows the answer, the figures behind it and the new count', async () => {
    askAnalyst.mockResolvedValue(answer('c1', 'Visitors rose from 48 to 56, mostly from google.com.', 4))
    mount()
    fireEvent.click(await screen.findByText('Why did visitors change'))

    expect(await screen.findByText('Visitors rose from 48 to 56, mostly from google.com.')).toBeInTheDocument()
    expect(askAnalyst).toHaveBeenCalledWith('s1', 'Why did visitors change this week?', null, expect.any(AbortSignal))
    expect(await screen.findByText('4 of 50 questions this month')).toBeInTheDocument()
    expect(screen.queryByText('What would you like to know about example.com?')).toBeNull()
    expect(screen.getByLabelText('Copy the answer')).toBeInTheDocument()

    // The figures are folded until asked for: two lookups, a comparison of sources and the totals.
    const figures = screen.getByRole('button', { name: /Figures behind this answer/ })
    expect(figures.textContent).toContain('2')
    expect(screen.queryByText('Sources')).toBeNull()
    fireEvent.click(figures)
    expect(screen.getByText('Sources')).toBeInTheDocument()
    expect(screen.getByText('4 to 10 November against 28 October to 3 November')).toBeInTheDocument()
    expect(screen.getByText('google.com')).toBeInTheDocument()
    // * The totals are drawn as the comparison is (the figures round, pick A): a title, its dates, a row a figure.
    expect(screen.getByText('Totals')).toBeInTheDocument()
    expect(screen.getByText('4 to 10 November')).toBeInTheDocument()
    expect(screen.getByText('Visitors').parentElement?.textContent).toContain('56')
    // * An answer with no follow-up questions offers none.
    expect(screen.queryByRole('heading', { name: 'Ask next' })).toBeNull()
  })

  it("draws a lookup's figures as a comparison is drawn: a block a funnel, and speed with its poor figure marked", async () => {
    const turn = answer('c9', 'Few visitors reach the Pulse page.', 4)
    turn.turn.steps = [
      {
        tool: 'get_funnels',
        args: { period: '30d' },
        ms: 90,
        result: {
          range: { from: '2026-10-14', to: '2026-11-12' },
          funnels: [
            {
              name: 'Pulse Sign Up',
              steps: [
                { name: '/', match: 'page /', visitors: 158, drop_off: null },
                { name: '/products/pulse', match: 'page /products/pulse', visitors: 4, drop_off: 97.5 },
              ],
            },
          ],
        },
      },
      {
        tool: 'get_performance',
        args: {},
        ms: 70,
        result: {
          page: 'https://example.com/',
          checks: [{ device: 'mobile', checked_on: '2026-11-11', status: 'ok', performance_score: 78, largest_contentful_paint_ms: 4594, total_blocking_time_ms: 224 }],
        },
      },
    ]
    askAnalyst.mockResolvedValue(turn)
    mount()
    fireEvent.click(await screen.findByText('Why did visitors change'))
    expect(await screen.findByText('Few visitors reach the Pulse page.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Figures behind this answer/ }))
    expect(document.querySelectorAll('[data-analyst="figures"]')).toHaveLength(2)
    expect(screen.getByText('Pulse Sign Up funnel')).toBeInTheDocument()
    expect(screen.getByText('14 October to 12 November')).toBeInTheDocument()
    expect(screen.getByText('97.5% dropped off')).toBeInTheDocument()
    expect(screen.getByText('Homepage speed on mobile')).toBeInTheDocument()
    // * The poor figure carries the orange dot beside its word; a figure that needs work carries neither.
    const lcp = screen.getByText('Largest Contentful Paint').parentElement as HTMLElement
    expect(lcp.textContent).toContain('4.6s')
    expect(lcp.textContent).toContain('poor')
    expect(lcp.querySelector('.bg-brand-orange')).not.toBeNull()
    const tbt = screen.getByText('Total Blocking Time').parentElement as HTMLElement
    expect(tbt.textContent).toContain('224ms')
    expect(tbt.querySelector('.bg-brand-orange')).toBeNull()
  })

  it('carries the conversation into a follow-up, and New chat starts a new one', async () => {
    askAnalyst
      .mockResolvedValueOnce(answer('c1', 'First answer.', 4))
      .mockResolvedValueOnce(answer('c1', 'Second answer.', 5))
      .mockResolvedValueOnce(answer('c2', 'Third answer.', 6))
    mount()
    await screen.findByText('3 of 50 questions this month')

    ask('Where do visitors come from?')
    await screen.findByText('First answer.')
    ask('And last month?')
    await screen.findByText('Second answer.')
    expect(askAnalyst.mock.calls[0].slice(1, 3)).toEqual(['Where do visitors come from?', null])
    expect(askAnalyst.mock.calls[1].slice(1, 3)).toEqual(['And last month?', 'c1'])

    fireEvent.click(screen.getByRole('button', { name: /New chat/ }))
    expect(await screen.findByText('What would you like to know about example.com?')).toBeInTheDocument()
    expect(screen.queryByText('First answer.')).toBeNull()
    ask('Which pages are growing?')
    await screen.findByText('Third answer.')
    expect(askAnalyst.mock.calls[2].slice(1, 3)).toEqual(['Which pages are growing?', null])
  })

  it('shows a question without the blank lines typed after it, as a reopened chat shows it', async () => {
    askAnalyst.mockResolvedValue(answer('c1', 'About two minutes.', 4))
    mount()
    await screen.findByText('3 of 50 questions this month')

    ask('How long do people stay?\n\n')
    await screen.findByText('About two minutes.')
    // The server gets the question trimmed, and its bubble shows the same: no blank line under it.
    expect(askAnalyst.mock.calls[0][1]).toBe('How long do people stay?')
    expect(screen.getByText('How long do people stay?').textContent).toBe('How long do people stay?')
  })

  it('renders the answer as markdown, and a link opens in a new tab so the conversation stays', async () => {
    askAnalyst.mockResolvedValue(
      answer('c1', 'Visitors rose. **google.com** grew most.\n\n- LinkedIn doubled\n- Direct fell\n\nSee [the Pages view](https://pulse.ciphera.net/sites/s1/pages).', 4),
    )
    mount()
    await screen.findByText('3 of 50 questions this month')
    ask('What changed?')
    const strong = await screen.findByText('google.com', { selector: 'strong' })
    expect(strong).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['LinkedIn doubled', 'Direct fell'])
    const link = screen.getByRole('link', { name: 'the Pages view' })
    expect(link.getAttribute('href')).toBe('https://pulse.ciphera.net/sites/s1/pages')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('says Analyst is not available when the routes answer 404', async () => {
    askAnalyst.mockRejectedValue(new ApiError('Not found', 404, { error: 'Not found' }))
    mount()
    await screen.findByText('3 of 50 questions this month')
    ask('Why did visitors change this week?')
    expect(await screen.findByText('Analyst is not available for this site yet.')).toBeInTheDocument()
    // * A failed question has no answer to copy.
    expect(screen.queryByLabelText('Copy the answer')).toBeNull()
  })

  it('names the day the questions come back, and shows the used-up count, once the allowance is used', async () => {
    askAnalyst.mockRejectedValue(
      new ApiError('Too many requests', 429, { code: 'barry_allowance_reached', usage: usage(50) }),
    )
    mount()
    await screen.findByText('3 of 50 questions this month')
    ask('Why did visitors change this week?')
    expect(
      await screen.findByText('Your team has used all its questions for this month. They come back on 1 December.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('50 of 50 questions this month')).toBeInTheDocument())
  })

  it('lists the three newest chats under the suggestions, and every one on Show all', async () => {
    getAnalystConversations.mockResolvedValue(
      chats(chat('c1', 'Q one', 'A one', 1), chat('c2', 'Q two', 'A two', 2), chat('c3', 'Q three', 'A three', 3), chat('c4', 'Q four', 'A four', 4)),
    )
    mount()
    expect(await screen.findByText('Recent chats')).toBeInTheDocument()
    expect(getAnalystConversations).toHaveBeenCalledWith('s1')
    expect(screen.getByText('Q one')).toBeInTheDocument()
    expect(screen.getByText('Q three')).toBeInTheDocument()
    expect(screen.queryByText('Q four')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show all 4' }))
    expect(screen.getByText('Q four')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }))
    expect(screen.queryByText('Q four')).toBeNull()
  })

  it('shows no list, and no Show all, for someone with no chats', async () => {
    mount()
    await screen.findByText('3 of 50 questions this month')
    await waitFor(() => expect(getAnalystConversations).toHaveBeenCalled())
    expect(screen.queryByText('Recent chats')).toBeNull()
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
  })

  it('reopens a past chat with its answer, and a question asked there carries on that chat', async () => {
    getAnalystConversations.mockResolvedValue(chats(chat('c7', 'Which countries read the blog?', 'Mostly Belgium and France.', 5)))
    askAnalyst.mockResolvedValue(answer('c7', 'Germany grew most.', 4))
    mount()
    fireEvent.click(await screen.findByText('Which countries read the blog?'))

    expect(await screen.findByText('Mostly Belgium and France.')).toBeInTheDocument()
    expect(screen.queryByText('What would you like to know about example.com?')).toBeNull()
    ask('And last month?')
    await screen.findByText('Germany grew most.')
    expect(askAnalyst.mock.calls[0].slice(1, 3)).toEqual(['And last month?', 'c7'])

    // * New chat leaves the reopened chat: the next question starts a conversation of its own.
    fireEvent.click(screen.getByRole('button', { name: /New chat/ }))
    expect(await screen.findByText('What would you like to know about example.com?')).toBeInTheDocument()
    askAnalyst.mockResolvedValue(answer('c8', 'A fresh answer.', 5))
    ask('Which pages are growing?')
    await screen.findByText('A fresh answer.')
    expect(askAnalyst.mock.calls[1].slice(1, 3)).toEqual(['Which pages are growing?', null])
  })

  it('lists a new chat once its answer is in, back on the welcome', async () => {
    askAnalyst.mockResolvedValue(answer('c1', 'First answer.', 4))
    mount()
    await screen.findByText('3 of 50 questions this month')
    getAnalystConversations.mockResolvedValue(chats(chat('c1', 'Which pages grew?', 'First answer.', 0)))
    ask('Which pages grew?')
    await screen.findByText('First answer.')

    fireEvent.click(screen.getByRole('button', { name: /New chat/ }))
    expect(await screen.findByText('Recent chats')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Which pages grew\?/ })).toBeInTheDocument()
  })

  it('says in one line when the past chats did not load, and Try again reads them again', async () => {
    getAnalystConversations
      .mockRejectedValueOnce(new ApiError('Server error', 500, { error: 'Could not read your history' }))
      .mockResolvedValue(chats(chat('c1', 'Q one', 'A one', 1)))
    mount()
    expect(await screen.findByText('Your recent chats did not load.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Q one')).toBeInTheDocument()
    expect(screen.queryByText('Your recent chats did not load.')).toBeNull()
  })

  it('draws the horizon behind the welcome, then in the footer, lit while Analyst answers', async () => {
    let reply!: (a: AnalystAnswer) => void
    askAnalyst.mockImplementation(() => new Promise<AnalystAnswer>((r) => (reply = r)))
    const { container } = mount()
    await screen.findByText('3 of 50 questions this month')
    const welcome = container.querySelectorAll('[data-analyst="horizon"]')
    expect(welcome).toHaveLength(1)
    expect(footerHorizon(container)).toBeNull()

    ask('Why did visitors change this week?')
    await waitFor(() => expect(footerHorizon(container)?.getAttribute('data-lit')).toBe('true'))
    // * One horizon at a time: the welcome's went with the welcome.
    expect(container.querySelectorAll('[data-analyst="horizon"]')).toHaveLength(1)

    reply(answer('c1', 'First answer.', 4))
    await screen.findByText('First answer.')
    await waitFor(() => expect(footerHorizon(container)?.getAttribute('data-lit')).toBe('false'))
  })

  it("floats an earlier answer's copy button, so showing it on hover never changes the thread's height", async () => {
    askAnalyst.mockResolvedValueOnce(answer('c1', 'First answer.', 4)).mockResolvedValueOnce(answer('c1', 'Second answer.', 5))
    mount()
    await screen.findByText('3 of 50 questions this month')
    ask('Where do visitors come from?')
    await screen.findByText('First answer.')
    ask('And last month?')
    await screen.findByText('Second answer.')

    // * The newest answer's button is in the flow, shown without a hover.
    const copies = () => screen.queryAllByLabelText('Copy the answer')
    expect(copies()).toHaveLength(1)
    expect(copies()[0].closest('[data-floating]')).toBeNull()

    // * An earlier answer's button shows on hover, floating, and goes when the pointer leaves.
    const first = screen.getByText('First answer.').closest('[data-message-id]') as HTMLElement
    fireEvent.mouseEnter(first)
    await waitFor(() => expect(copies()).toHaveLength(2))
    const floating = copies().find((b) => first.contains(b))
    expect(floating?.closest('[data-floating]')).not.toBeNull()
    fireEvent.mouseLeave(first)
    await waitFor(() => expect(copies()).toHaveLength(1))
  })

  it('lists each lookup while it runs, ticks it off, folds the list at the first word, then shows the whole answer', async () => {
    const g = gate()
    askAnalystStream.mockImplementation(async function* (): AsyncGenerator<AnalystStreamEvent> {
      yield { type: 'start', conversation_id: 'c9', turn_id: null }
      yield { type: 'step', index: 0, tool: 'compare_periods', args: { period: '7d', dimension: 'referrer' } }
      await g.wait()
      const done = answer('c9', 'Visitors rose from 48 to 56.', 4)
      yield { type: 'step_done', index: 0, ms: 210, error: '', result: done.turn.steps![0].result }
      yield { type: 'step', index: 1, tool: 'get_stats', args: {} }
      await g.wait()
      yield { type: 'step_done', index: 1, ms: 80, error: '', result: done.turn.steps![1].result }
      await g.wait()
      yield { type: 'text', delta: 'Visitors rose' }
      await g.wait()
      yield { type: 'done', answer: done }
    })
    const { container } = mount()
    await screen.findByText('3 of 50 questions this month')
    ask('Why did visitors change?')

    expect(await screen.findByText('Comparing sources with the week before')).toBeInTheDocument()
    g.open()
    expect(await screen.findByText('Sources, 4 to 10 November against 28 October to 3 November')).toBeInTheDocument()
    expect(await screen.findByText('Reading the totals')).toBeInTheDocument()
    g.open()
    expect(await screen.findByText('Totals, 4 to 10 November')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Figures behind this answer/ })).toBeNull()

    // * At the first word the list folds into the button, and the words carry the running mark the caret hangs on.
    g.open()
    expect(await screen.findByRole('button', { name: /Figures behind this answer/ })).toBeInTheDocument()
    expect(screen.queryByText('Totals, 4 to 10 November')).toBeNull()
    await waitFor(() => expect(container.querySelector('.an-md')?.getAttribute('data-status')).toBe('running'))

    g.open()
    expect(await screen.findByText('Visitors rose from 48 to 56.')).toBeInTheDocument()
    expect(await screen.findByText('4 of 50 questions this month')).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('.an-md')?.getAttribute('data-status')).not.toBe('running'))
    expect(screen.getByLabelText('Copy the answer')).toBeInTheDocument()
  })

  it('shows a last row while Analyst works after its lookups, until the next lookup or the first word', async () => {
    const g = gate()
    askAnalystStream.mockImplementation(async function* (): AsyncGenerator<AnalystStreamEvent> {
      const done = answer('c9', 'Visitors rose from 48 to 56.', 4)
      yield { type: 'start', conversation_id: 'c9', turn_id: null }
      yield { type: 'step', index: 0, tool: 'compare_periods', args: { period: '7d', dimension: 'referrer' } }
      yield { type: 'step_done', index: 0, ms: 210, error: '', result: done.turn.steps![0].result }
      await g.wait()
      yield { type: 'step', index: 1, tool: 'get_stats', args: {} }
      await g.wait()
      yield { type: 'step_done', index: 1, ms: 80, error: '', result: done.turn.steps![1].result }
      await g.wait()
      yield { type: 'text', delta: 'Visitors rose' }
      await g.wait()
      yield { type: 'done', answer: done }
    })
    mount()
    await screen.findByText('3 of 50 questions this month')
    ask('Why did visitors change?')

    // * Every lookup has ticked and no word is written yet: the model is working out what the figures say.
    expect(await screen.findByText('Working out what the figures say')).toBeInTheDocument()
    g.open()
    // * Another lookup starts, and its own running row takes the working row's place.
    expect(await screen.findByText('Reading the totals')).toBeInTheDocument()
    expect(screen.queryByText('Working out what the figures say')).toBeNull()
    g.open()
    expect(await screen.findByText('Totals, 4 to 10 November')).toBeInTheDocument()
    expect(await screen.findByText('Working out what the figures say')).toBeInTheDocument()
    // * At the first word the list folds into its button, and the row goes with it.
    g.open()
    expect(await screen.findByRole('button', { name: /Figures behind this answer/ })).toBeInTheDocument()
    expect(screen.queryByText('Working out what the figures say')).toBeNull()
    g.open()
    expect(await screen.findByText('Visitors rose from 48 to 56.')).toBeInTheDocument()
    expect(screen.queryByText('Working out what the figures say')).toBeNull()
  })

  it('offers the questions written for the newest answer under it, and picking one asks it in the conversation', async () => {
    const first = answer('c1', 'First answer.', 4)
    first.turn.follow_ups = ['Which pages do google.com visitors read?', 'How did LinkedIn change?']
    askAnalyst.mockResolvedValueOnce(first).mockResolvedValueOnce(answer('c1', 'Second answer.', 5))
    mount()
    await screen.findByText('3 of 50 questions this month')
    ask('Where do visitors come from?')
    await screen.findByText('First answer.')
    expect(await screen.findByRole('heading', { name: 'Ask next' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'How did LinkedIn change?' })).toBeInTheDocument()

    // * A draft in the question box stays where it is.
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'A draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Which pages do google.com visitors read?' }))
    await screen.findByText('Second answer.')
    expect(askAnalyst.mock.calls[1].slice(1, 3)).toEqual(['Which pages do google.com visitors read?', 'c1'])
    expect(screen.getByLabelText('Your question')).toHaveValue('A draft')
    // * The list belongs to the newest answer, which has no questions of its own: none is left on the page.
    expect(screen.queryByRole('heading', { name: 'Ask next' })).toBeNull()
    expect(screen.queryByText('How did LinkedIn change?')).toBeNull()
  })

  it("offers a reopened chat's questions under its newest answer", async () => {
    const past = chat('c7', 'Which countries read the blog?', 'Mostly Belgium and France.', 5)
    past.turns[0].follow_ups = ['How did Belgium change last month?']
    getAnalystConversations.mockResolvedValue(chats(past))
    mount()
    fireEvent.click(await screen.findByText('Which countries read the blog?'))
    expect(await screen.findByText('Mostly Belgium and France.')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'How did Belgium change last month?' })).toBeInTheDocument()
  })

  it('shows only the sentence when an answer fails halfway, never lookups for an answer that did not come', async () => {
    askAnalystStream.mockImplementation(async function* (): AsyncGenerator<AnalystStreamEvent> {
      yield { type: 'start', conversation_id: 'c1', turn_id: null }
      yield { type: 'step', index: 0, tool: 'get_stats', args: {} }
      yield { type: 'step_done', index: 0, ms: 80, error: '', result: { range: { from: '2026-11-04', to: '2026-11-10' }, visitors: 56 } }
      yield { type: 'error', error: 'Analyst could not answer this time, so the question was not counted.', conversation_id: 'c1', usage: usage(3) }
    })
    mount()
    await screen.findByText('3 of 50 questions this month')
    ask('Why did visitors change?')
    expect(
      await screen.findByText('Analyst could not answer this time, so the question was not counted. Try again in a moment.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Figures behind this answer/)).toBeNull()
    expect(screen.queryByText('Totals, 4 to 10 November')).toBeNull()
    expect(screen.queryByLabelText('Copy the answer')).toBeNull()
  })

  it('reads back an answer whose stream broke after it started, saying so under the words until it is in', async () => {
    const kept = answer('c9', 'Visitors rose from 48 to 56.', 4)
    kept.turn.follow_ups = ['How did google.com change?']
    const g = gate()
    getAnalystTurn.mockImplementation(async (_s: string, id: string, signal?: AbortSignal) => {
      await g.wait(signal)
      return id === kept.turn.id ? kept.turn : null
    })
    askAnalystStream.mockImplementation(async function* (): AsyncGenerator<AnalystStreamEvent> {
      yield { type: 'start', conversation_id: 'c9', turn_id: kept.turn.id }
      yield { type: 'step', index: 0, tool: 'get_stats', args: {} }
      yield { type: 'step_done', index: 0, ms: 80, error: '', result: kept.turn.steps![1].result }
      yield { type: 'text', delta: 'Visitors rose' }
      throw new TypeError('network error')
    })
    let used = 3
    getAnalystUsage.mockImplementation(async () => usage(used))
    const { container } = mount()
    await screen.findByText('3 of 50 questions this month')
    ask('Why did visitors change?')

    // * The words that came in stay, with the line under them, while the page reads the turn back.
    expect(await screen.findByText('The connection dropped. Analyst is still writing the answer.')).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('.an-md')?.textContent).toContain('Visitors rose'))
    expect(getAnalystTurn).toHaveBeenCalledWith('s1', kept.turn.id, expect.any(AbortSignal))

    // * Then the kept answer, as any answer: its figures, the copy button, Ask next and the team's new count.
    used = 4
    g.open()
    expect(await screen.findByText('Visitors rose from 48 to 56.')).toBeInTheDocument()
    expect(screen.queryByText('The connection dropped. Analyst is still writing the answer.')).toBeNull()
    expect(screen.getByRole('button', { name: /Figures behind this answer/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Copy the answer')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'How did google.com change?' })).toBeInTheDocument()
    expect(await screen.findByText('4 of 50 questions this month')).toBeInTheDocument()
    expect(screen.queryByText(/Something went wrong/)).toBeNull()
  })

  it('says the connection dropped, and only that, when the answer was not kept in time', async () => {
    // * The page's clock jumps past the limit at the first read, so the wait ends without real minutes going by.
    const realNow = Date.now.bind(Date)
    let late = false
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + (late ? RECOVERY_LIMIT_MS + 1_000 : 0))
    try {
      getAnalystTurn.mockImplementation(async () => {
        late = true
        return null
      })
      askAnalystStream.mockImplementation(async function* (): AsyncGenerator<AnalystStreamEvent> {
        yield { type: 'start', conversation_id: 'c9', turn_id: 't9' }
        yield { type: 'step', index: 0, tool: 'get_stats', args: {} }
        yield { type: 'step_done', index: 0, ms: 80, error: '', result: { range: { from: '2026-11-04', to: '2026-11-10' }, visitors: 56 } }
      })
      mount()
      await screen.findByText('3 of 50 questions this month')
      ask('Why did visitors change?')
      expect(await screen.findByText('The connection dropped and no answer was saved. Try again in a moment.')).toBeInTheDocument()
      expect(getAnalystTurn).toHaveBeenCalledTimes(1)
      expect(screen.queryByText('The connection dropped. Analyst is still writing the answer.')).toBeNull()
      expect(screen.queryByText('Totals, 4 to 10 November')).toBeNull()
      expect(screen.queryByLabelText('Copy the answer')).toBeNull()
    } finally {
      clock.mockRestore()
    }
  })

  it('says the question was not counted when the turn read back was kept as a failure', async () => {
    const failed = answer('c9', '', 3).turn
    failed.outcome = 'error'
    failed.answer = null
    getAnalystTurn.mockResolvedValue(failed)
    askAnalystStream.mockImplementation(async function* (): AsyncGenerator<AnalystStreamEvent> {
      yield { type: 'start', conversation_id: 'c9', turn_id: failed.id }
    })
    mount()
    await screen.findByText('3 of 50 questions this month')
    ask('Why did visitors change?')
    expect(
      await screen.findByText('Analyst could not answer this time, so the question was not counted. Try again in a moment.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Copy the answer')).toBeNull()
  })

  it('keeps the error it always had for a break when the server named no turn', async () => {
    askAnalystStream.mockImplementation(async function* (): AsyncGenerator<AnalystStreamEvent> {
      yield { type: 'start', conversation_id: 'c9', turn_id: null }
      yield { type: 'text', delta: 'Visitors rose' }
    })
    mount()
    await screen.findByText('3 of 50 questions this month')
    ask('Why did visitors change?')
    expect(await screen.findByText('Something went wrong, so there is no answer. Try again in a moment.')).toBeInTheDocument()
    expect(getAnalystTurn).not.toHaveBeenCalled()
  })

  it('stops reading the answer back when the question is stopped, without an error', async () => {
    const g = gate()
    getAnalystTurn.mockImplementation(async (_s: string, _id: string, signal?: AbortSignal) => {
      await g.wait(signal)
      return null
    })
    askAnalystStream.mockImplementation(async function* (): AsyncGenerator<AnalystStreamEvent> {
      yield { type: 'start', conversation_id: 'c9', turn_id: 't9' }
      yield { type: 'text', delta: 'Visitors rose' }
    })
    mount()
    await screen.findByText('3 of 50 questions this month')
    ask('Why did visitors change?')
    await screen.findByText('The connection dropped. Analyst is still writing the answer.')
    fireEvent.click(screen.getByLabelText('Stop'))
    await waitFor(() => expect(screen.getByLabelText('Ask')).toBeInTheDocument())
    expect(screen.queryByText('The connection dropped. Analyst is still writing the answer.')).toBeNull()
    expect(screen.queryByText(/stopped|went wrong|dropped and/i)).toBeNull()
  })

  it("takes the server's own failure at its word, without reading the turn back", async () => {
    askAnalystStream.mockImplementation(async function* (): AsyncGenerator<AnalystStreamEvent> {
      yield { type: 'start', conversation_id: 'c9', turn_id: 't9' }
      yield { type: 'error', error: 'Analyst could not answer this time, so the question was not counted.', conversation_id: 'c9', usage: usage(3) }
    })
    mount()
    await screen.findByText('3 of 50 questions this month')
    ask('Why did visitors change?')
    expect(
      await screen.findByText('Analyst could not answer this time, so the question was not counted. Try again in a moment.'),
    ).toBeInTheDocument()
    expect(getAnalystTurn).not.toHaveBeenCalled()
    expect(screen.queryByText('The connection dropped. Analyst is still writing the answer.')).toBeNull()
  })

  it('leaves lookups skipped at the limit out of the list, and counts them in one line under it', async () => {
    const NOT_RUN = 'not run: this question has used all its tool calls; answer with what you already have'
    const done = answer('c9', 'Visitors rose from 48 to 56.', 4)
    done.turn.steps = [
      ...done.turn.steps!,
      { tool: 'get_stats', args: { filters: ['referrer==Direct'] }, error: NOT_RUN, ms: 0 },
      { tool: 'get_stats', args: { filters: ['referrer==LinkedIn'] }, error: NOT_RUN, ms: 0 },
    ]
    const g = gate()
    askAnalystStream.mockImplementation(async function* (): AsyncGenerator<AnalystStreamEvent> {
      yield { type: 'start', conversation_id: 'c9', turn_id: null }
      for (const [i, step] of done.turn.steps!.entries()) {
        yield { type: 'step', index: i, tool: step.tool, args: step.args }
        yield { type: 'step_done', index: i, ms: step.ms, error: step.error ?? '', result: step.result ?? null }
      }
      await g.wait()
      yield { type: 'done', answer: done }
    })
    mount()
    await screen.findByText('3 of 50 questions this month')
    ask('Why did visitors change?')

    // * While Analyst works: the two lookups that ran, and the line, never "could not read" for one that never ran.
    expect(await screen.findByText('Analyst skipped 2 more lookups because this question used all 2.')).toBeInTheDocument()
    expect(screen.queryByText(/could not read the totals/)).toBeNull()
    g.open()
    await screen.findByText('Visitors rose from 48 to 56.')
    const figures = screen.getByRole('button', { name: /Figures behind this answer/ })
    expect(figures.textContent).toContain('2')
    expect(screen.queryByText(/Analyst skipped/)).toBeNull()
    fireEvent.click(figures)
    expect(screen.getByText('Analyst skipped 2 more lookups because this question used all 2.')).toBeInTheDocument()
    expect(screen.queryByText(/could not read the totals/)).toBeNull()
  })

  it('keeps the conversation of a question stopped halfway, so the next question carries on', async () => {
    const g = gate()
    askAnalystStream.mockImplementationOnce(async function* (
      _s: string,
      _q: string,
      _c: string | null,
      signal?: AbortSignal,
    ): AsyncGenerator<AnalystStreamEvent> {
      yield { type: 'start', conversation_id: 'c5', turn_id: null }
      yield { type: 'step', index: 0, tool: 'get_stats', args: {} }
      await g.wait(signal)
    })
    askAnalyst.mockResolvedValue(answer('c5', 'Second answer.', 4))
    mount()
    await screen.findByText('3 of 50 questions this month')
    ask('Why did visitors change?')
    await screen.findByText('Reading the totals')
    fireEvent.click(screen.getByLabelText('Stop'))
    await waitFor(() => expect(screen.getByLabelText('Ask')).toBeInTheDocument())
    ask('And last month?')
    await screen.findByText('Second answer.')
    expect(askAnalystStream.mock.calls[1].slice(1, 3)).toEqual(['And last month?', 'c5'])
  })
})
