// @vitest-environment jsdom
//
// What's new (for every team since 09-11-2026). What these pin, in order of how badly each would hurt if it broke:
//
//  1. The button claims the update notice while it is mounted, so the toast steps aside in the dashboard only.
//  2. Opening records the posts as seen once, and the open panel keeps showing what was unread while it is read.
//  3. "Could not load" never reads as "nothing new".
//  4. The newest post leads as the card, with its screenshot; the rest are rows.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { WhatsNewPost, WhatsNewResponse } from '@/lib/api/whatsNew'

vi.mock('framer-motion', () => {
  // The panel's own props pass through (role, aria-label, style); the animation props do not reach the DOM.
  const MotionDiv = React.forwardRef<HTMLDivElement, Record<string, unknown>>(function MotionDiv(props, ref) {
    const rest: Record<string, unknown> = { ...props }
    for (const k of ['initial', 'animate', 'exit', 'transition']) delete rest[k]
    return <div ref={ref} {...rest} />
  })
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: { div: MotionDiv },
  }
})
vi.mock('@ciphera-net/facet', () => ({ XIcon: () => null }))

const hook = {
  data: undefined as WhatsNewResponse | undefined,
  error: undefined as unknown,
  reload: vi.fn(),
  markSeen: vi.fn(async () => {}),
}
vi.mock('@/lib/hooks/useWhatsNew', () => ({ useWhatsNew: () => hook }))

import WhatsNewButton, { arrange, shortPostDate } from '../WhatsNewButton'
import { markUpdateReady, resetUpdateNoticeForTests, useUpdateNoticeClaimed } from '@/lib/updateNotice'

const week: WhatsNewPost = {
  slug: '2026-11-02-pulse-week',
  url: 'https://docs.ciphera.net/changelog/2026-11-02-pulse-week',
  title: 'Pulse: week of 2 November 2026',
  date: '2026-11-02',
  unread: true,
  lead: {
    type: 'changed',
    text: 'Pulse plans now count events.',
    more: 'Personal is free up to 10,000 events a month.',
    image: 'https://cdn.ciphera.net/docs/screenshots/settings-billing-0c0b5f665edf.png',
  },
  changes: [{ type: 'everyone', text: 'Team names are out of beta and on for every team.' }],
}
const older: WhatsNewPost = {
  slug: '2026-10-27-pulse-visitors-one-day',
  url: 'https://docs.ciphera.net/changelog/2026-10-27-pulse-visitors-one-day',
  title: 'Pulse: a visitor is recognised for one day at most',
  date: '2026-10-27',
  unread: false,
  lead: { type: '', text: 'Pulse no longer recognises a reader from one day to the next.' },
  changes: [],
}
const answer = (posts: WhatsNewPost[]): WhatsNewResponse => ({
  posts,
  unread_count: posts.filter((p) => p.unread).length,
  changelog_url: 'https://docs.ciphera.net/changelog/pulse',
})

function ClaimProbe() {
  return <span data-testid="claimed">{String(useUpdateNoticeClaimed())}</span>
}

beforeEach(() => {
  hook.data = answer([week, older])
  hook.error = undefined
  hook.reload = vi.fn()
  hook.markSeen = vi.fn(async () => {})
  resetUpdateNoticeForTests()
})
afterEach(() => cleanup())

