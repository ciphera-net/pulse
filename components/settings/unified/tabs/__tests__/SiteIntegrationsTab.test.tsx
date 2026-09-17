import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { DESTRUCTIVE_OUTLINE } from '@/components/settings/unified/DangerZone'

// --- Mocks ---------------------------------------------------------------

let mockCanManage = true
vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => mockCanManage,
}))

const useGSCStatus = vi.fn()
const useBunnyStatus = vi.fn()
const useBingStatus = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useGSCStatus: (...a: unknown[]) => useGSCStatus(...a),
  useBunnyStatus: (...a: unknown[]) => useBunnyStatus(...a),
  useBingStatus: (...a: unknown[]) => useBingStatus(...a),
}))

const getGSCAuthURL = vi.fn().mockResolvedValue({ auth_url: 'https://accounts.google.com/o/oauth2/auth' })
const disconnectGSC = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/gsc', () => ({
  getGSCAuthURL: (...a: unknown[]) => getGSCAuthURL(...a),
  disconnectGSC: (...a: unknown[]) => disconnectGSC(...a),
}))

const getBunnyPullZones = vi.fn().mockResolvedValue({ pull_zones: [{ id: 1, name: 'zone-a' }, { id: 2, name: 'zone-b' }] })
const connectBunny = vi.fn().mockResolvedValue(undefined)
const disconnectBunny = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/bunny', () => ({
  getBunnyPullZones: (...a: unknown[]) => getBunnyPullZones(...a),
  connectBunny: (...a: unknown[]) => connectBunny(...a),
  disconnectBunny: (...a: unknown[]) => disconnectBunny(...a),
}))

const listBingSites = vi.fn().mockResolvedValue({
  sites: [
    { url: 'https://example.com/', is_verified: true },
    { url: 'http://unverified.example/', is_verified: false },
  ],
})
const connectBing = vi.fn().mockResolvedValue(undefined)
const disconnectBing = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/bing', () => ({
  listBingSites: (...a: unknown[]) => listBingSites(...a),
  connectBing: (...a: unknown[]) => connectBing(...a),
  disconnectBing: (...a: unknown[]) => disconnectBing(...a),
}))

// ConfirmDialog + SettingsErrorState are exercised by their own suites, so
// stub them to markers so this smoke render stays focused on the panel composition.
vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, title }: { open: boolean; title: string }) =>
    open ? <div data-testid="confirm-dialog">{title}</div> : null,
}))
vi.mock('@/components/settings/SettingsErrorState', () => ({
  SettingsErrorState: ({ message }: { message: string }) => <div data-testid="error-banner">{message}</div>,
}))

