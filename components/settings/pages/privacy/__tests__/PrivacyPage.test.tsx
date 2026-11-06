import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// --- Mocks ---------------------------------------------------------------

const useSiteMock = vi.fn()
const useSubscriptionMock = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useSite: () => useSiteMock(),
  useSubscription: () => useSubscriptionMock(),
}))

let canEdit = true
vi.mock('@/lib/auth/permissions', () => ({ useCan: () => canEdit }))

const updateSite = vi.fn()
vi.mock('@/lib/api/sites', () => ({
  updateSite: (...a: unknown[]) => updateSite(...a),
  // The policy-text generator reads it.
  DEFAULT_GEO_DATA_LEVEL: 'full',
}))

// The save bar portals into a slot the settings SHELL owns and renders nothing without one, so without this mock
// "Unsaved changes" can never appear and a dirty-state assertion passes vacuously.
vi.mock('@/components/settings/shell-slots', () => ({
  useSaveSlot: () => document.body,
  useHeaderSlot: () => null,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

// Facet stand-ins (the SitePrivacyTab tests' precedent): real DOM, so names, values and the save bar are queryable,
// while the kit, the save bar and everything else Pulse-local render for real.
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
  Button: ({ children, variant, size, asChild, ...props }: any) => (asChild ? children : <button {...props}>{children}</button>),
  // Like Facet's Input: an error marks the field invalid and prints under it.
  Input: ({ error, ...props }: any) => (
    <>
      <input aria-invalid={error ? true : undefined} {...props} />
      {error ? <p data-testid="field-error">{error}</p> : null}
    </>
  ),
  Toggle: ({ checked, onChange, disabled, id, 'aria-label': ariaLabel }: any) => (
    <button role="switch" aria-checked={!!checked} disabled={disabled} onClick={() => onChange()} id={id} aria-label={ariaLabel} />
  ),
  Select: ({ value, onChange, options, ...props }: any) => (
    <select value={value} onChange={(e) => onChange?.(e.target.value)} {...props}>
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'Invalid credentials',
}))

import PrivacyPage from '../PrivacyPage'
import { toast } from '@ciphera-net/facet'
import { formatSiteDay } from '@/lib/utils/siteTime'
import { generatePrivacySnippet } from '@/lib/utils/privacySnippet'
import { IDENTITY_COPY } from '@/lib/visitors/identityWindow'

const makeSite = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  name: 'Demo',
  domain: 'demo.test',
  timezone: 'Europe/Brussels',
  collect_page_paths: true,
  collect_referrers: true,
  collect_device_info: true,
  collect_screen_resolution: true,
  collect_audience_data: true,
  collect_geo_data: 'full',
  hide_unknown_locations: false,
  data_retention_months: 24,
  auto_group_dynamic_paths: true,
  page_rules: [] as unknown[],
  allowed_query_params: [] as string[],
  filter_bots: true,
  visitor_views_enabled: true,
  // Old rows still carry the retired column; the page never sends it.
  identity_window_days: 7,
  uptime_enabled: false,
  created_at: '2025-09-23T10:00:00Z',
  ...over,
})

const LEARNED = [
  { template: '/sites/:id/visitors', learned_at: '2026-11-03T10:00:00Z', children: 1204 },
  { template: '/blog/:id/comments', learned_at: '2026-11-04T11:00:00Z', children: 14 },
]

let siteMutate = vi.fn()
let subMutate = vi.fn()

function loadedSite(site: Record<string, unknown>) {
  return { data: site, error: undefined, mutate: siteMutate }
}

function mount(site: Record<string, unknown> = makeSite(), plan: string | null = 'team') {
  useSiteMock.mockReturnValue(loadedSite(site))
  useSubscriptionMock.mockReturnValue(
    plan === null ? { data: undefined, error: undefined, mutate: subMutate } : { data: { plan_id: plan }, error: undefined, mutate: subMutate },
  )
  return render(<PrivacyPage siteId="s1" />)
}

