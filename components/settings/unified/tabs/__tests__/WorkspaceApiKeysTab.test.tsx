import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MastheadSlotProvider } from '@/components/settings/shell-slots'
import type { ApiKey } from '@/lib/api/api-keys'

// --- Mocks ---------------------------------------------------------------

const listApiKeys = vi.fn()
const createApiKey = vi.fn()
const revokeApiKey = vi.fn()
// apiKeyStatus is pure derivation logic (no I/O) — keep the real
// implementation via importOriginal so the tone/label mapping under test is
// the same one the component actually runs against, not a re-guess of it.
vi.mock('@/lib/api/api-keys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/api-keys')>()
  return {
    ...actual,
    listApiKeys: (...a: unknown[]) => listApiKeys(...a),
    createApiKey: (...a: unknown[]) => createApiKey(...a),
    revokeApiKey: (...a: unknown[]) => revokeApiKey(...a),
  }
})

const listRoles = vi.fn()
vi.mock('@/lib/api/roles', () => ({
  listRoles: (...a: unknown[]) => listRoles(...a),
}))

const listSites = vi.fn()
vi.mock('@/lib/api/sites', () => ({
  listSites: (...a: unknown[]) => listSites(...a),
}))

vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, title, description, onConfirm }: any) =>
    open ? (
      <div role="dialog">
        <p>{title}</p>
        <p>{description}</p>
        <button onClick={onConfirm}>Confirm revoke</button>
      </div>
    ) : null,
}))