vi.mock('@ciphera-net/facet', () => ({
  // `@/lib/utils` re-exports cn from facet; the real panels + StatusChip call it.
  cn: (...args: any[]) => args.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  Select: ({ value, onChange, options, placeholder, 'aria-label': ariaLabel }: any) => (
    <select aria-label={ariaLabel} value={value} onChange={e => onChange?.(e.target.value)}>
      <option value="">{placeholder}</option>
      {options?.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
  Spinner: () => <span data-testid="spinner" />,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

import SiteIntegrationsTab from '../SiteIntegrationsTab'
import { toast } from '@ciphera-net/facet'

const mutateGSC = vi.fn().mockResolvedValue(undefined)
const mutateBunny = vi.fn().mockResolvedValue(undefined)
const mutateBing = vi.fn().mockResolvedValue(undefined)

function gscState(over: Record<string, unknown> = {}) {
  return { data: { connected: false }, error: undefined, isLoading: false, mutate: mutateGSC, ...over }
}
function bunnyState(over: Record<string, unknown> = {}) {
  return { data: { connected: false }, error: undefined, isLoading: false, mutate: mutateBunny, ...over }
}
function bingState(over: Record<string, unknown> = {}) {
  return { data: { connected: false }, error: undefined, isLoading: false, mutate: mutateBing, ...over }
}

beforeEach(() => {
  mockCanManage = true
  useGSCStatus.mockReset().mockReturnValue(gscState())
  useBunnyStatus.mockReset().mockReturnValue(bunnyState())
  useBingStatus.mockReset().mockReturnValue(bingState())
  getGSCAuthURL.mockClear()
  disconnectGSC.mockClear()
  getBunnyPullZones.mockClear()
  connectBunny.mockClear()
  disconnectBunny.mockClear()
  mutateGSC.mockClear()
  mutateBunny.mockClear()
  mutateBing.mockClear()
  listBingSites.mockClear()
  connectBing.mockClear()
  disconnectBing.mockClear()
  ;(toast.success as any).mockClear?.()
  ;(toast.error as any).mockClear?.()
})


// Scopes a query to one integration row.
//
// The generic "Connect" label is shared by every row that is not GSC (which says "Connect with
// Google"), so a global getByRole was only unambiguous while exactly one such row existed. It
// broke the moment a third integration was added, the same class of brittleness as an
// exact-list assertion. Walking up from the row's heading keeps these assertions addressing the
// integration they name, and keeps them working when a fourth arrives.
function row(name: string): HTMLElement {
  const heading = screen.getByText(name)
  const container = heading.closest('div.px-5')?.parentElement
  if (!container) throw new Error(`could not find the integration row for ${name}`)
  return container as HTMLElement
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const SOURCE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'SiteIntegrationsTab.tsx',
)

describe('SiteIntegrationsTab (Facet structured panels)', () => {
  it('renders every integration as a row in ONE Integrations panel with Connect actions', () => {
    render(<SiteIntegrationsTab siteId="s1" />)
    expect(screen.getByText('Integrations')).toBeInTheDocument()
    expect(screen.getByText('Google Search Console')).toBeInTheDocument()
    expect(screen.getByText('Bing Webmaster Tools')).toBeInTheDocument()
    expect(screen.getByText('Bunny CDN')).toBeInTheDocument()
    // Connect is the CTA on each disconnected row, asserted per row rather than globally.
    expect(screen.getByRole('button', { name: /Connect with Google/i })).toBeInTheDocument()
    expect(within(row('Bing Webmaster Tools')).getByRole('button', { name: /^Connect$/i })).toBeInTheDocument()
    expect(within(row('Bunny CDN')).getByRole('button', { name: /^Connect$/i })).toBeInTheDocument()
  })

  it('reveals the Bing inline setup form and lists only verified properties', async () => {
    render(<SiteIntegrationsTab siteId="s1" />)
    fireEvent.click(within(row('Bing Webmaster Tools')).getByRole('button', { name: /^Connect$/i }))

    const keyField = screen.getByLabelText('API key')
    expect(keyField).toBeInTheDocument()
    fireEvent.change(keyField, { target: { value: 'bing-key' } })
    fireEvent.click(screen.getByRole('button', { name: /Load properties/i }))

    await waitFor(() => expect(listBingSites).toHaveBeenCalledWith('s1', 'bing-key'))

    // The unverified property must NOT be selectable: connecting to one returns an empty result
    // set that is indistinguishable from a verified property with no traffic.
    const select = await screen.findByLabelText('Bing property')
    expect(within(select).getByRole('option', { name: 'https://example.com/' })).toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: 'http://unverified.example/' })).toBeNull()
  })

  it('shows the Bing property and sync state once connected', () => {
    useBingStatus.mockReturnValue(bingState({
      data: {
        connected: true,
        status: 'active',
        site_url: 'https://acme.com/',
        last_synced_at: '2026-08-13T12:00:00Z',
      },
    }))
    render(<SiteIntegrationsTab siteId="s1" />)
    expect(screen.getByText('Bing property')).toBeInTheDocument()
    // The full URL including scheme IS the property identity to Bing: http/https/www are
    // different properties, so a bare domain would hide which one is connected.
    expect(screen.getByText('https://acme.com/')).toBeInTheDocument()
  })

  it('shows a Connected chip and detail rows once GSC is connected', () => {
    useGSCStatus.mockReturnValue(gscState({
      data: {
        connected: true,
        status: 'active',
        google_email: 'owner@acme.com',
        gsc_property: 'https://acme.com/',
        last_synced_at: '2026-07-10T12:00:00Z',
      },
    }))
    render(<SiteIntegrationsTab siteId="s1" />)
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('Google account')).toBeInTheDocument()
    expect(screen.getByText('owner@acme.com')).toBeInTheDocument()
    // Connected row exposes Disconnect (always-visible), not Connect.
    expect(screen.getByRole('button', { name: /Disconnect/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Connect with Google/i })).toBeNull()
  })

  it('handles a browser-blocked GSC popup instead of a silent no-op (B8)', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<SiteIntegrationsTab siteId="s1" />)
    fireEvent.click(screen.getByRole('button', { name: /Connect with Google/i }))
    await waitFor(() => expect(openSpy).toHaveBeenCalled())
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/blocked the sign-in popup/i)),
    )
    openSpy.mockRestore()
  })

  it('severs the popup opener for reverse-tabnabbing protection (B8)', async () => {
    const fakePopup: any = { opener: {} }
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakePopup)
    render(<SiteIntegrationsTab siteId="s1" />)
    fireEvent.click(screen.getByRole('button', { name: /Connect with Google/i }))
    await waitFor(() => expect(fakePopup.opener).toBeNull())
    openSpy.mockRestore()
  })

  it('reveals the Bunny inline setup form when Connect is clicked', () => {
    render(<SiteIntegrationsTab siteId="s1" />)
    // The API key field is hidden until the Bunny Connect is pressed.
    expect(screen.queryByLabelText('API key')).toBeNull()
    fireEvent.click(within(row('Bunny CDN')).getByRole('button', { name: /^Connect$/i }))
    expect(screen.getByLabelText('API key')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Load zones/i })).toBeInTheDocument()
  })

  it('closes Bing\'s open setup form when Bunny\'s Connect is clicked, so at most one orange Connect button ever shows', async () => {
    render(<SiteIntegrationsTab siteId="s1" />)

    // Open Bing's setup and drive it all the way to "ready": a verified
    // property picked, which is what reveals its own orange Connect Bing button.
    fireEvent.click(within(row('Bing Webmaster Tools')).getByRole('button', { name: /^Connect$/i }))
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'bing-key' } })
    fireEvent.click(screen.getByRole('button', { name: /Load properties/i }))
    const bingSelect = await screen.findByLabelText('Bing property')
    fireEvent.change(bingSelect, { target: { value: 'https://example.com/' } })
    const connectBingButton = screen.getByRole('button', { name: /Connect Bing/i })
    expect(connectBingButton.getAttribute('variant')).toBe('default')

    // Opening Bunny's setup must close Bing's, not merely add a second one.
    fireEvent.click(within(row('Bunny CDN')).getByRole('button', { name: /^Connect$/i }))
    expect(screen.queryByLabelText('Bing property')).toBeNull()
    expect(screen.queryByRole('button', { name: /Connect Bing/i })).toBeNull()

    // Drive Bunny to its own "ready" step and confirm exactly one orange
    // (variant="default") Connect button exists on the page at that point.
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'bunny-key' } })
    fireEvent.click(screen.getByRole('button', { name: /Load zones/i }))
    await screen.findByLabelText('Pull zone')
    const orangeButtons = screen.getAllByRole('button').filter(b => b.getAttribute('variant') === 'default')
    expect(orangeButtons).toHaveLength(1)
    expect(orangeButtons[0]).toHaveTextContent('Connect Bunny CDN')
  })

  it('surfaces a distinct error banner (not a fake disconnect) when a status fetch fails', () => {
    useGSCStatus.mockReturnValue(gscState({ data: undefined, error: new Error('boom') }))
    render(<SiteIntegrationsTab siteId="s1" />)
    expect(screen.getByTestId('error-banner')).toHaveTextContent(/Google Search Console connection status/i)
    // No Connect/Disconnect action while the status is unknown.
    expect(screen.queryByRole('button', { name: /Connect with Google/i })).toBeNull()
  })

  it('hides every connect/disconnect action when the user cannot manage integrations', () => {
    useGSCStatus.mockReturnValue(gscState({ data: { connected: true, status: 'active' } }))
    useBunnyStatus.mockReturnValue(bunnyState({ data: { connected: false } }))
    mockCanManage = false
    render(<SiteIntegrationsTab siteId="s1" />)
    expect(screen.queryByRole('button', { name: /Connect/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Disconnect/i })).toBeNull()
  })

  it('titles the panel the way the dashboard titles a section, sentence case, no kicker', () => {
    render(<SiteIntegrationsTab siteId="s1" />)
    const h2 = screen.getByRole('heading', { level: 2, name: 'Integrations' })
    expect(h2.className).toMatch(/\btext-sm\b/)
    expect(h2.className).toMatch(/\bfont-semibold\b/)
    expect(h2.className).not.toMatch(/uppercase|micro-label/)
    expect(
      screen.getByText('Connect third-party services to bring more data into your analytics.'),
    ).toBeInTheDocument()
  })

  it('renders the shared loading skeleton, not a spinner, while any status is still loading', () => {
    useBunnyStatus.mockReturnValue(bunnyState({ data: undefined, isLoading: true }))
    render(<SiteIntegrationsTab siteId="s1" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    // The retired centred-Spinner loading device must not appear alongside it.
    expect(screen.queryByTestId('spinner')).toBeNull()
    expect(screen.queryByText('Integrations')).toBeNull()
  })

  it('gives every disconnected integration the same "Not connected" chip, not silence', () => {
    render(<SiteIntegrationsTab siteId="s1" />)
    // All three rows start disconnected in the default mock state: one chip
    // shape said three times, matching the Connected chip shown once linked.
    expect(screen.getAllByText('Not connected')).toHaveLength(3)
  })

  it('styles Disconnect as the shared destructive outline, never a filled button', () => {
    useGSCStatus.mockReturnValue(gscState({ data: { connected: true, status: 'active' } }))
    render(<SiteIntegrationsTab siteId="s1" />)
    const disconnect = screen.getByRole('button', { name: /Disconnect/i })
    expect(disconnect.getAttribute('variant')).toBe('outline')
    // Reuses DangerZone's own recipe rather than a hand-rolled coral fill.
    for (const cls of DESTRUCTIVE_OUTLINE.split(' ')) {
      expect(disconnect.className).toContain(cls)
    }
    expect(disconnect.className).not.toMatch(/bg-destructive(?!\/)|bg-red-/)
  })

  it('never uses an em dash, en dash or a literal ellipsis in its user-facing copy', () => {
    // Scoped to string literals, not the whole stripped source: this file legitimately
    // spans multi-line JSX and template strings around those characters in ways a bare
    // scan would misread. Comments are stripped first so a decision note doesn't trip the
    // same copy rule its own quoted strings must obey.
    const stripped = stripComments(readFileSync(SOURCE_PATH, 'utf8'))
    const stringLiterals = stripped.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g) ?? []
    const offenders = stringLiterals.filter(s => /[—–]/.test(s) || /\.\.\./.test(s))
    expect(offenders).toEqual([])
  })

  it('spells the CDN integration "Bunny CDN", the way its owner writes it', () => {
    render(<SiteIntegrationsTab siteId="s1" />)
    expect(screen.getByText('Bunny CDN')).toBeInTheDocument()
    expect(screen.queryByText('BunnyCDN')).toBeNull()
  })

  it('folds the integration note into the header row as a second caption line under the description (P4)', () => {
    render(<SiteIntegrationsTab siteId="s1" />)
    const note = screen.getByText('Pulse only requests read-only access. Your tokens are encrypted at rest.')
    // Same caption paragraph as the description directly above it, not a
    // separate standalone note row underneath the panel: the old
    // IntegrationNote device rendered its own bordered row below everything
    // else, so the note text and the description never shared a caption node.
    const caption = note.closest('p')
    expect(caption).not.toBeNull()
    expect(caption).toHaveTextContent('View search queries, clicks, impressions, and ranking data.')
    expect(note.className).toMatch(/\bmt-1\b/)
    expect(note.className).toMatch(/\btext-xs\b/)
    expect(note.className).toMatch(/\btext-muted-foreground\b/)
    // The retired standalone note row (its own border-t block) must be gone.
    expect(note.closest('div.border-t')).toBeNull()
  })

  it('gives every LogoTile the house ease-apple, duration-fast transition (M6)', () => {
    const { container } = render(<SiteIntegrationsTab siteId="s1" />)
    const tiles = container.querySelectorAll('.bg-accent')
    expect(tiles.length).toBe(3)
    tiles.forEach(tile => {
      expect(tile.className).toMatch(/\bduration-fast\b/)
      expect(tile.className).toMatch(/\bease-apple\b/)
    })
  })
})
