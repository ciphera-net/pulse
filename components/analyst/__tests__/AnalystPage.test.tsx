// Analyst's page against assistant-ui's real local runtime (PUL-78): a question goes to pulse-backend through the
// adapter, the answer and its figures come back as one turn, a follow-up carries the conversation, New chat starts
// over, and a refused question shows a sentence a person can act on. Round 6: the recent chats under the suggestions
// reopen a chat to carry on, and the horizon sits behind the welcome, then in the footer, lit while Analyst answers.
// Only the API functions, the site and the display zone are stubbed.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { ApiError } from '@/lib/api/client'
import type { AnalystAnswer, AnalystConversation, AnalystUsage } from '@/lib/api/analyst'

const askAnalyst = vi.hoisted(() => vi.fn())
const getAnalystUsage = vi.hoisted(() => vi.fn())
const getAnalystConversations = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/analyst', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/analyst')>()),
  askAnalyst,
  getAnalystUsage,
  getAnalystConversations,
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

beforeEach(() => {
  askAnalyst.mockReset()
  getAnalystUsage.mockReset()
  getAnalystUsage.mockResolvedValue(usage(3))
  getAnalystConversations.mockReset()
  getAnalystConversations.mockResolvedValue(chats())
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
    expect(screen.getByText('Totals, 4 to 10 November')).toBeInTheDocument()
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
})
