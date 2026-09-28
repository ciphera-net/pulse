import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * PULSE-128 — the learned dynamic parents list and the "Keep as-is" manual
 * rule type (design doc §3.4, owner-picked option A;
 * Pulse/docs/plans/28-09-2026-cardinality-path-grouping-design.md).
 *
 * Three things a test can pin and a screenshot cannot:
 *   - `learned_dynamic_parents` is read-only and may be missing, null, or
 *     empty — the list must render nothing, never a loading/error state, on
 *     any of those shapes;
 *   - clicking "Keep as-is" only STAGES a manual `keep` rule (the pattern
 *     with every literal `:id` segment replaced by `*`) and dirties the
 *     existing save bar — it never saves on its own;
 *   - the list is only shown while auto-grouping is ON, matching the mock.
 */

const useSiteMock = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useSite: () => useSiteMock(),
  useSubscription: () => ({ data: { plan_id: 'solo' }, error: undefined, mutate: vi.fn() }),
  usePerformanceConfig: () => ({ data: { enabled: false, frequency: 'weekly' }, error: undefined, mutate: vi.fn() }),
}))

vi.mock('@/lib/auth/permissions', () => ({ useCan: () => true }))

const updateSite = vi.fn()
vi.mock('@/lib/api/sites', () => ({
  updateSite: (...a: unknown[]) => updateSite(...a),
  DEFAULT_GEO_DATA_LEVEL: 'full',
}))
vi.mock('@/lib/api/performance', () => ({ updatePerformanceConfig: vi.fn() }))

