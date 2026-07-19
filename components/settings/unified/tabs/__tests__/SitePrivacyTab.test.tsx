import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------

const useSiteMock = vi.fn()
const useSubscriptionMock = vi.fn()
const usePageSpeedConfigMock = vi.fn()

vi.mock('@/lib/swr/dashboard', () => ({
  useSite: () => useSiteMock(),
  useSubscription: () => useSubscriptionMock(),
  usePageSpeedConfig: () => usePageSpeedConfigMock(),
}))

vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => true,
}))

vi.mock('@/lib/api/sites', () => ({ updateSite: vi.fn() }))
vi.mock('@/lib/api/pagespeed', () => ({ updatePageSpeedConfig: vi.fn() }))

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
  Button: ({ children, variant, size, ...props }: any) => <button {...props}>{children}</button>,
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

beforeEach(() => {
  useSiteMock.mockReturnValue({ data: makeSite(), error: undefined, mutate: vi.fn() })
  useSubscriptionMock.mockReturnValue({ data: { plan_id: 'solo' }, error: undefined, mutate: vi.fn() })
  usePageSpeedConfigMock.mockReturnValue({ data: { enabled: false, frequency: 'weekly' }, error: undefined, mutate: vi.fn() })
})

describe('SitePrivacyTab', () => {
  it('renders the in-content section nav and the data-collection toggle panel', () => {
    render(<SitePrivacyTab siteId="s1" />)

    // Mini-nav label + panel kicker share the copy; both must be present.
    expect(screen.getAllByText('Data & Privacy').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('button', { name: 'Path Grouping' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Privacy Policy' })).toBeInTheDocument()

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

  it('renders manual page rules in a ruled table', () => {
    useSiteMock.mockReturnValue({
      data: makeSite({ page_rules: [{ type: 'exclude', pattern: '/admin/*' }] }),
      error: undefined,
      mutate: vi.fn(),
    })
    render(<SitePrivacyTab siteId="s1" />)

    const table = screen.getByRole('table', { name: 'Page rules' })
    expect(within(table).getByText('Pattern')).toBeInTheDocument()
    expect((within(table).getByLabelText('Rule 1 pattern') as HTMLInputElement).value).toBe('/admin/*')
  })

  it('shows an in-frame empty state when there are no manual rules', () => {
    render(<SitePrivacyTab siteId="s1" />)
    expect(screen.getByText('No manual rules')).toBeInTheDocument()
  })

  it('shows a spinner while the site is loading', () => {
    useSiteMock.mockReturnValue({ data: undefined, error: undefined, mutate: vi.fn() })
    render(<SitePrivacyTab siteId="s1" />)
    expect(screen.getByTestId('spinner')).toBeInTheDocument()
    expect(screen.queryByText('No manual rules')).not.toBeInTheDocument()
  })

  it('surfaces a load error distinct from an empty state', () => {
    useSiteMock.mockReturnValue({ data: undefined, error: new Error('boom'), mutate: vi.fn() })
    render(<SitePrivacyTab siteId="s1" />)
    expect(screen.getByText(/couldn't load this site's privacy settings/i)).toBeInTheDocument()
    expect(screen.queryByText('No manual rules')).not.toBeInTheDocument()
  })
})
