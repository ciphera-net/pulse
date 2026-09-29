import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

/**
 * PULSE-130: a fresh load of Settings → Privacy must not show "Unsaved changes".
 *
 * The cause was ORDER-dependent. The site effect seeds the dirty baseline with
 * psiFrequency 'weekly' (hard-coded), and the PSI effect only corrected an
 * EXISTING baseline, once. When the performance config resolved BEFORE the
 * site, the PSI effect set state to the real frequency ('daily' on most sites)
 * while there was no baseline to correct; the site effect then wrote 'weekly'
 * into it, so state and baseline disagreed on a page nobody had touched. Every
 * other test here mocks frequency 'weekly', the one value that hides it.
 */

const useSiteMock = vi.fn()
const usePsiMock = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useSite: () => useSiteMock(),
  useSubscription: () => ({ data: { plan_id: 'solo' }, error: undefined, mutate: vi.fn() }),
  usePerformanceConfig: () => usePsiMock(),
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

const site = {
  id: 's1', name: 'Demo', domain: 'demo.test',
  collect_page_paths: true, collect_referrers: true, collect_device_info: true,
  collect_screen_resolution: true, collect_audience_data: true, collect_geo_data: 'full',
  hide_unknown_locations: false, data_retention_months: 6, auto_group_dynamic_paths: true,
  page_rules: [] as unknown[], allowed_query_params: [] as string[], filter_bots: true,
}
const loaded = (data: unknown) => ({ data, error: undefined, mutate: vi.fn().mockResolvedValue(undefined) })
const pending = { data: undefined, error: undefined, mutate: vi.fn() }
const daily = { enabled: true, frequency: 'daily' }

describe('SitePrivacyTab: no unsaved changes on a fresh load (PULSE-130)', () => {
  beforeEach(() => {
    useSiteMock.mockReset()
    usePsiMock.mockReset()
  })

  it('performance config arrives BEFORE the site (the race that produced the bug)', () => {
    useSiteMock.mockReturnValue(pending)
    usePsiMock.mockReturnValue(loaded(daily))
    const { rerender } = render(<SitePrivacyTab siteId="s1" />)
    useSiteMock.mockReturnValue(loaded(site))
    act(() => { rerender(<SitePrivacyTab siteId="s1" />) })
    expect(screen.queryByText(/Unsaved changes/i)).toBeNull()
  })

  it('the site arrives BEFORE the performance config', () => {
    useSiteMock.mockReturnValue(loaded(site))
    usePsiMock.mockReturnValue(pending)
    const { rerender } = render(<SitePrivacyTab siteId="s1" />)
    usePsiMock.mockReturnValue(loaded(daily))
    act(() => { rerender(<SitePrivacyTab siteId="s1" />) })
    expect(screen.queryByText(/Unsaved changes/i)).toBeNull()
  })

  it('both arrive together', () => {
    useSiteMock.mockReturnValue(loaded(site))
    usePsiMock.mockReturnValue(loaded(daily))
    render(<SitePrivacyTab siteId="s1" />)
    expect(screen.queryByText(/Unsaved changes/i)).toBeNull()
  })
})