function openAdvanced() {
  fireEvent.click(screen.getByRole('button', { name: 'Show' }))
}

function section(title: string): HTMLElement {
  const el = document.querySelector(`[data-kit-section="${title}"]`)
  if (!el) throw new Error(`no section ${title}`)
  return el as HTMLElement
}

async function save() {
  fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
}

beforeEach(() => {
  canEdit = true
  siteMutate = vi.fn().mockResolvedValue(undefined)
  subMutate = vi.fn().mockResolvedValue(undefined)
  updateSite.mockReset()
  updateSite.mockResolvedValue({})
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

describe('PrivacyPage: the page as drawn', () => {
  it('has the five sections in order, in the copy deck words, and none of the ones the rulings removed', () => {
    mount()
    const titles = [...document.querySelectorAll('[data-kit-section]')].map((s) => s.getAttribute('data-kit-section'))
    expect(titles).toEqual(['Visitor views', 'Data retention', 'Your own visits', 'Advanced', 'Text for your privacy policy'])
    expect(screen.getByText('Whether your team can look at one visitor at a time. Pulse collects the same data either way.')).toBeInTheDocument()
    expect(screen.getByText('Stop counting your own visits from this browser.')).toBeInTheDocument()
    expect(screen.getByText('How page addresses are grouped, left out or kept in your stats.')).toBeInTheDocument()
    expect(
      screen.getByText('Paste this into your site\'s privacy policy. The text here follows your settings, so copy it again after you change them.'),
    ).toBeInTheDocument()
    // R2, R3: the collection switches, Geographic, Hide unknown locations and the performance frequency are gone.
    for (const gone of ['Data and privacy', 'Page paths', 'Geographic', 'Hide unknown locations', 'Performance monitoring', 'Check frequency', 'Keep raw event data for']) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    // The page's one switch outside Advanced.
    expect(screen.getAllByRole('switch')).toHaveLength(1)
  })

  it('Visitor views: the switch is named by its row, agrees with the site, and the caption ends with the identity statement', () => {
    mount()
    const sw = screen.getByRole('switch', { name: 'Show the Visitors page' })
    expect(sw).toHaveAttribute('aria-checked', 'true')
    const row = section('Visitor views')
    expect(row.textContent).toContain('The Visitors page lists each visitor with their visits and the pages they read.')
    expect(row.textContent).toMatch(/This is fixed, not a setting\.$/)
    expect(row.textContent).toContain("The next day, they count as a new visitor.")
    expect(row.textContent).not.toMatch(/reader/)
    // Not dirty on open, whatever the retired identity column holds.
    expect(screen.queryByText(/Unsaved changes/i)).toBeNull()
  })

  it('Your own visits: Stop counting me opens =on and Count me again =off, each in a new tab, named in full', () => {
    mount()
    const stop = screen.getByRole('link', { name: 'Stop counting me on demo.test' })
    const again = screen.getByRole('link', { name: 'Count me again on demo.test' })
    expect(stop).toHaveAttribute('href', 'https://demo.test/?pulse-ignore=on')
    expect(again).toHaveAttribute('href', 'https://demo.test/?pulse-ignore=off')
    for (const a of [stop, again]) {
      expect(a).toHaveAttribute('target', '_blank')
      expect(a).toHaveAttribute('rel', 'noopener noreferrer')
      expect(a.textContent).toBe('Open')
    }
    expect(screen.getByText('Opens demo.test and stops counting your visits from this browser.')).toBeInTheDocument()
    expect(screen.getByText('Opens demo.test and counts your visits from this browser again.')).toBeInTheDocument()
    expect(section('Your own visits').textContent).toContain(
      "Do this once in each browser you use, and your site says what each link did. It lasts until you clear this browser's data for demo.test. Safari clears it by itself after 7 days without a visit.",
    )
  })

  it('Your own visits: the words name the readable domain, the links the stored one', () => {
    mount(makeSite({ domain: 'xn--mller-kva.de', display_domain: 'müller.de' }))
    const stop = screen.getByRole('link', { name: 'Stop counting me on müller.de' })
    expect(stop).toHaveAttribute('href', 'https://xn--mller-kva.de/?pulse-ignore=on')
  })
})

describe('PrivacyPage: data retention follows the plan (R26)', () => {
  it('shows the SITE\'s period, never one worked out from the plan', () => {
    // A business plan allows 24 months; the site says 12, and the page says what the site says.
    mount(makeSite({ data_retention_months: 12 }), 'business')
    const value = document.querySelector('[data-privacy-retention-value]')
    expect(value?.textContent).toBe('1 year')
    expect(value?.className ?? '').not.toMatch(/font-mono/)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('names the plan in the caption, and offers no upgrade on the top plans', () => {
    mount(makeSite({ data_retention_months: 24 }), 'team')
    expect(document.querySelector('[data-privacy-retention-value]')?.textContent).toBe('2 years')
    expect(section('Data retention').textContent).toContain(
      'The most your Team plan allows. Older visits and events are deleted once a day, with their journeys, CDN numbers and performance checks, and the dashboard starts from that day.',
    )
    expect(screen.queryByRole('link', { name: 'Upgrade' })).not.toBeInTheDocument()
  })

  it.each([
    ['free', 6, '6 months', 'Personal'],
    ['solo', 12, '1 year', 'Solo'],
  ])('below the top plans (%s) it offers more', (plan, months, words, planName) => {
    mount(makeSite({ data_retention_months: months }), plan)
    expect(document.querySelector('[data-privacy-retention-value]')?.textContent).toBe(words)
    expect(section('Data retention').textContent).toContain(`The most your ${planName} plan allows.`)
    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute('href', '/setup/plan')
    expect(section('Data retention').textContent).toContain('Upgrade to keep data for longer.')
  })

  it('while the plan loads, says only what holds whatever the plan', () => {
    mount(makeSite(), null)
    const text = section('Data retention').textContent ?? ''
    expect(text).toContain('Older visits and events are deleted once a day')
    expect(text).not.toMatch(/The most your/)
    expect(text).not.toMatch(/Personal/)
    expect(screen.queryByRole('link', { name: 'Upgrade' })).not.toBeInTheDocument()
  })

  it('a plan that fails to load says so, and Try again asks again', async () => {
    useSiteMock.mockReturnValue(loadedSite(makeSite()))
    useSubscriptionMock.mockReturnValue({ data: undefined, error: new Error('boom'), mutate: subMutate })
    render(<PrivacyPage siteId="s1" />)
    const alert = within(section('Data retention')).getByRole('alert')
    expect(alert.textContent).toContain("Couldn't load your plan's limits.")
    // The period is the site's, so it still shows.
    expect(document.querySelector('[data-privacy-retention-value]')?.textContent).toBe('2 years')
    await act(async () => {
      fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    })
    expect(subMutate).toHaveBeenCalledTimes(1)
  })

  it('never sends a retention value', async () => {
    mount()
    fireEvent.click(screen.getByRole('switch', { name: 'Show the Visitors page' }))
    await save()
    await waitFor(() => expect(updateSite).toHaveBeenCalledTimes(1))
    const [, payload] = updateSite.mock.calls[0] as [string, Record<string, unknown>]
    expect('data_retention_months' in payload).toBe(false)
  })
})

describe('PrivacyPage: Advanced', () => {
  it('is closed until opened, by a button that says what it does', () => {
    mount()
    const button = screen.getByRole('button', { name: 'Show' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelector('[data-privacy-advanced-body]')).toBeNull()
    expect(screen.queryByText('Rules')).not.toBeInTheDocument()
    fireEvent.click(button)
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('switch', { name: 'Group addresses that contain an ID' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Rules')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(document.querySelector('[data-privacy-advanced-body]')).toBeNull()
  })

  it('grouping: a change says that past visits are regrouped too', () => {
    mount()
    openAdvanced()
    const line = 'Past visits are regrouped too, as far back as Pulse keeps data.'
    expect(screen.queryByText(line)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Group addresses that contain an ID' }))
    expect(screen.getByText(line)).toBeInTheDocument()
  })

  it('the empty rules row, with its example', () => {
    mount()
    openAdvanced()
    const empty = document.querySelector('[data-privacy-rules-empty]') as HTMLElement
    expect(empty.textContent).toContain('No rules')
    expect(empty.textContent).toContain('Leave pages out of your stats, or show several addresses as one page.')
    expect(empty.textContent).toContain('Leave out · /admin/*')
    expect(within(empty).getByText('Example')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Rules' })).not.toBeInTheDocument()
  })

  it('the query parameters field is named by its row and holds the saved list', () => {
    mount(makeSite({ allowed_query_params: ['q', 'category'] }))
    openAdvanced()
    const field = screen.getByLabelText('Query parameters to keep') as HTMLInputElement
    expect(field.value).toBe('q, category')
    expect(field.placeholder).toBe('q, category, page')
    expect(section('Advanced').textContent).toContain('Separate them with commas. Changes apply to new visits.')
  })
})

describe('PrivacyPage: learned groups (PULSE-128)', () => {
  it.each([['missing', undefined], ['null', null], ['empty', []]])('show nothing when the field is %s', (_, value) => {
    const site = makeSite({ learned_dynamic_parents: value })
    if (value === undefined) delete (site as Record<string, unknown>).learned_dynamic_parents
    mount(site)
    openAdvanced()
    expect(screen.queryByText(/different IDs/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Pulse also found these folders/)).not.toBeInTheDocument()
  })

  it('one row per group: the grouped path in mono, its status leading the caption, the count with a thousands separator', () => {
    mount(makeSite({ learned_dynamic_parents: LEARNED }))
    openAdvanced()
    expect(screen.getByText('Pulse also found these folders hold many pages that differ only by an ID, and groups them too.')).toBeInTheDocument()
    const path = screen.getByText('/sites/:id/visitors/:id')
    expect(path.tagName).toBe('CODE')
    const captions = [...document.querySelectorAll('[data-privacy-learned]')]
    expect(captions[0].textContent).toBe(`Grouped since ${formatSiteDay(LEARNED[0].learned_at, 'Europe/Brussels')} · from 1,204 different IDs`)
    expect(captions[0].querySelector('[data-kit-status="live"]')).not.toBeNull()
    expect(captions[0].className).not.toMatch(/font-mono/)
    expect(screen.getAllByRole('button', { name: 'Keep separate' })).toHaveLength(2)
  })

  it('show only while grouping is on, and appear when it is turned on', () => {
    mount(makeSite({ auto_group_dynamic_paths: false, learned_dynamic_parents: LEARNED }))
    openAdvanced()
    expect(screen.queryByText('/sites/:id/visitors/:id')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Group addresses that contain an ID' }))
    expect(screen.getByText('/sites/:id/visitors/:id')).toBeInTheDocument()
  })

  it('Keep separate stages a keep rule (every :id becomes *), saves nothing by itself, and the row reads as kept', async () => {
    mount(makeSite({ learned_dynamic_parents: LEARNED }))
    openAdvanced()
    fireEvent.click(screen.getAllByRole('button', { name: 'Keep separate' })[0])
    expect(updateSite).not.toHaveBeenCalled()
    const caption = document.querySelectorAll('[data-privacy-learned]')[0]
    expect(caption.textContent).toBe('Kept separate · from 1,204 different IDs')
    expect(caption.querySelector('[data-kit-status="off"]')).not.toBeNull()
    // R24: the button stays in its place, dimmed.
    const buttons = screen.getAllByRole('button', { name: 'Keep separate' })
    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toBeDisabled()
    expect(buttons[1]).not.toBeDisabled()
    await waitFor(() => expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument())
    await save()
    await waitFor(() => expect(updateSite).toHaveBeenCalledTimes(1))
    const [, payload] = updateSite.mock.calls[0] as [string, { page_rules: unknown[] }]
    expect(payload.page_rules).toEqual([{ type: 'keep', pattern: '/sites/*/visitors/*' }])
  })
})

describe('PrivacyPage: rules', () => {
  it('Add rule adds a Leave out rule and puts the cursor in its address; the types read in the deck\'s words', () => {
    mount()
    openAdvanced()
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }))
    const table = screen.getByRole('table', { name: 'Rules' })
    const type = within(table).getByLabelText('Rule 1') as HTMLSelectElement
    expect(type.value).toBe('exclude')
    expect([...type.options].map((o) => o.textContent)).toEqual(['Leave out', 'Group', 'Keep separate'])
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent || h.getAttribute('aria-label'))).toEqual(['Rule', 'Addresses', 'Show as', 'Actions'])
    const addresses = within(table).getByLabelText('Rule 1 addresses')
    expect(addresses).toHaveFocus()
    expect(addresses).toHaveAttribute('placeholder', '/admin/*')
    // An empty rule just added is not an error yet.
    expect(screen.queryByText('Start the address with /.')).not.toBeInTheDocument()
    expect(section('Advanced').textContent).toContain('* stands for one part of an address, ** for one or more.')
    expect(section('Advanced').textContent).toContain('Visits to these pages stop counting, and past visits to them are hidden.')
  })

  it('a group rule asks what to show the addresses as; the others do not', () => {
    mount(makeSite({ page_rules: [{ type: 'keep', pattern: '/a/*' }, { type: 'group', pattern: '/blog/*', label: '/blog/:id' }] }))
    openAdvanced()
    expect(screen.queryByLabelText('Rule 1 shown as')).not.toBeInTheDocument()
    expect((screen.getByLabelText('Rule 2 shown as') as HTMLInputElement).value).toBe('/blog/:id')
    expect(screen.getByLabelText('Rule 2 shown as')).toHaveAttribute('placeholder', '/sites/:id')
    fireEvent.change(screen.getByLabelText('Rule 1'), { target: { value: 'group' } })
    expect(screen.getByLabelText('Rule 1 shown as')).toBeInTheDocument()
  })

  it('an address that does not start with / says so at once', () => {
    mount(makeSite({ page_rules: [{ type: 'exclude', pattern: '/admin/*' }] }))
    openAdvanced()
    fireEvent.change(screen.getByLabelText('Rule 1 addresses'), { target: { value: 'admin' } })
    expect(screen.getByText('Start the address with /.')).toBeInTheDocument()
    expect(screen.getByLabelText('Rule 1 addresses')).toHaveAttribute('aria-invalid', 'true')
  })

  it('a save with an unfinished rule sends nothing, opens Advanced and points at the field', async () => {
    mount()
    openAdvanced()
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    await save()
    await waitFor(() => expect(screen.getByText('Start the address with /.')).toBeInTheDocument())
    expect(updateSite).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Rule 1 addresses')).toHaveFocus()
    // The bar keeps the draft: no Saved.
    expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('a group rule needs a "show as" that starts with /', async () => {
    mount(makeSite({ page_rules: [{ type: 'group', pattern: '/orders/*', label: '/orders/:id' }] }))
    openAdvanced()
    fireEvent.change(screen.getByLabelText('Rule 1 shown as'), { target: { value: '' } })
    await save()
    await waitFor(() => expect(screen.getByText('Start it with /, like /orders/:id.')).toBeInTheDocument())
    expect(updateSite).not.toHaveBeenCalled()
  })

  it('more than 50 rules is refused before the server sees it', async () => {
    const rules = Array.from({ length: 50 }, (_, i) => ({ type: 'exclude', pattern: `/p${i}` }))
    mount(makeSite({ page_rules: rules }))
    openAdvanced()
    expect(screen.queryByText('Use 50 rules or fewer.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }))
    fireEvent.change(screen.getByLabelText('Rule 51 addresses'), { target: { value: '/p50' } })
    expect(screen.getByText('Use 50 rules or fewer.')).toBeInTheDocument()
    await save()
    await waitFor(() => expect(screen.getByText('Use 50 rules or fewer.')).toHaveFocus())
    expect(updateSite).not.toHaveBeenCalled()
  })

  it('moves and removes rules, and sends them in their new order, trimmed and without a stale label', async () => {
    mount(makeSite({ page_rules: [{ type: 'exclude', pattern: '/a/*' }, { type: 'group', pattern: '/b/*', label: '/b/:id' }] }))
    openAdvanced()
    expect(screen.getByRole('button', { name: 'Move rule 1 up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move rule 2 down' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Move rule 2 up' }))
    expect((screen.getByLabelText('Rule 1 addresses') as HTMLInputElement).value).toBe('/b/*')
    // Group → Leave out keeps the label in the draft (switching back restores it) but never sends it.
    fireEvent.change(screen.getByLabelText('Rule 1'), { target: { value: 'exclude' } })
    fireEvent.change(screen.getByLabelText('Rule 2 addresses'), { target: { value: '  /a/**  ' } })
    await save()
    await waitFor(() => expect(updateSite).toHaveBeenCalledTimes(1))
    const [, payload] = updateSite.mock.calls[0] as [string, { page_rules: unknown[] }]
    expect(payload.page_rules).toEqual([
      { type: 'exclude', pattern: '/b/*' },
      { type: 'exclude', pattern: '/a/**' },
    ])
  })

  it('removing the last rule sends an empty list', async () => {
    mount(makeSite({ page_rules: [{ type: 'exclude', pattern: '/admin/*' }] }))
    openAdvanced()
    fireEvent.click(screen.getByRole('button', { name: 'Remove rule 1' }))
    expect(document.querySelector('[data-privacy-rules-empty]')).not.toBeNull()
    await save()
    await waitFor(() => expect(updateSite).toHaveBeenCalledTimes(1))
    const [, payload] = updateSite.mock.calls[0] as [string, { page_rules: unknown[] }]
    expect(payload.page_rules).toEqual([])
  })
})

describe('PrivacyPage: saving', () => {
  it('sends what the page owns and nothing else: no retention, no collection switches, no identity window', async () => {
    mount(makeSite({ page_rules: [{ type: 'exclude', pattern: '/admin/*' }], allowed_query_params: ['q'] }))
    fireEvent.click(screen.getByRole('switch', { name: 'Show the Visitors page' }))
    await waitFor(() => expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument())
    await save()
    await waitFor(() => expect(updateSite).toHaveBeenCalledTimes(1))
    const [id, payload] = updateSite.mock.calls[0] as [string, Record<string, unknown>]
    expect(id).toBe('s1')
    expect(payload).toEqual({
      name: 'Demo',
      visitor_views_enabled: false,
      auto_group_dynamic_paths: true,
      allowed_query_params: ['q'],
    })
    // Unchanged rules stay home: the server reprocesses stored visits whenever the rules it is sent differ in text.
    expect('page_rules' in payload).toBe(false)
  })

  it('splits the query parameters the way they are saved', async () => {
    mount()
    openAdvanced()
    fireEvent.change(screen.getByLabelText('Query parameters to keep'), { target: { value: ' q, ,category ,' } })
    await save()
    await waitFor(() => expect(updateSite).toHaveBeenCalledTimes(1))
    const [, payload] = updateSite.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload.allowed_query_params).toEqual(['q', 'category'])
  })

  it('a saved change: the bar says Saved, no toast, the site is read again, and nothing is unsaved', async () => {
    mount()
    fireEvent.click(screen.getByRole('switch', { name: 'Show the Visitors page' }))
    await save()
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument())
    expect(toast.success).not.toHaveBeenCalled()
    expect(siteMutate).toHaveBeenCalled()
    expect(screen.queryByText(/Unsaved changes/i)).toBeNull()
    expect(screen.getByRole('switch', { name: 'Show the Visitors page' })).toHaveAttribute('aria-checked', 'false')
  })

  it('a failed save says so in the deck\'s words, never "Saved", and keeps the draft', async () => {
    mount()
    updateSite.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { status: 403 }))
    fireEvent.click(screen.getByRole('switch', { name: 'Show the Visitors page' }))
    await save()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't save. Try again."))
    expect(toast.error).not.toHaveBeenCalledWith('Invalid credentials')
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Show the Visitors page' })).toHaveAttribute('aria-checked', 'false')
  })

  it('Discard puts every field back', async () => {
    mount(makeSite({ allowed_query_params: ['q'] }))
    openAdvanced()
    fireEvent.click(screen.getByRole('switch', { name: 'Show the Visitors page' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Group addresses that contain an ID' }))
    fireEvent.change(screen.getByLabelText('Query parameters to keep'), { target: { value: 'page' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.getByRole('switch', { name: 'Show the Visitors page' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: 'Group addresses that contain an ID' })).toHaveAttribute('aria-checked', 'true')
    expect((screen.getByLabelText('Query parameters to keep') as HTMLInputElement).value).toBe('q')
    expect(document.querySelector('[data-privacy-rules-empty]')).not.toBeNull()
    // The bar leaves with an exit animation, so it is gone a moment later rather than at once.
    await waitFor(() => expect(screen.queryByText(/Unsaved changes/i)).toBeNull())
  })

  it('spacing in the parameter list alone is not an unsaved change', () => {
    mount(makeSite({ allowed_query_params: ['q', 'category'] }))
    openAdvanced()
    fireEvent.change(screen.getByLabelText('Query parameters to keep'), { target: { value: 'q,category' } })
    expect(screen.queryByText(/Unsaved changes/i)).toBeNull()
  })
})

describe('PrivacyPage: no unsaved changes on a fresh load (PULSE-130)', () => {
  const pending = { data: undefined, error: undefined, mutate: vi.fn() }

  it('the plan arrives before the site', () => {
    useSiteMock.mockReturnValue(pending)
    useSubscriptionMock.mockReturnValue({ data: { plan_id: 'team' }, error: undefined, mutate: subMutate })
    const { rerender } = render(<PrivacyPage siteId="s1" />)
    useSiteMock.mockReturnValue(loadedSite(makeSite()))
    act(() => {
      rerender(<PrivacyPage siteId="s1" />)
    })
    expect(screen.getByRole('switch', { name: 'Show the Visitors page' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByText(/Unsaved changes/i)).toBeNull()
  })

  it('the site arrives before the plan', () => {
    useSiteMock.mockReturnValue(loadedSite(makeSite()))
    useSubscriptionMock.mockReturnValue({ data: undefined, error: undefined, mutate: subMutate })
    const { rerender } = render(<PrivacyPage siteId="s1" />)
    useSubscriptionMock.mockReturnValue({ data: { plan_id: 'team' }, error: undefined, mutate: subMutate })
    act(() => {
      rerender(<PrivacyPage siteId="s1" />)
    })
    expect(screen.queryByText(/Unsaved changes/i)).toBeNull()
  })

  it('picking another site shows that site, never the last one\'s draft', () => {
    useSiteMock.mockReturnValue(loadedSite(makeSite()))
    useSubscriptionMock.mockReturnValue({ data: { plan_id: 'team' }, error: undefined, mutate: subMutate })
    const { rerender } = render(<PrivacyPage siteId="s1" />)
    fireEvent.click(screen.getByRole('switch', { name: 'Show the Visitors page' }))
    useSiteMock.mockReturnValue(loadedSite(makeSite({ id: 's2', name: 'Other', domain: 'other.test', visitor_views_enabled: false })))
    act(() => {
      rerender(<PrivacyPage siteId="s2" />)
    })
    expect(screen.getByRole('switch', { name: 'Show the Visitors page' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('link', { name: 'Stop counting me on other.test' })).toBeInTheDocument()
    expect(screen.queryByText(/Unsaved changes/i)).toBeNull()
  })
})

describe('PrivacyPage: loading, errors and access', () => {
  it('shows the loading rows while the site loads', () => {
    useSiteMock.mockReturnValue({ data: undefined, error: undefined, mutate: siteMutate })
    useSubscriptionMock.mockReturnValue({ data: undefined, error: undefined, mutate: subMutate })
    render(<PrivacyPage siteId="s1" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('a site that fails to load says what failed, and Try again asks again', async () => {
    useSiteMock.mockReturnValue({ data: undefined, error: new Error('boom'), mutate: siteMutate })
    useSubscriptionMock.mockReturnValue({ data: undefined, error: undefined, mutate: subMutate })
    render(<PrivacyPage siteId="s1" />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain("Couldn't load this site's privacy settings")
    expect(alert.textContent).not.toMatch(/usually temporary/)
    await act(async () => {
      fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    })
    expect(siteMutate).toHaveBeenCalledTimes(1)
  })

  it('someone who may not change privacy settings reads who can, and gets no controls', () => {
    canEdit = false
    mount()
    expect(screen.getByRole('heading', { name: 'Owners and admins only' })).toBeInTheDocument()
    expect(screen.getByText("Only your team's owners and admins can change privacy settings.")).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Stop counting me/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Unsaved changes/i)).toBeNull()
  })
})

describe('PrivacyPage: text for your privacy policy', () => {
  it('the legal note, then the change notice, then the text generated from the saved site', () => {
    const site = makeSite()
    mount(site)
    const block = document.querySelector('[data-privacy-policy]') as HTMLElement
    const legal = within(block).getByText('This text is not legal advice. Check your privacy policy with a lawyer.')
    const notice = within(block).getByText(IDENTITY_COPY.policyNotice)
    expect(legal.nextElementSibling).toBe(notice)
    // generatePrivacySnippet only reads the site's fields, and the fixture carries every one it reads.
    expect(block.querySelector('pre')?.textContent).toBe(generatePrivacySnippet(site as unknown as Parameters<typeof generatePrivacySnippet>[0]))
    expect(block.querySelector('pre')?.textContent).toContain('Raw event data is automatically deleted after 2 years.')
  })

  it('copies the text, and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    mount()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy policy text' }))
    })
    expect(writeText).toHaveBeenCalledWith(document.querySelector('[data-privacy-policy] pre')?.textContent)
    expect(toast.success).toHaveBeenCalledWith('Policy text copied')
  })

  it('a copy the browser refuses says what to do instead', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true })
    mount()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy policy text' }))
    })
    expect(toast.error).toHaveBeenCalledWith("Couldn't copy the text. Select it and copy it by hand.")
    expect(toast.success).not.toHaveBeenCalled()
  })
})

describe('PrivacyPage: the words', () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const files = ['PrivacyPage.tsx', 'RulesEditor.tsx', 'rules.ts']

  it('no em dash, en dash or three-dot ellipsis in any string a person reads', () => {
    for (const f of files) {
      const stripped = readFileSync(path.join(dir, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      const literals = stripped.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g) ?? []
      expect(literals.filter((s) => /[—–]/.test(s) || /\.\.\./.test(s)), f).toEqual([])
    }
  })

  it('never falls back on Facet\'s auth error sentence', () => {
    for (const f of files) {
      expect(readFileSync(path.join(dir, f), 'utf8'), f).not.toMatch(/getAuthErrorMessage/)
    }
  })
})
