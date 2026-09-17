import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type {
  PreferencesDocument,
  CategoryPreferenceDoc,
} from '@/lib/api/notifications-preferences'

// --- Mocks ---------------------------------------------------------------

const getPrefsDocument = vi.fn()
const updatePrefsBooleans = vi.fn()
vi.mock('@/lib/api/notifications-preferences', () => ({
  getPrefsDocument: () => getPrefsDocument(),
  updatePrefsBooleans: (w: unknown) => updatePrefsBooleans(w),
}))

const purgeMine = vi.fn().mockResolvedValue(undefined)
const listNotifications = vi.fn()
vi.mock('@/lib/api/notifications-v2', () => ({
  purgeMine: () => purgeMine(),
  listNotifications: (p: unknown) => listNotifications(p),
}))

vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { email: 'owner@example.com', org_id: 'org-1' } }),
}))

const toastError = vi.fn()
// Toggle keeps its real switch semantics (role + aria-checked), the same
// stand-in AccountSecurityAlertsTab uses: it carries no name prop of its own
// (Facet's Toggle takes only checked/onChange/disabled/className), so a
// switch is found by its row, not by an accessible name — see `switchFor`.
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
  Modal: ({ isOpen, title, children }: any) =>
    isOpen ? (
      <div role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
  Input: (props: any) => <input {...props} />,
  Select: ({ options, value, onChange, 'aria-label': label }: any) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
  Toggle: ({ checked, onChange, disabled }: any) => (
    <button role="switch" aria-checked={checked} disabled={disabled} onClick={onChange} />
  ),
  // Same passthrough shape WorkspaceBillingTab's test uses for the RailGrid
  // stat-tile primitive: layout only, so a plain div stands in for both.
  RailGrid: ({ children, minTileWidth: _m, columns: _col, ...props }: any) => (
    <div {...props}>{children}</div>
  ),
  RailGridTile: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CheckIcon: () => <span />,
  Button: ({ children, onClick, ...rest }: any) => (
    <button type="button" onClick={onClick} {...rest}>
      {children}
    </button>
  ),
  toast: { error: (...a: any[]) => toastError(...a), success: vi.fn() },
  getAuthErrorMessage: (e: Error) => e?.message ?? '',
}))

import MyPreferencesTab from '../MyPreferencesTab'

// --- Fixtures ------------------------------------------------------------

function cat(
  id: string,
  displayName: string,
  criticality: 'critical' | 'standard' | 'low',
  over: Partial<CategoryPreferenceDoc> = {},
): CategoryPreferenceDoc {
  return {
    category_id: id,
    display_name: displayName,
    criticality,
    suppressible: criticality !== 'critical',
    digest_group: null,
    unread_ttl_seconds: 90 * 86400,
    read_ttl_seconds: 30 * 86400,
    min_retention_seconds: 7 * 86400,
    default_in_app: true,
    default_email: criticality === 'critical',
    default_digest: false,
    in_app: true,
    email: criticality === 'critical',
    digest: false,
    muted: false,
    stored: false,
    retention_override_seconds: null,
    ...over,
  }
}