describe('WhatsNewButton', () => {
  it('claims the update notice while it is shown, so the toast steps aside', () => {
    const { unmount } = render(<><WhatsNewButton /><ClaimProbe /></>)
    expect(screen.getByTestId('claimed').textContent).toBe('true')
    unmount()
    render(<ClaimProbe />)
    expect(screen.getByTestId('claimed').textContent).toBe('false')
  })

  it('shows the dot for unread posts, and no dot when everything was read', () => {
    const { unmount } = render(<WhatsNewButton />)
    expect(screen.getByTestId('whats-new-dot')).toBeTruthy()
    expect(screen.getByRole('button', { name: "What's new" })).toBeTruthy()
    unmount()
    hook.data = answer([{ ...week, unread: false }, older])
    render(<WhatsNewButton />)
    expect(screen.queryByTestId('whats-new-dot')).toBeNull()
  })

  it('says Update ready and offers Refresh once a new version is ready', () => {
    hook.data = answer([{ ...week, unread: false }])
    render(<WhatsNewButton />)
    act(() => markUpdateReady())
    const button = screen.getByRole('button', { name: 'Update ready' })
    expect(screen.getByTestId('whats-new-dot')).toBeTruthy()
    fireEvent.click(button)
    expect(screen.getByText('A new version of Pulse is ready')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Refresh/ })).toBeTruthy()
  })

  it('leads with the newest post and its screenshot, lists the rest, and links the changelog', () => {
    render(<WhatsNewButton />)
    fireEvent.click(screen.getByRole('button', { name: "What's new" }))
    const dialog = screen.getByRole('dialog', { name: "What's new" })
    expect(dialog.textContent).toContain('Pulse plans now count events.')
    expect(dialog.textContent).toContain('Personal is free up to 10,000 events a month.')
    expect(dialog.textContent).toContain('Changed')
    expect(dialog.textContent).toContain('2 Nov')
    expect(dialog.textContent).toContain('For everyone')
    expect(dialog.textContent).toContain('Pulse no longer recognises a reader from one day to the next.')
    const shot = dialog.querySelector('img.whats-new-shot') as HTMLImageElement
    expect(shot?.getAttribute('src')).toBe(week.lead!.image)
    const links = [...dialog.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(links).toContain(week.url)
    expect(links).toContain('https://docs.ciphera.net/changelog/pulse')
  })

  it('records the posts as seen once on opening, and keeps showing what was unread while open', async () => {
    const { rerender } = render(<WhatsNewButton />)
    fireEvent.click(screen.getByRole('button', { name: "What's new" }))
    expect(hook.markSeen).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Since your last visit')).toBeTruthy()

    // The server's answer after the write: nothing unread. The open panel keeps its snapshot.
    hook.data = answer([{ ...week, unread: false }, older])
    rerender(<WhatsNewButton />)
    expect(screen.getByText('Since your last visit')).toBeTruthy()
    expect(screen.queryByTestId('whats-new-dot')).toBeNull()
    expect(hook.markSeen).toHaveBeenCalledTimes(1)

    // Closed and opened again: the fresh answer, nothing to record.
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: "What's new" }))
    expect(screen.queryByText('Since your last visit')).toBeNull()
    expect(hook.markSeen).toHaveBeenCalledTimes(1)
  })

  it('says it could not load, never that nothing is new, and offers a retry', () => {
    hook.data = undefined
    hook.error = new Error('502')
    render(<WhatsNewButton />)
    fireEvent.click(screen.getByRole('button', { name: "What's new" }))
    expect(screen.getByText("Could not load what's new.")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(hook.reload).toHaveBeenCalledTimes(1)
    expect(hook.markSeen).not.toHaveBeenCalled()
  })

  it('shows the card without a picture when the main change has no screenshot', () => {
    hook.data = answer([{ ...week, lead: { ...week.lead!, image: undefined } }])
    render(<WhatsNewButton />)
    fireEvent.click(screen.getByRole('button', { name: "What's new" }))
    const dialog = screen.getByRole('dialog', { name: "What's new" })
    expect(dialog.querySelector('img.whats-new-shot')).toBeNull()
    expect(dialog.textContent).toContain('Pulse plans now count events.')
  })
})

describe('arrange', () => {
  it("promotes the newest post's first change when it has no lead", () => {
    const { lead, rows } = arrange([{ ...week, lead: null }, older])
    expect(lead?.entry.text).toBe('Team names are out of beta and on for every team.')
    expect(rows.map((r) => r.entry.text)).toEqual(['Pulse no longer recognises a reader from one day to the next.'])
  })

  it('keeps at most four rows, newest first', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...older, slug: `post-${i}` }))
    const { rows } = arrange([week, ...many])
    expect(rows).toHaveLength(4)
    expect(rows.map((r) => r.key)).toEqual(arrange([week, ...many, ...many]).rows.map((r) => r.key))
    expect(rows[0].post.slug).toBe(week.slug)
  })

  it('has nothing to lead with when there are no posts', () => {
    expect(arrange([])).toEqual({ lead: null, rows: [] })
  })
})

describe('shortPostDate', () => {
  it('prints a calendar day the same in every timezone', () => {
    expect(shortPostDate('2026-11-02')).toBe('2 Nov')
    expect(shortPostDate('not a date')).toBe('not a date')
  })
})
