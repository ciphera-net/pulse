import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * The visitor-identity window — phase 3 of
 * docs/plans/11-09-2026-configurable-identity-window-design.md, decisions
 * B / D1 / E2 (owner, 11-09-2026; artifact c42c362f).
 *
 * Three things a test can pin and a screenshot cannot:
 *   D1 · an UNSET site (stored 0) reads "Calendar month (current)" and never
 *        preselects 30 days — 0 and 30 are different keys, and saving 30 on an
 *        unset site re-mints every identity on it;
 *   E2 · the footer is quiet until the Select differs from the SAVED value;
 *   the payload carries the raw column value, and the Visitor views caption
 *   follows the saved window instead of asserting the month.
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
// without one — so without this mock "Unsaved changes" can never appear and a
// dirty-state assertion passes vacuously (the visitor-views test's lesson).
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
  visitor_views_enabled: true,
  // The column is NOT NULL DEFAULT 0 on the server: an unset site sends 0.
  identity_window_days: 0,
  ...over,
})

function mountWith(site: Record<string, unknown>) {
  useSiteMock.mockReturnValue({ data: site, error: undefined, mutate: vi.fn().mockResolvedValue(undefined) })
  const utils = render(<SitePrivacyTab siteId="s1" />)
  const select = () => screen.getByLabelText('Visitor identity window') as HTMLSelectElement
  const options = () => [...select().options].map((o) => o.textContent)
  const footer = () => utils.container.querySelector('[data-identity-window-footer]') as HTMLElement
  return { ...utils, select, options, footer }
}

beforeEach(() => {
  updateSite.mockReset()
  updateSite.mockResolvedValue({})
})

describe('SitePrivacyTab — the visitor-identity panel (decision B)', () => {
  it('is its own panel, directly below Visitor views, with an entry in the section rail', () => {
    mountWith(makeSite())
    const sections = [...document.querySelectorAll('section[id^="section-"]')].map((s) => s.id)
    expect(sections.indexOf('section-visitor-identity')).toBe(sections.indexOf('section-visitor-views') + 1)
    expect(screen.getByRole('heading', { name: /^visitor identity$/i })).toBeInTheDocument()
    const rail = screen.getByRole('navigation', { name: 'Privacy sections' })
    expect(rail.textContent).toContain('Visitor identity')
    expect(screen.getByText('Recognise a returning reader for')).toBeInTheDocument()
  })

  it('offers the four windows the owner chose, and only those, on a site with a real window', () => {
    const { select, options } = mountWith(makeSite({ identity_window_days: 7 }))
    expect(select().value).toBe('7')
    expect(options()).toEqual(['Session only', '24 hours', '7 days', '30 days'])
  })
})

describe('SitePrivacyTab — the unset default (decision D1)', () => {
  it('🔴 reads "Calendar month (current)" and never preselects 30 days', () => {
    const { select, options } = mountWith(makeSite({ identity_window_days: 0 }))
    expect(select().value).toBe('0')
    expect(select().selectedOptions[0].textContent).toBe('Calendar month (current)')
    expect(select().value).not.toBe('30')
    // pushed in AFTER the four options, exactly as Data Retention does it
    expect(options()).toEqual(['Session only', '24 hours', '7 days', '30 days', 'Calendar month (current)'])
  })

  it('treats a payload that predates the column as unset, not as 30 days — and the copy agrees with the control', () => {
    const site = makeSite()
    delete (site as Record<string, unknown>).identity_window_days
    const { select, footer } = mountWith(site)
    expect(select().value).toBe('0')
    expect(select().selectedOptions[0].textContent).toBe('Calendar month (current)')
    // The Select says the calendar month, so the footer and the caption beside
    // it must say the same — the authed record's column is NOT NULL DEFAULT 0,
    // and one screen may not call the same site "unset" and "unknown" at once.
    expect(footer().textContent).toContain('rest of the calendar month')
    expect(screen.getByText(/reset every calendar month/)).toBeInTheDocument()
  })

  it('drops the "(current)" entry the moment a real window is chosen', () => {
    const { select, options } = mountWith(makeSite({ identity_window_days: 0 }))
    fireEvent.change(select(), { target: { value: '7' } })
    expect(select().value).toBe('7')
    expect(options()).toEqual(['Session only', '24 hours', '7 days', '30 days'])
  })
})

