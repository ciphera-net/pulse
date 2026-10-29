import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { IDENTITY_COPY } from '@/lib/visitors/identityWindow'

/**
 * Visitor identity on the Privacy tab, one-day identity
 * (docs/plans/25-10-2026-pulse-one-day-identity-copy.md §6, decisions S-C and P-A).
 *
 * The per-site identity window is retired: a reader is recognised for one day
 * at most and there is no setting. So the tab has no Visitor identity panel and
 * no rail entry for one, the identity statement ends the Visitor views caption,
 * a save never sends identity_window_days (a stored value has no effect), and a
 * muted notice under the legal note tells a site that pasted the earlier policy
 * text to replace it.
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
  visitor_views_enabled: true,
  // Old rows still carry the retired column; nothing on the tab may read it.
  identity_window_days: 0,
  ...over,
})

function mountWith(site: Record<string, unknown>) {
  useSiteMock.mockReturnValue({ data: site, error: undefined, mutate: vi.fn().mockResolvedValue(undefined) })
  const utils = render(<SitePrivacyTab siteId="s1" />)
  const caption = () => screen.getByText(/Turns on the Visitors page/)
  return { ...utils, caption }
}

beforeEach(() => {
  updateSite.mockReset()
  updateSite.mockResolvedValue({})
})

describe('SitePrivacyTab: no Visitor identity panel (decision S-C)', () => {
  it('has no identity section, heading, Select, footer or rail entry', () => {
    const { container } = mountWith(makeSite({ identity_window_days: 7 }))
    expect(container.querySelector('#section-visitor-identity')).toBeNull()
    expect(screen.queryByRole('heading', { name: /^visitor identity$/i })).toBeNull()
    expect(screen.queryByLabelText('Visitor identity window')).toBeNull()
    expect(container.querySelector('[data-identity-window-footer]')).toBeNull()
    const rail = screen.getByRole('navigation', { name: 'Privacy sections' })
    expect(rail.textContent).not.toContain('Visitor identity')
    expect(rail.textContent).toContain('Visitor views')
  })

  it('is not dirty on open, whatever the retired column holds', async () => {
    mountWith(makeSite({ identity_window_days: 7 }))
    await waitFor(() => expect(screen.getByText(/Turns on the Visitors page/)).toBeInTheDocument())
    expect(screen.queryByText(/Unsaved changes/i)).toBeNull()
  })
})

describe('SitePrivacyTab: the Visitor views caption carries the identity statement (C1)', () => {
  it('ends with the statement, and says "one day at most" once', () => {
    const { caption } = mountWith(makeSite())
    const text = caption().textContent ?? ''
    expect(text.endsWith(IDENTITY_COPY.settingsStatement)).toBe(true)
    expect(text).not.toContain(IDENTITY_COPY.scope)
    expect(text.match(/one day at most/g)).toHaveLength(1)
    expect(text).toContain('Turning it on or off is recorded in your audit trail')
  })

  it('reads the same on every site, whatever value the retired column holds', () => {
    const texts = new Set<string>()
    for (const days of [-1, 0, 1, 7, 30, undefined]) {
      const site = makeSite({ identity_window_days: days })
      if (days === undefined) delete (site as Record<string, unknown>).identity_window_days
      const { caption, unmount } = mountWith(site)
      texts.add(caption().textContent ?? '')
      unmount()
    }
    expect(texts.size).toBe(1)
    const [text] = texts
    expect(text).not.toMatch(/calendar month|Session only|up to (?:7|30) days|exactly/)
  })
})

describe('SitePrivacyTab: the wire', () => {
  it('never sends identity_window_days, so a save leaves the stored value alone', async () => {
    const { container } = mountWith(makeSite({ identity_window_days: 7 }))
    fireEvent.click(container.querySelectorAll('[role="switch"]')[0])
    await waitFor(() => expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(updateSite).toHaveBeenCalledTimes(1))
    const [id, payload] = updateSite.mock.calls[0] as [string, Record<string, unknown>]
    expect(id).toBe('s1')
    expect('identity_window_days' in payload).toBe(false)
    // and the site's name travels with it. PUT requires it, and sending the
    // domain instead once renamed a site to its domain (VisitorsOffRoom's scar)
    expect(payload.name).toBe('Demo')
  })
})

describe('SitePrivacyTab: the policy-text notice (decision P-A)', () => {
  it('is a muted line directly under the legal note, above the policy text', () => {
    const { container } = mountWith(makeSite())
    const section = container.querySelector('#section-privacy-policy') as HTMLElement
    const legal = screen.getByText(/is not legal advice/)
    const notice = screen.getByText(IDENTITY_COPY.policyNotice)
    expect(section.contains(notice)).toBe(true)
    expect(legal.nextElementSibling).toBe(notice)
    expect(notice.tagName).toBe('P')
    expect(notice.className).toContain('text-muted-foreground')
    // nothing louder than the line above it: no rule, no fill
    expect(notice.className).not.toMatch(/border|bg-/)
    const pre = section.querySelector('pre') as HTMLElement
    expect(notice.compareDocumentPosition(pre) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
