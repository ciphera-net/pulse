import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// --- Mocks ---------------------------------------------------------------

const useSiteMock = vi.fn()
const useSubscriptionMock = vi.fn()
const usePerformanceConfigMock = vi.fn()

vi.mock('@/lib/swr/dashboard', () => ({
  useSite: () => useSiteMock(),
  useSubscription: () => useSubscriptionMock(),
  usePerformanceConfig: () => usePerformanceConfigMock(),
}))

vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => true,
}))

vi.mock('@/lib/api/sites', () => ({ updateSite: vi.fn() }))
vi.mock('@/lib/api/performance', () => ({ updatePerformanceConfig: vi.fn() }))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

// Lightweight facet stand-ins (audit-test precedent): real DOM so the panel
// composition, the ruled table, the Selects, and the query-param chips are
// queryable, while the Pulse-local panels / StatusChip / SaveBar / ErrorState
// render for real to verify the grammar.
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
  Spinner: (props: any) => <div data-testid="spinner" {...props} />,
  // `asChild` hands the classes/props to its single child (an <a>) instead of
  // wrapping it in a second interactive element, matching the real Radix Slot
  // behaviour closely enough for the Exclude Self link to render as one <a>.
  Button: ({ children, variant, size, asChild, ...props }: any) =>
    asChild ? children : <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  Toggle: ({ checked, onChange, disabled }: any) => (
    <button role="switch" aria-checked={!!checked} disabled={disabled} onClick={() => onChange()} />
  ),
  Select: ({ value, onChange, options, ...props }: any) => (
    <select value={value} onChange={(e) => onChange?.(e.target.value)} {...props}>
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
  Table: ({ children, containerClassName, ...props }: any) => <table {...props}>{children}</table>,
  THead: ({ children, ...props }: any) => <thead {...props}>{children}</thead>,
  TBody: ({ children, ...props }: any) => <tbody {...props}>{children}</tbody>,
  TR: ({ children, ...props }: any) => <tr {...props}>{children}</tr>,
  TH: ({ children, numeric, ...props }: any) => <th {...props}>{children}</th>,
  TD: ({ children, numeric, ...props }: any) => <td {...props}>{children}</td>,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

import SitePrivacyTab from '../SitePrivacyTab'

const makeSite = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  name: 'Demo',
  domain: 'demo.test',
  collect_page_paths: true,
  collect_referrers: true,
  collect_device_info: true,
  collect_screen_resolution: true,
  collect_audience_data: true,
  collect_geo_data: 'full',
  hide_unknown_locations: false,
  data_retention_months: 6,
  auto_group_dynamic_paths: true,
  page_rules: [] as unknown[],
  allowed_query_params: [] as string[],
  filter_bots: true,
  ...over,
})

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const SOURCE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'SitePrivacyTab.tsx',
)

beforeEach(() => {
  useSiteMock.mockReturnValue({ data: makeSite(), error: undefined, mutate: vi.fn() })
  useSubscriptionMock.mockReturnValue({ data: { plan_id: 'solo' }, error: undefined, mutate: vi.fn() })
  usePerformanceConfigMock.mockReturnValue({ data: { enabled: false, frequency: 'weekly' }, error: undefined, mutate: vi.fn() })
})