describe('SitePrivacyTab — the footer (decision E2)', () => {
  it('is NOT dirty on open — state and baseline come from the same source', async () => {
    mountWith(makeSite({ identity_window_days: 7 }))
    await waitFor(() => expect(screen.getByText('Recognise a returning reader for')).toBeInTheDocument())
    expect(screen.queryByText(/Unsaved changes/i)).toBeNull()
  })

  it('stays quiet — what the site does today — until the Select differs from the saved value', () => {
    const { select, footer } = mountWith(makeSite({ identity_window_days: 0 }))
    expect(footer().getAttribute('data-identity-window-footer')).toBe('quiet')
    expect(footer().className).not.toContain('border-l-brand-orange')
    expect(footer().textContent).toContain('recognised for the rest of the calendar month')
    expect(footer().textContent).not.toContain('re-mints')

    fireEvent.change(select(), { target: { value: '1' } })
    expect(footer().getAttribute('data-identity-window-footer')).toBe('warning')
    expect(footer().className).toContain('border-l-2')
    expect(footer().className).toContain('border-l-brand-orange')
    expect(footer().textContent).toContain('Saving this re-mints every identity from now on.')
    expect(footer().textContent).toContain('cannot be applied backwards')

    // choosing the saved value again silences it
    fireEvent.change(select(), { target: { value: '0' } })
    expect(footer().getAttribute('data-identity-window-footer')).toBe('quiet')
  })

  it('describes today in the saved window’s words, not the month, on a site set to Session only', () => {
    const { footer } = mountWith(makeSite({ identity_window_days: -1 }))
    expect(footer().textContent).toContain('never recognised on a later visit')
    expect(footer().textContent).not.toMatch(/calendar month/)
  })

  it('discard restores the saved value and silences the footer', async () => {
    const { select, footer } = mountWith(makeSite({ identity_window_days: 7 }))
    fireEvent.change(select(), { target: { value: '-1' } })
    expect(footer().getAttribute('data-identity-window-footer')).toBe('warning')
    await waitFor(() => expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /discard/i }))
    expect(select().value).toBe('7')
    expect(footer().getAttribute('data-identity-window-footer')).toBe('quiet')
  })
})

describe('SitePrivacyTab — the wire', () => {
  it('saves identity_window_days as the raw column value, a number', async () => {
    const { select } = mountWith(makeSite({ identity_window_days: 0 }))
    fireEvent.change(select(), { target: { value: '1' } })
    await waitFor(() => expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(updateSite).toHaveBeenCalledTimes(1))
    const [id, payload] = updateSite.mock.calls[0] as [string, Record<string, unknown>]
    expect(id).toBe('s1')
    expect(payload.identity_window_days).toBe(1)
    expect(typeof payload.identity_window_days).toBe('number')
    // and the site's name travels with it — PUT requires it, and sending the
    // domain instead once renamed a site to its domain (VisitorsOffRoom's scar)
    expect(payload.name).toBe('Demo')
  })

  it('sends the saved value unchanged when nothing on this panel was touched', async () => {
    const { container } = mountWith(makeSite({ identity_window_days: 7 }))
    // dirty the tab elsewhere
    const toggles = container.querySelectorAll('[role="switch"]')
    fireEvent.click(toggles[0])
    await waitFor(() => expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(updateSite).toHaveBeenCalledTimes(1))
    const payload = updateSite.mock.calls[0][1] as Record<string, unknown>
    expect(payload.identity_window_days).toBe(7)
  })
})

describe('SitePrivacyTab — the Visitor views caption follows the saved window (phase 4)', () => {
  it('asserts the calendar month only on a site that is on the calendar month', () => {
    mountWith(makeSite({ identity_window_days: 0 }))
    expect(screen.getByText(/reset every calendar month/)).toBeInTheDocument()
  })

  it('says a returning reader is never recognised on a site set to Session only', () => {
    mountWith(makeSite({ identity_window_days: -1 }))
    expect(screen.queryByText(/reset every calendar month/)).toBeNull()
    const caption = screen.getByText(/Turns on the Visitors page/)
    expect(caption.textContent).toContain('never recognised on a later visit')
  })

  it('names the window as "up to" on a rolling window, never "exactly"', () => {
    mountWith(makeSite({ identity_window_days: 30 }))
    const caption = screen.getByText(/Turns on the Visitors page/)
    expect(caption.textContent).toContain('for up to 30 days')
    expect(caption.textContent).not.toMatch(/calendar month|exactly/)
  })
})