vi.mock('@ciphera-net/facet', () => ({
  // lib/utils (and the panel primitives) re-export cn from facet.
  cn: (...args: any[]) => args.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  Select: ({ value, onChange, options = [], ...props }: any) => (
    <select value={value} onChange={(e) => onChange?.(e.target.value)} {...props}>
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
  Switcher: ({ options = [], value, onChange, 'aria-label': ariaLabel }: any) => (
    <div role="group" aria-label={ariaLabel}>
      {options.map((o: any) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange?.(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  ),
  Checkbox: ({ checked, onChange, disabled, label, id }: any) => (
    <label>
      <input type="checkbox" id={id} checked={checked} disabled={disabled} onChange={() => onChange?.()} />
      {label}
    </label>
  ),
  Toggle: ({ checked, onChange, disabled }: any) => (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange?.()}>
      toggle
    </button>
  ),
  toast: { success: vi.fn(), error: vi.fn() },
}))

import WorkspaceApiKeysTab from '../WorkspaceApiKeysTab'

const ROLE = { id: 'r1', organization_id: 'org1', name: 'Viewer', slug: 'viewer', is_builtin: true, color: null, permissions: [], site_scoped: false, created_at: '', updated_at: '' }
const SITE = { id: 's1', user_id: 'u1', domain: 'example.com', name: 'Example' }

function makeKey(overrides: Partial<ApiKey>): ApiKey {
  return {
    id: 'k1',
    name: 'Grafana',
    key_prefix: 'pk_live',
    key_last4: 'ab12',
    role_id: 'r1',
    scope_all_sites: true,
    site_ids: [],
    expires_at: '2099-01-01T00:00:00Z',
    last_used_at: null,
    revoked_at: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function renderTab() {
  const slot = document.createElement('div')
  slot.setAttribute('data-testid', 'masthead-slot')
  document.body.appendChild(slot)
  return render(
    <MastheadSlotProvider value={slot}>
      <WorkspaceApiKeysTab />
    </MastheadSlotProvider>,
  )
}

beforeEach(() => {
  listApiKeys.mockReset()
  createApiKey.mockReset()
  revokeApiKey.mockReset()
  listRoles.mockReset().mockResolvedValue({ roles: [ROLE] })
  listSites.mockReset().mockResolvedValue([SITE])
  document.body.innerHTML = ''
})

describe('WorkspaceApiKeysTab (Facet structured panels)', () => {
  it('renders the loading skeleton (role=status) while the initial fetch is in flight', () => {
    listApiKeys.mockReturnValue(new Promise(() => {})) // never resolves
    renderTab()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('surfaces a distinct error naming API keys, and Try again refetches', async () => {
    listApiKeys.mockRejectedValueOnce(new Error('boom'))
    renderTab()

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText("Couldn't load your API keys")).toBeInTheDocument()

    // A failure must never fall through to the empty state.
    expect(screen.queryByText('No API keys yet')).toBeNull()

    listApiKeys.mockResolvedValueOnce({ api_keys: [] })
    fireEvent.click(within(alert).getByRole('button', { name: /Try again/i }))

    await waitFor(() => expect(screen.getByText('No API keys yet')).toBeInTheDocument())
    expect(listApiKeys).toHaveBeenCalledTimes(2)
  })

  it('renders an in-frame empty state when there are no keys', async () => {
    listApiKeys.mockResolvedValue({ api_keys: [] })
    renderTab()
    expect(await screen.findByText('No API keys yet')).toBeInTheDocument()
  })

  it('renders the panel title as a sentence-case level-2 heading', async () => {
    listApiKeys.mockResolvedValue({ api_keys: [] })
    renderTab()
    await screen.findByText('No API keys yet')
    expect(screen.getByRole('heading', { level: 2, name: 'API keys' })).toBeInTheDocument()
  })

  it('renders a dotted status chip for each of Active, Expired and Revoked', async () => {
    listApiKeys.mockResolvedValue({
      api_keys: [
        makeKey({ id: 'live', name: 'Live key', expires_at: '2099-01-01T00:00:00Z', revoked_at: null }),
        makeKey({ id: 'exp', name: 'Expired key', expires_at: '2020-01-01T00:00:00Z', revoked_at: null }),
        makeKey({ id: 'rev', name: 'Revoked key', expires_at: '2099-01-01T00:00:00Z', revoked_at: '2026-02-01T00:00:00Z' }),
      ],
    })
    renderTab()

    await waitFor(() => expect(screen.getByText('Live key')).toBeInTheDocument())

    for (const label of ['Active', 'Expired', 'Revoked']) {
      const chip = screen.getByText(label)
      // One chip shape for the same meaning: every status carries a dot.
      expect(chip.parentElement?.querySelector('.rounded-full')).toBeTruthy()
    }

    // Revoked keys cannot be revoked again.
    expect(screen.queryByLabelText('Revoke Revoked key')).toBeNull()
    expect(screen.getByLabelText('Revoke Live key')).toBeInTheDocument()
  })

  it('opens the create form from the masthead action and toggles the all-sites Toggle', async () => {
    listApiKeys.mockResolvedValue({ api_keys: [] })
    renderTab()
    await screen.findByText('No API keys yet')

    const cta = screen.getByRole('button', { name: 'New key' })
    expect(screen.getByTestId('masthead-slot').contains(cta)).toBe(true)
    // Rule 4: no raw <button> or link-styled-as-button — the primary action
    // is a real <button> element (the Facet Button primitive).
    expect(cta.tagName).toBe('BUTTON')
    fireEvent.click(cta)

    // The site checkbox is visible until "All sites" is turned on.
    expect(screen.getByLabelText('example.com')).toBeInTheDocument()

    const allSitesToggle = screen.getByRole('switch')
    expect(allSitesToggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(allSitesToggle)
    expect(allSitesToggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByLabelText('example.com')).toBeNull()

    fireEvent.click(allSitesToggle)
    expect(screen.getByLabelText('example.com')).toBeInTheDocument()
  })

  it('creates a key through the inline form and shows the one-time reveal', async () => {
    listApiKeys.mockResolvedValue({ api_keys: [] })
    createApiKey.mockResolvedValue({
      api_key: makeKey({}),
      token: 'pk_live_secrettoken',
      warning: 'shown once',
    })
    renderTab()
    await screen.findByText('No API keys yet')

    fireEvent.click(screen.getByRole('button', { name: 'New key' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'CI pipeline' } })
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: ROLE.id } })
    fireEvent.click(screen.getByRole('switch')) // all sites on, so no site selection is required

    listApiKeys.mockResolvedValue({ api_keys: [makeKey({ name: 'CI pipeline' })] })
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }))

    await waitFor(() => expect(createApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'CI pipeline', role_id: ROLE.id, scope_all_sites: true, site_ids: [] }),
    ))
    expect(await screen.findByText('pk_live_secrettoken')).toBeInTheDocument()
    expect(screen.getByText('Your new API key')).toBeInTheDocument()
  })

  it('revokes a key through the confirm dialog', async () => {
    listApiKeys.mockResolvedValue({ api_keys: [makeKey({})] })
    revokeApiKey.mockResolvedValue({ revoked: true })
    renderTab()

    const revokeBtn = await screen.findByLabelText('Revoke Grafana')
    fireEvent.click(revokeBtn)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    listApiKeys.mockResolvedValue({ api_keys: [makeKey({ revoked_at: '2026-02-01T00:00:00Z' })] })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }))

    await waitFor(() => expect(revokeApiKey).toHaveBeenCalledWith('k1'))
  })

  it('renders each key through the shared PanelRow grid, not a hand-rolled row', async () => {
    listApiKeys.mockResolvedValue({ api_keys: [makeKey({})] })
    renderTab()

    const name = await screen.findByText('Grafana')
    // PanelRow's signature is its responsive label/value/control grid
    // (components/settings/panels/PanelRow.tsx). A row built from that
    // primitive carries this class on an ancestor; a hand-rolled
    // `flex items-center justify-between` row does not.
    const row = name.closest('[class*="md:grid-cols-[minmax("]')
    expect(row).toBeTruthy()
    // The caption line (prefix, sites, last used, expiry) rides inside the
    // same PanelRow, sharing its grid, rather than a sibling column that
    // does not align with the create-form rows above it.
    expect(row).toHaveTextContent('pk_live')
  })

  // The humanizer (spec §6.1 rule 15) is a hard constraint on user-facing
  // copy; strip WHY-comments first so this checks the copy, not prose inside
  // an explanation next to it.
  it('never uses an em dash or en dash in its source, comments included', () => {
    const sourcePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'WorkspaceApiKeysTab.tsx')
    const stripped = readFileSync(sourcePath, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(stripped).not.toMatch(/[—–]/)
  })
})
