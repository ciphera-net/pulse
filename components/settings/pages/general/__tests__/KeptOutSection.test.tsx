import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { BotFilterSummary } from '@/lib/api/quarantine'

/**
 * Settings → General, "Kept out of your stats" on the bot filter's counts (Cerberus v2). Two units the page never
 * adds together, the rows by rule only for a team with the beta, and a failed read said as one.
 */

const hook = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({ useBotFilterSummary: () => hook() }))
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
  Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}))

const { KeptOutSection } = await import('../KeptOutSection')

const rules = [
  { rule: 'known_bot', page_views: 107, visits: null },
  { rule: 'automation', page_views: 42, visits: null },
  { rule: 'datacenter', page_views: 85, visits: 3 },
  { rule: 'impossible_device', page_views: 25, visits: 1 },
  { rule: 'repeated_fingerprint', page_views: null, visits: 0 },
  { rule: 'no_sign_of_life', page_views: null, visits: 79 },
  { rule: 'clock_mismatch', page_views: null, visits: 3 },
  { rule: 'earlier', page_views: 0, visits: 32 },
]

function summary(withRules: boolean): BotFilterSummary {
  const w = (window: '24h' | '7d' | '90d', page_views: number, visits: number) => ({
    window, from: '2026-11-19T04:00:00Z', to: '2026-11-26T04:00:00Z', page_views, visits, rules: withRules ? rules : null,
  })
  return { filter_bots: true, windows: [w('24h', 76, 14), w('7d', 259, 118), w('90d', 1436, 865)] }
}

const section = () => document.querySelector('section[data-kit-section="Kept out of your stats"]') as HTMLElement

beforeEach(() => {
  hook.mockReset()
})

describe('the two figures, then each rule', () => {
  it('shows the week apart, then a row per rule that kept something out', () => {
    hook.mockReturnValue({ data: summary(true), error: undefined, mutate: vi.fn() })
    render(<KeptOutSection siteId="s" />)
    const s = within(section())
    expect(s.getByText('Page views turned away as they arrived').nextElementSibling?.textContent).toBe('259')
    expect(s.getByText('Visits filtered after they ended').nextElementSibling?.textContent).toBe('118')
    expect(s.getByText('85 page views, 3 visits')).toBeTruthy()
    expect(s.getByText('32 visits')).toBeTruthy()
    // * A rule that kept nothing out this week draws no row.
    expect(s.queryByText('Repeated fingerprint')).toBeNull()
  })

  it('draws no row for a team without the beta', () => {
    hook.mockReturnValue({ data: summary(false), error: undefined, mutate: vi.fn() })
    render(<KeptOutSection siteId="s" />)
    expect(within(section()).getByText('259')).toBeTruthy()
    expect(within(section()).queryByText('Known bot')).toBeNull()
  })
})

describe('loading and failure', () => {
  it('holds the figures while loading', () => {
    hook.mockReturnValue({ data: undefined, error: undefined, mutate: vi.fn() })
    render(<KeptOutSection siteId="s" />)
    expect(within(section()).getAllByText('…')).toHaveLength(2)
  })

  it('says a failed read and offers to try again', () => {
    const mutate = vi.fn()
    hook.mockReturnValue({ data: undefined, error: new Error('down'), mutate })
    render(<KeptOutSection siteId="s" />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(mutate).toHaveBeenCalled()
    expect(screen.getByText("Couldn't load these numbers.")).toBeTruthy()
  })
})