describe('SitePrivacyTab', () => {
  it('renders the in-content section nav and the data-collection toggle panel', () => {
    render(<SitePrivacyTab siteId="s1" />)

    // Mini-nav label + panel title share the copy (sentence case, rule 15);
    // both must be present.
    expect(screen.getAllByText('Data and privacy').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('button', { name: 'Path grouping' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Privacy policy' })).toBeInTheDocument()

    // The mini-nav is a real nav of buttons with an aria-current active row,
    // not a bare <button> list.
    const rail = screen.getByRole('navigation', { name: 'Privacy sections' })
    const activeButton = within(rail).getByRole('button', { name: 'Data and privacy' })
    expect(activeButton.tagName).toBe('BUTTON')
    expect(activeButton).toHaveAttribute('aria-current', 'true')

    // Every panel title is a heading (h2), matching the dashboard's section
    // header device.
    expect(screen.getByRole('heading', { name: 'Data and privacy' })).toBeInTheDocument()

    // Six data-collection toggles + the auto-group toggle all render as switches.
    expect(screen.getAllByRole('switch').length).toBeGreaterThanOrEqual(7)
  })

  it('renders query parameters as removable chips over the source-of-truth input', () => {
    useSiteMock.mockReturnValue({ data: makeSite({ allowed_query_params: ['q', 'category'] }), error: undefined, mutate: vi.fn() })
    render(<SitePrivacyTab siteId="s1" />)

    const input = screen.getByLabelText('Allowed query parameters') as HTMLInputElement
    expect(input.value).toBe('q, category')

    // Removing a chip rewrites the canonical comma-separated string.
    fireEvent.click(screen.getByLabelText('Remove q'))
    expect((screen.getByLabelText('Allowed query parameters') as HTMLInputElement).value).toBe('category')
  })

  it('renders manual page rules in a ruled table, in its own titled panel', () => {
    useSiteMock.mockReturnValue({
      data: makeSite({ page_rules: [{ type: 'exclude', pattern: '/admin/*' }] }),
      error: undefined,
      mutate: vi.fn(),
    })
    render(<SitePrivacyTab siteId="s1" />)

    expect(screen.getByRole('heading', { name: 'Manual rules' })).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Page rules' })
    expect(within(table).getByText('Pattern')).toBeInTheDocument()
    expect((within(table).getByLabelText('Rule 1 pattern') as HTMLInputElement).value).toBe('/admin/*')
    // The type column of an exclude rule has no label. A raw em dash used to
    // stand in for that; the cell is simply empty now.
    expect(within(table).queryByText('—')).not.toBeInTheDocument()
    // Row actions are ghost Buttons, not bare <button> elements with no
    // accessible name.
    expect(screen.getByRole('button', { name: 'Remove rule 1' })).toBeInTheDocument()
  })

  it('shows an in-frame empty state when there are no manual rules, with Add rule in the panel header', () => {
    render(<SitePrivacyTab siteId="s1" />)
    expect(screen.getByText('No manual rules')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add rule' })).toBeInTheDocument()
  })

  it('shows the loading skeleton, not a bare spinner, while the site is loading', () => {
    useSiteMock.mockReturnValue({ data: undefined, error: undefined, mutate: vi.fn() })
    render(<SitePrivacyTab siteId="s1" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument()
    expect(screen.queryByText('No manual rules')).not.toBeInTheDocument()
  })

  it('surfaces a load error distinct from an empty state, naming the thing that failed', () => {
    useSiteMock.mockReturnValue({ data: undefined, error: new Error('boom'), mutate: vi.fn() })
    render(<SitePrivacyTab siteId="s1" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/couldn't load this site's privacy settings/i)).toBeInTheDocument()
    expect(screen.queryByText('No manual rules')).not.toBeInTheDocument()
  })

  it('titles every panel the way the dashboard titles a section: a real level-2 heading, sentence case, no kicker', () => {
    render(<SitePrivacyTab siteId="s1" />)

    for (const name of ['Data and privacy', 'Visitor views', 'Visitor identity', 'Manual rules']) {
      const heading = screen.getByRole('heading', { level: 2, name })
      expect(heading.className).toMatch(/\btext-sm\b/)
      expect(heading.className).toMatch(/\bfont-semibold\b/)
      expect(heading.className).not.toMatch(/uppercase|micro-label/)
    }
  })

  it('never uses an em dash, en dash or a literal ellipsis in its user-facing copy', () => {
    // Scoped to string literals, not the whole stripped source: comments are
    // stripped first so a design note doesn't trip the same copy rule its own
    // quoted strings must obey.
    const stripped = stripComments(readFileSync(SOURCE_PATH, 'utf8'))
    const stringLiterals = stripped.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g) ?? []
    const offenders = stringLiterals.filter(s => /[—–]/.test(s) || /\.\.\./.test(s))
    expect(offenders).toEqual([])
  })
})