function doc(overrides: Partial<PreferencesDocument> = {}): PreferencesDocument {
  return {
    user_id: 'u1',
    delivery_modes: {},
    quiet_hours_start: null,
    quiet_hours_end: null,
    timezone: 'Europe/Brussels',
    digest_time: '09:00:00',
    retention_overrides: {},
    updated_at: '2026-08-31T00:00:00Z',
    product: 'pulse',
    recipient_preferences: {
      timezone: 'Europe/Brussels',
      quiet_hours_start: null,
      quiet_hours_end: null,
      quiet_hours_mode: 'defer',
      digest_time: '09:00:00',
    },
    categories: [
      cat('billing', 'Billing', 'critical'),
      cat('security', 'Security', 'critical'),
      cat('uptime', 'Uptime', 'standard', { email: true }),
      cat('site', 'Site activity', 'low', { digest: true }),
      cat('team', 'Team', 'low'),
      cat('system', 'System', 'low', {
        muted: true,
        email: true,
      }),
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getPrefsDocument.mockResolvedValue(doc())
  // The mock BRANCHES ON THE BODY the way the deployed proxy does: a
  // schedule-only write (no categories key) takes the legacy path and answers
  // {"ok":true} WITHOUT a document. The first version of this mock returned a
  // full document for every body, the stub encoded a wrong guess and 36
  // green tests hid a page-destroying crash (the adversarial review's proof).
  updatePrefsBooleans.mockImplementation(async (w: any) =>
    w && w.categories ? { ...doc(), ok: true } : ({ ok: true } as any),
  )
  listNotifications.mockResolvedValue({
    receipts: [],
    unread_count: 3,
    total_count: 87,
    category_counts: {
      billing: { display_name: 'Billing', unread: 1, total: 12 },
      security: { display_name: 'Security', unread: 1, total: 9 },
      uptime: { display_name: 'Uptime', unread: 2, total: 41 },
      site: { display_name: 'Site activity', unread: 1, total: 17 },
      team: { display_name: 'Team', unread: 0, total: 5 },
      system: { display_name: 'System', unread: 0, total: 3 },
    },
  })
})

async function renderTab() {
  render(<MyPreferencesTab />)
  await waitFor(() => expect(screen.getByText('Delivery')).toBeInTheDocument())
}

/**
 * A category's channel switch has no accessible name of its own (Facet's
 * Toggle takes no label prop at all), so it is found the way
 * AccountSecurityAlertsTab's own test finds one: by walking up from its
 * PanelRow's visible label to the row, then down to the switch inside it.
 * Only one category is expanded at a time in these tests (the detail block
 * unmounts on collapse), so a label is unambiguous across the whole document.
 */
function switchFor(label: string): HTMLElement {
  const labelNode = Array.from(document.querySelectorAll('span,label')).find(
    (n) => n.textContent === label,
  )
  if (!labelNode) throw new Error(`no row labelled "${label}"`)
  const row = labelNode.closest('div.grid') as HTMLElement | null
  const control = row?.querySelector('[role="switch"]') as HTMLElement | null
  if (!control) throw new Error(`row "${label}" has no switch`)
  return control
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const SOURCE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'MyPreferencesTab.tsx',
)

// --- Tests ---------------------------------------------------------------

describe('MyPreferencesTab (round-3 family)', () => {
  it('renders the six categories in the family order with registry names', async () => {
    await renderTab()
    const names = screen
      .getAllByRole('button', { expanded: false })
      .map((b) => b.textContent ?? '')
      .filter((t) =>
        ['Billing', 'Security', 'Uptime', 'Site activity', 'Team', 'System'].some((n) =>
          t.startsWith(n),
        ),
      )
    expect(names.length).toBe(6)
    expect(names[0]).toContain('Billing')
    expect(names[2]).toContain('Uptime')
    expect(names[5]).toContain('System')
  })

  it('critical rows summarize as always on; muted rows read as muted with resume state', async () => {
    await renderTab()
    expect(screen.getAllByText('In-app + Email · always on').length).toBe(2)
    expect(screen.getByText('Muted · resumes to In-app + Email')).toBeInTheDocument()
  })

  it('a critical category expands to Always-on chips, a Not-digested chip and NO mute affordance', async () => {
    await renderTab()
    fireEvent.click(screen.getByRole('button', { name: /^Billing/ }))
    // In-app + Email both read as the one status chip, not a hand-rolled dash.
    expect(screen.getAllByText('Always on').length).toBe(2)
    expect(screen.getByText('Not digested')).toBeInTheDocument()
    expect(screen.getByText('Not available. Billing is never digested.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Mute Billing/ })).toBeNull()
    // No switches at all inside a critical expansion.
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('a suppressible category expands to switch rows and a mute button', async () => {
    await renderTab()
    fireEvent.click(screen.getByRole('button', { name: /^Uptime/ }))
    expect(screen.getAllByRole('switch').length).toBe(3)
    expect(screen.getByRole('button', { name: 'Mute Uptime' })).toBeInTheDocument()
  })

  it('🔴 M6: a category row opens on the house height+fade curve, never a bare mount/unmount', async () => {
    // The old markup was `{isOpen && <div>…</div>}` with no framer-motion
    // anywhere in this file: no AnimatePresence, no DURATION_BASE/EASE_APPLE
    // import, no height/opacity keyframes. Every assertion below is false
    // against that markup, and true only once the disclosure goes through
    // AnimatePresence + motion.div on the shared motion tokens (the same
    // device WorkspaceAuditTab's payload row uses), with an explicit
    // reduced-motion branch that renders the identical content instantly
    // rather than skipping the transition object.
    const src = readFileSync(SOURCE_PATH, 'utf8')
    expect(src).toMatch(/from ['"]framer-motion['"]/)
    expect(src).toMatch(/import \{ DURATION_BASE, EASE_APPLE \} from ['"]@\/lib\/motion['"]/)
    expect(src).toMatch(/<AnimatePresence initial=\{false\}>/)
    expect(src).toMatch(/initial=\{\{ height: 0, opacity: 0 \}\}/)
    expect(src).toMatch(/animate=\{\{ height: 'auto', opacity: 1 \}\}/)
    expect(src).toMatch(/exit=\{\{ height: 0, opacity: 0 \}\}/)
    expect(src).toMatch(/transition=\{\{ duration: DURATION_BASE, ease: EASE_APPLE \}\}/)
    expect(src).toMatch(/reducedMotion \? \(/)

    // And the interaction still works: the row opens and shows its controls
    // (the animated wrapper never hides the content it wraps).
    await renderTab()
    fireEvent.click(screen.getByRole('button', { name: /^Uptime/ }))
    expect(screen.getByRole('button', { name: 'Mute Uptime' })).toBeInTheDocument()
  })

  it('the delivery data strip renders its two stat tiles (unread/total, days kept)', async () => {
    // uptime: 2 unread of 41 total (fixture); 30 days kept (default read_ttl,
    // no override). Renders through the RailGridTile stand-in, proving the
    // repair pass's RailGrid swap did not change what the strip shows.
    await renderTab()
    fireEvent.click(screen.getByRole('button', { name: /^Uptime/ }))
    expect(screen.getByText('2 of 41')).toBeInTheDocument()
    expect(screen.getByText('Unread notifications.')).toBeInTheDocument()
    expect(screen.getByText('Days kept after being read.')).toBeInTheDocument()
  })

  it('both data-strip stat bands go through the shared RailGrid device, never a hand-rolled grid', () => {
    // Rule 7 / reuse-established-device: WorkspaceBillingTab, SiteBotSpamTab
    // and WorkspaceRolesTab all nest their stat-tile bands in
    // RailGrid/RailGridTile; this file used to hand-roll its own
    // `grid grid-cols-2` band instead (the repair pass's finding). The mock
    // collapses both to plain divs, so this pins WHICH primitive is called by
    // reading the source, the same technique the dash/ellipsis checks below
    // already use.
    const src = readFileSync(SOURCE_PATH, 'utf8')
    expect(src).not.toMatch(/grid grid-cols-2/)
    expect((src.match(/<RailGrid\b/g) ?? []).length).toBe(2)
    expect((src.match(/<RailGridTile>/g) ?? []).length).toBe(4)
  })

  it('a stat-tile caption that failed to load reads in the ruled active voice', () => {
    // Rule 15: "Couldn't <verb> <the thing>", never a passive "X could not be
    // loaded." (the repair pass's copy finding, both occurrences).
    const src = readFileSync(SOURCE_PATH, 'utf8')
    expect(src).not.toMatch(/could not be loaded/)
    expect((src.match(/Couldn't load this count\./g) ?? []).length).toBe(2)
  })

  it('🔴 every category write carries the CURRENT schedule fields (the clobber guard)', async () => {
    await renderTab()
    fireEvent.click(screen.getByRole('button', { name: /^Uptime/ }))
    fireEvent.click(switchFor('Daily digest'))
    await waitFor(() => expect(updatePrefsBooleans).toHaveBeenCalledTimes(1))
    const body = updatePrefsBooleans.mock.calls[0][0]
    // The categories half: the FULL row, iris refuses partial writes ("a
    // stored row is the full expression"), so every write carries all four
    // booleans composed from the current document plus the change.
    expect(body.categories).toEqual({
      uptime: { in_app: true, email: true, digest: true, muted: false, retention_override_seconds: null },
    })
    // …and the schedule half, present on EVERY write: the proxy sends the
    // recipient_preferences block unconditionally, so omitting these would
    // silently reset digest time and quiet hours to defaults.
    expect(body.digest_time).toBe('09:00')
    expect(body.timezone).toBe('Europe/Brussels')
    expect('quiet_hours_start' in body).toBe(true)
    expect('quiet_hours_end' in body).toBe(true)
  })

  it('muting writes muted:true and unmuting writes muted:false', async () => {
    await renderTab()
    fireEvent.click(screen.getByRole('button', { name: /^Uptime/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Mute Uptime' }))
    await waitFor(() => expect(updatePrefsBooleans).toHaveBeenCalled())
    expect(updatePrefsBooleans.mock.calls[0][0].categories).toEqual({
      uptime: { in_app: true, email: true, digest: false, muted: true, retention_override_seconds: null },
    })
  })

  it('the retention select offers no option below the registry floor (n−1)', async () => {
    await renderTab()
    fireEvent.click(screen.getByRole('button', { name: /^Uptime/ }))
    const selects = screen.getAllByRole('combobox', { name: 'Retention for Uptime' })
    const options = within(selects[0])
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
    // floor is 7 days: 3 must be absent, 7 present, default 30 labelled.
    expect(options).not.toContain('3')
    expect(options).toContain('7')
    expect(within(selects[0]).getByText('30 days, registry default')).toBeInTheDocument()
  })

  it('selecting the registry default clears the override (null, not a copied value)', async () => {
    await renderTab()
    fireEvent.click(screen.getByRole('button', { name: /^Uptime/ }))
    const selects = screen.getAllByRole('combobox', { name: 'Retention for Uptime' })
    fireEvent.change(selects[0], { target: { value: '30' } })
    await waitFor(() => expect(updatePrefsBooleans).toHaveBeenCalled())
    expect(
      updatePrefsBooleans.mock.calls[0][0].categories.uptime.retention_override_seconds,
    ).toBeNull()
  })

  it('the three time fields hide the native picker glyph behind a Phosphor clock and match the Select height (h-9)', async () => {
    // Same device as WorkspaceAuditTab's date fields: the OS glyph is
    // opacity-0'd but stretched over the whole control (inset-0) so the
    // FULL field still opens the native picker, and a visible Phosphor icon
    // sits in front of it. The old markup was a bare `<Input className="w-28
    // [color-scheme:dark]">` with no wrapper and no icon at all, so every
    // assertion here is false against it.
    await renderTab()
    for (const label of ['Digest send time', 'Quiet hours start', 'Quiet hours end']) {
      const input = screen.getByLabelText(label) as HTMLInputElement
      const classes = input.className
      // Height now matches the timezone Select's `size="sm"` (h-9), not the
      // Input default.
      expect(classes).toMatch(/\bh-9\b/)
      // The native indicator is hidden but still covers (and opens) the
      // whole field.
      expect(classes).toContain('[&::-webkit-calendar-picker-indicator]:opacity-0')
      expect(classes).toContain('[&::-webkit-calendar-picker-indicator]:inset-0')
      expect(classes).toContain('[&::-webkit-calendar-picker-indicator]:cursor-pointer')
      // Muted text while the field reads the browser's empty placeholder.
      expect(classes).toContain('placeholder-shown:text-muted-foreground')
      // A relative wrapper carrying a real glyph in front of the field, the
      // same shape the date fields use (an absolutely positioned icon, not
      // Input's own left-aligned `icon` prop).
      const wrapper = input.parentElement as HTMLElement
      expect(wrapper.className).toMatch(/\brelative\b/)
      const icon = wrapper.querySelector('svg')
      expect(icon).not.toBeNull()
      expect(icon?.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('the quiet-hours copy explains the deferral without a dash, criticals exempt', async () => {
    await renderTab()
    expect(
      screen.getByText(
        /During quiet hours, email is held and delivered when they end\. It's never dropped\. Billing and Security send immediately, always\./,
      ),
    ).toBeInTheDocument()
    // The example tag is the one status chip, with a dot: a real state, not
    // a hand-tinted span.
    expect(screen.getByText('Held during quiet hours')).toBeInTheDocument()
  })

  it('adopts the SERVER response after a write (stored truth, not the optimistic guess)', async () => {
    const answered = doc()
    answered.categories = answered.categories.map((c) =>
      c.category_id === 'uptime' ? { ...c, digest: true, email: false, stored: true } : c,
    )
    updatePrefsBooleans.mockResolvedValue({ ...answered, ok: true })
    await renderTab()
    fireEvent.click(screen.getByRole('button', { name: /^Uptime/ }))
    fireEvent.click(switchFor('Daily digest'))
    await waitFor(() => expect(screen.getByText('In-app + Digest')).toBeInTheDocument())
  })

  it('a trigger refusal (422) surfaces the server words and changes nothing', async () => {
    updatePrefsBooleans.mockRejectedValue(new Error('cannot disable a critical category'))
    await renderTab()
    fireEvent.click(screen.getByRole('button', { name: /^Uptime/ }))
    fireEvent.click(switchFor('In-app'))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(String(toastError.mock.calls[0][0])).toContain('cannot disable a critical category')
  })

  it('the retention band anchors each category to its true read-held count', async () => {
    await renderTab()
    // uptime: 41 total − 2 unread = 39 read items held
    expect(screen.getByText('39 read items held')).toBeInTheDocument()
  })

  it('the purge button carries the server true count and confirms in a dialog', async () => {
    await renderTab()
    const btn = screen.getByRole('button', { name: 'Purge all 87 notifications' })
    fireEvent.click(btn)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('the destructive purge entry is a coral OUTLINE, never a filled button (DangerZone rule)', async () => {
    await renderTab()
    const btn = screen.getByRole('button', { name: 'Purge all 87 notifications' })
    const classes = btn.className.split(/\s+/)
    expect(classes).toContain('text-destructive')
    // A hover-only wash (`hover:bg-destructive/10`) is the outline rung's own
    // affordance; the RESTING class list must carry no bare fill.
    expect(classes.some((c) => c === 'bg-destructive' || c.startsWith('bg-destructive/'))).toBe(
      false,
    )
  })

  it('titles each panel the way the dashboard titles a section: sentence case, no kicker', async () => {
    await renderTab()
    for (const title of ['Delivery', 'Delivery schedule', 'Retention', 'Danger zone']) {
      const h2 = screen.getByRole('heading', { level: 2, name: title })
      expect(h2.className).toMatch(/\btext-sm\b/)
      expect(h2.className).toMatch(/\bfont-semibold\b/)
      expect(h2.className).not.toMatch(/uppercase|micro-label/)
    }
  })

  it('renders an empty row when the registry returns no categories', async () => {
    getPrefsDocument.mockResolvedValue(doc({ categories: [] }))
    render(<MyPreferencesTab />)
    await waitFor(() => expect(screen.getByText('Delivery')).toBeInTheDocument())
    expect(screen.getByText('No notification categories')).toBeInTheDocument()
  })

  it('renders the loading skeleton, not a blank page, before the document resolves', () => {
    getPrefsDocument.mockReturnValue(new Promise(() => {}))
    listNotifications.mockReturnValue(new Promise(() => {}))
    render(<MyPreferencesTab />)
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
  })

  it('🔴 a schedule save survives the {"ok":true} legacy-path answer (re-reads the document)', async () => {
    await renderTab()
    const input = screen.getByLabelText('Digest send time') as HTMLInputElement
    fireEvent.change(input, { target: { value: '10:30' } })
    fireEvent.blur(input)
    await waitFor(() => expect(updatePrefsBooleans).toHaveBeenCalledTimes(1))
    // No categories key on a schedule write → the mock answered {"ok":true};
    // the page must re-read the document rather than adopting it…
    expect(updatePrefsBooleans.mock.calls[0][0].categories).toBeUndefined()
    await waitFor(() => expect(getPrefsDocument).toHaveBeenCalledTimes(2))
    // …and still render (the crash was setDoc({ok:true}) → undefined reads).
    expect(screen.getByText('Delivery')).toBeInTheDocument()
  })

  it('quiet-hours inputs commit on BLUR, never per keystroke, and an empty edit is abandoned', async () => {
    // 🔴 THE FIXTURE HAS TO STORE, or the abandonment half proves nothing.
    // With the static document (quiet hours permanently null) an emptied field
    // is byte-identical to an untouched one, so "no second write" was
    // satisfied by `draft === value` and NOT by the abandon branch, measured:
    // deleting that branch outright left this test green. Store the schedule
    // and re-read it, the way the proxy does, and the empty edit becomes a
    // real clear attempt that has to be refused.
    const schedule: { start: string | null; end: string | null } = { start: null, end: null }
    getPrefsDocument.mockImplementation(async () => {
      const d = doc()
      d.recipient_preferences.quiet_hours_start = schedule.start
      d.recipient_preferences.quiet_hours_end = schedule.end
      return d
    })
    updatePrefsBooleans.mockImplementation(async (w: any) => {
      if (w && !w.categories) {
        schedule.start = w.quiet_hours_start
        schedule.end = w.quiet_hours_end
        return { ok: true } as any
      }
      return { ...doc(), ok: true }
    })

    await renderTab()
    const start = screen.getByLabelText('Quiet hours start') as HTMLInputElement
    fireEvent.change(start, { target: { value: '22:00' } })
    expect(start.value).toBe('22:00') // the edit is held, not written
    expect(updatePrefsBooleans).not.toHaveBeenCalled() // typing alone never writes

    // 🔴 NO waitFor, AND ONE DISPATCH — both deliberate, both were wrong here
    // before. `fireEvent.blur` already dispatches focusout (React's real
    // onBlur channel) and then blur, so the earlier extra `fireEvent.focusOut`
    // fired the handler twice and left the count at one only because an
    // in-flight `saving` flag happened to swallow the second. And the write is
    // issued SYNCHRONOUSLY inside the blur handler, so there is no budget to
    // widen: the old `{ timeout: 5000 }` could never turn a lost write into a
    // found one, it only made the failure take five seconds to report.
    fireEvent.blur(start)
    expect(updatePrefsBooleans).toHaveBeenCalledTimes(1)
    const body = updatePrefsBooleans.mock.calls[0][0]
    expect(body.quiet_hours_start).toBe('22:00')
    expect(body.quiet_hours_end).toBe('08:00') // pairing at commit, not per keystroke

    // Let that write land before testing abandonment, otherwise `saving` is
    // still true and the "no second write" assertion below would pass for the
    // wrong reason, proving nothing about abandonment at all.
    await waitFor(() => expect(start.value).toBe('22:00'))
    expect(getPrefsDocument).toHaveBeenCalledTimes(2) // {"ok":true} → re-read

    // An empty intermediate is abandoned, never written as a clear, and the
    // field snaps back to the STORED 22:00 rather than showing a half-edit.
    fireEvent.change(start, { target: { value: '' } })
    expect(start.value).toBe('')
    fireEvent.blur(start)
    expect(updatePrefsBooleans).toHaveBeenCalledTimes(1)
    expect(start.value).toBe('22:00')

    // …and the field is genuinely writable here, so the line above measured
    // abandonment, not a save still stuck in flight.
    fireEvent.change(start, { target: { value: '23:15' } })
    fireEvent.blur(start)
    expect(updatePrefsBooleans).toHaveBeenCalledTimes(2)
    expect(updatePrefsBooleans.mock.calls[1][0].quiet_hours_start).toBe('23:15')
    await waitFor(() => expect(start.value).toBe('23:15'))
  })

  it('🔴 a keystroke is never clobbered by a late prop→draft resync (the CI flake)', async () => {
    // Resolve in a MICROTASK on the commit that mounts the schedule fields:
    // React has rendered them but its scheduled passive-effect task has not
    // run yet. TimeField used to resync its draft from the prop in a
    // `useEffect`, which flushed in exactly that window, the keystroke's
    // setDraft was overwritten by the effect's, the typed time vanished, and
    // the blur that followed had nothing to commit. That is the CI-only
    // "expected 1 times, got 0" (pipelines 1089, 1180): not a slow budget, a
    // lost edit. Starving CI widens the window; a real browser deferring the
    // effect past a keystroke would do the same to a customer.
    let bail: ReturnType<typeof setTimeout> | undefined
    const mounted = new Promise<void>((resolve, reject) => {
      const mo = new MutationObserver(() => {
        if (document.querySelector('[aria-label="Quiet hours start"]')) {
          mo.disconnect()
          clearTimeout(bail)
          resolve()
        }
      })
      mo.observe(document.body, { childList: true, subtree: true })
      bail = setTimeout(() => {
        mo.disconnect()
        reject(new Error('the schedule band never mounted'))
      }, 4000)
    })

    render(<MyPreferencesTab />)
    await mounted

    const start = document.querySelector('[aria-label="Quiet hours start"]') as HTMLInputElement
    fireEvent.change(start, { target: { value: '22:00' } })
    expect(start.value).toBe('22:00') // survives whatever React flushes next
    fireEvent.blur(start)
    expect(updatePrefsBooleans).toHaveBeenCalledTimes(1)
    expect(updatePrefsBooleans.mock.calls[0][0].quiet_hours_start).toBe('22:00')
    await waitFor(() => expect(getPrefsDocument).toHaveBeenCalledTimes(2))
  })

  it('a failed load renders the error state, naming the thing that failed, never an empty panel', async () => {
    getPrefsDocument.mockRejectedValue(new Error('boom'))
    render(<MyPreferencesTab />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText("Couldn't load your notification preferences")).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
    expect(screen.queryByText('Delivery')).toBeNull()
  })

  it('never uses an em dash or en dash anywhere in the file', () => {
    // Unlike a literal "...", an em/en dash character has no legitimate role
    // in TSX syntax outside a comment, a string, or bare JSX text, so this
    // scans the WHOLE comment-stripped source, not just quoted literals.
    // That is the gap a literals-only scan has: this file's copy is not all
    // inside quotes (e.g. "Days kept after being read." is bare JSX text
    // between a <p> tag's children), and a dash landing there would slip
    // past a scan that only looked inside "..." and '...'.
    const stripped = stripComments(readFileSync(SOURCE_PATH, 'utf8'))
    expect(stripped).not.toMatch(/[—–]/)
  })

  it('never uses a literal three-dot ellipsis in its user-facing copy', () => {
    // Scoped to string/template literals: this file legitimately spreads
    // objects (`...patch`, `...zones`), and a bare `...` scan over the whole
    // file would flag that JS syntax as if it were prose.
    const stripped = stripComments(readFileSync(SOURCE_PATH, 'utf8'))
    const literals =
      stripped.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g) ?? []
    const offenders = literals.filter((s) => /\.\.\./.test(s))
    expect(offenders).toEqual([])
  })
})