// The save bar portals into a slot the settings SHELL owns and renders nothing
// without one, so without this mock "Unsaved changes" can never appear and a
// dirty-state assertion passes vacuously (the identity-window test's lesson).
vi.mock('@/components/settings/shell-slots', () => ({
  useSaveSlot: () => document.body,
  useHeaderSlot: () => null,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

// Facet stand-ins (the SitePrivacyTab.test precedent): a native <select> so the
// options and the selected value are readable; everything Pulse-local is real.
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
  Spinner: (props: any) => <div data-testid="spinner" {...props} />,
  Button: ({ children, variant, size, asChild, ...props }: any) =>
    asChild ? children : <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  Toggle: ({ checked, onChange, disabled, id, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy }: any) => (
    <button role="switch" aria-checked={!!checked} disabled={disabled} onClick={() => onChange()} id={id} aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} />
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
import { formatSiteDay } from '@/lib/utils/siteTime'

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

const LEARNED = [
  { template: '/sites/:id/visitors/:id', learned_at: '2026-09-28T10:00:00Z', children: 189 },
  { template: '/blog/:id/comments/:id', learned_at: '2026-09-28T11:00:00Z', children: 14 },
]

function mountWith(site: Record<string, unknown>) {
  useSiteMock.mockReturnValue({ data: site, error: undefined, mutate: vi.fn().mockResolvedValue(undefined) })
  return render(<SitePrivacyTab siteId="s1" />)
}

beforeEach(() => {
  updateSite.mockReset()
  updateSite.mockResolvedValue({})
})

describe('SitePrivacyTab: learned dynamic parents list (PULSE-128, option A)', () => {
  it('renders nothing when the field is missing', () => {
    mountWith(makeSite())
    expect(screen.queryByText(/ids · since/)).not.toBeInTheDocument()
  })

  it('renders nothing when the field is null', () => {
    mountWith(makeSite({ learned_dynamic_parents: null }))
    expect(screen.queryByText(/ids · since/)).not.toBeInTheDocument()
  })

  it('renders nothing when the field is an empty array', () => {
    mountWith(makeSite({ learned_dynamic_parents: [] }))
    expect(screen.queryByText(/ids · since/)).not.toBeInTheDocument()
  })

  it('renders one row per learned parent: path in mono, "N ids · since <date>" caption, a Keep as-is action', () => {
    mountWith(makeSite({ learned_dynamic_parents: LEARNED }))

    const path = screen.getByText('/sites/:id/visitors/:id')
    expect(path.tagName).toBe('CODE')
    expect(path.className).toMatch(/\bfont-mono\b/)

    const caption0 = `189 ids · since ${formatSiteDay(LEARNED[0].learned_at, undefined)}`
    const caption1 = `14 ids · since ${formatSiteDay(LEARNED[1].learned_at, undefined)}`
    expect(screen.getAllByText((_, node) => node?.textContent === caption0).length).toBeGreaterThan(0)
    expect(screen.getAllByText((_, node) => node?.textContent === caption1).length).toBeGreaterThan(0)

    expect(screen.getAllByRole('button', { name: 'Keep as-is' })).toHaveLength(2)
  })

  it('never puts font-mono on the caption, the count, or the action', () => {
    mountWith(makeSite({ learned_dynamic_parents: LEARNED }))
    const caption0 = `189 ids · since ${formatSiteDay(LEARNED[0].learned_at, undefined)}`
    const captionMatches = screen.getAllByText((_, node) => node?.textContent === caption0)
    const caption = captionMatches.find((el) => el.tagName === 'SPAN')!
    expect(caption.className).not.toMatch(/font-mono/)
    expect(caption.className).toMatch(/tabular-nums/)
    const button = screen.getAllByRole('button', { name: 'Keep as-is' })[0]
    expect(button.className ?? '').not.toMatch(/font-mono/)
  })

  it('is only shown while auto-grouping is ON', () => {
    mountWith(makeSite({ auto_group_dynamic_paths: false, learned_dynamic_parents: LEARNED }))
    expect(screen.queryByText('/sites/:id/visitors/:id')).not.toBeInTheDocument()
    expect(screen.queryByText(/ids · since/)).not.toBeInTheDocument()

    // and it appears the moment the toggle turns on, no reload needed
    fireEvent.click(screen.getByRole('switch', { name: 'Auto-group dynamic paths' }))
    expect(screen.getByText('/sites/:id/visitors/:id')).toBeInTheDocument()
  })

  it('"Keep as-is" appends a keep rule with every :id segment replaced by *, and dirties the save bar', async () => {
    mountWith(makeSite({ learned_dynamic_parents: LEARNED }))

    expect(screen.queryByText(/Unsaved changes/i)).toBeNull()

    fireEvent.click(screen.getAllByRole('button', { name: 'Keep as-is' })[0])

    await waitFor(() => expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(updateSite).toHaveBeenCalledTimes(1))
    const [, payload] = updateSite.mock.calls[0] as [string, { page_rules: Array<{ type: string; pattern: string }> }]
    expect(payload.page_rules).toContainEqual({ type: 'keep', pattern: '/sites/*/visitors/*' })
  })

  it('does NOT save by itself — clicking Keep as-is issues no request', () => {
    mountWith(makeSite({ learned_dynamic_parents: LEARNED }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Keep as-is' })[0])
    expect(updateSite).not.toHaveBeenCalled()
  })

  it('marks a kept row as handled: the action becomes a quiet "Kept" caption, not a second button', () => {
    mountWith(makeSite({ learned_dynamic_parents: LEARNED }))
    const buttonsBefore = screen.getAllByRole('button', { name: 'Keep as-is' })
    expect(buttonsBefore).toHaveLength(2)

    fireEvent.click(buttonsBefore[0])

    expect(screen.getAllByRole('button', { name: 'Keep as-is' })).toHaveLength(1)
    expect(screen.getByText('Kept')).toBeInTheDocument()
  })
})

describe('SitePrivacyTab: "Keep as-is" manual rule type', () => {
  it('offers Exclude, Group, and Keep as-is in the manual rule type select', () => {
    mountWith(makeSite({ page_rules: [{ type: 'exclude', pattern: '/admin/*' }] }))
    const select = screen.getByLabelText('Rule 1 type') as HTMLSelectElement
    const labels = [...select.options].map((o) => o.textContent)
    expect(labels).toEqual(['Exclude', 'Group', 'Keep as-is'])
  })

  it('a keep rule needs no label, exactly like exclude: the Label input is hidden for it', () => {
    mountWith(makeSite({
      page_rules: [
        { type: 'keep', pattern: '/sites/*/visitors/*' },
        { type: 'group', pattern: '/blog/*', label: '/blog/:id' },
      ],
    }))

    expect(screen.queryByLabelText('Rule 1 label')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Rule 2 label')).toBeInTheDocument()

    const select = screen.getByLabelText('Rule 1 type') as HTMLSelectElement
    expect(select.value).toBe('keep')
  })

  it('changing a rule to Keep as-is via the select updates its type', () => {
    mountWith(makeSite({ page_rules: [{ type: 'exclude', pattern: '/admin/*' }] }))
    const select = screen.getByLabelText('Rule 1 type') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'keep' } })
    expect(select.value).toBe('keep')
    expect(screen.queryByLabelText('Rule 1 label')).not.toBeInTheDocument()
  })
})
