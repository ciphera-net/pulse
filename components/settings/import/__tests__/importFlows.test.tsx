import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SWRConfig } from 'swr'

// ─── Settings → Data → Import history: the upload and Matomo flows (PULSE-118 M11, M12; R51 option B) ──────────
//
// The flows' behaviour, state by state, as the Import tab's suite pinned it before the settings release (the ruled
// shots A1–A9, Matomo, the mapping step, double presses and races), now on the Data page that runs them, plus what
// option B draws: the file as one line with its refusal under it, the check's figures and two lists, the events as
// one table, the progress in the source's own row. lib/import is mocked at its public boundary (prepareImport,
// deleteImport): a Worker cannot run here, and the library has its own suites. The server is mocked at the API
// module the flows call (lib/api/dataImports), so the real hooks, SWR, the error map and the display words all run.

const h = vi.hoisted(() => ({
  canManage: true,
  sources: { sources: [] as { source: string; kind: string; enabled: boolean }[] },
  slot: { existing_import: null as unknown },
  prepareImport: vi.fn(),
  deleteImport: vi.fn(),
  connectMatomo: vi.fn(),
  getMatomoProperties: vi.fn(),
  confirmDataImport: vi.fn(),
  previewDataImportEvents: vi.fn(),
  getImportSlot: vi.fn(),
  listGoals: vi.fn(),
  getGoalStats: vi.fn(),
}))

vi.mock('@/lib/auth/permissions', () => ({ useCan: (p: string) => (p === 'integrations.manage' ? h.canManage : false) }))
vi.mock('@/lib/swr/dashboard', () => {
  const status = { data: { connected: false }, error: undefined, isLoading: false, mutate: () => undefined }
  return {
    useSite: () => ({ data: { id: 's1', domain: 'example.com', timezone: 'Europe/Brussels' }, error: undefined, mutate: () => undefined }),
    useGSCStatus: () => status,
    useBingStatus: () => status,
    useBunnyStatus: () => status,
  }
})
// The services have their own suite (DataPage.test.tsx); this one is the import's.
vi.mock('@/components/settings/pages/data/ConnectedServices', () => ({ ConnectedServices: () => null }))
vi.mock('@/lib/hooks/useDisplayZone', () => ({ useDisplayZone: () => ({ zone: 'Europe/Brussels' }) }))
vi.mock('@/lib/api/dataImports', () => ({
  getImportSources: vi.fn(async () => h.sources),
  getImportSlot: (...a: unknown[]) => h.getImportSlot(...a),
  connectMatomo: (...a: unknown[]) => h.connectMatomo(...a),
  getMatomoProperties: (...a: unknown[]) => h.getMatomoProperties(...a),
  confirmDataImport: (...a: unknown[]) => h.confirmDataImport(...a),
  previewDataImportEvents: (...a: unknown[]) => h.previewDataImportEvents(...a),
}))
// M12: the mapping step reads the site's goals and the names Pulse measured.
vi.mock('@/lib/api/goals', () => ({ listGoals: (...a: unknown[]) => h.listGoals(...a) }))
vi.mock('@/lib/api/stats', () => ({ getGoalStats: (...a: unknown[]) => h.getGoalStats(...a) }))
vi.mock('@/lib/import', () => ({
  prepareImport: (...a: unknown[]) => h.prepareImport(...a),
  deleteImport: (...a: unknown[]) => h.deleteImport(...a),
}))
vi.mock('@/lib/import/app-transport', () => ({ appTransport: vi.fn() }))

vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, variant, size, asChild, isLoading, ...props }: any) => (
    <button data-variant={variant ?? 'primary'} {...props}>
      {children}
    </button>
  ),
  // Facet's Input says its `error` under the field and marks the field invalid.
  Input: ({ error, ...props }: any) => (
    <>
      <input aria-invalid={error ? true : undefined} {...props} />
      {error ? <p>{error}</p> : null}
    </>
  ),
  Toggle: ({ checked, onChange, disabled, 'aria-label': ariaLabel }: any) => (
    <button type="button" role="switch" aria-checked={checked} aria-label={ariaLabel} disabled={disabled} onClick={() => onChange()} />
  ),
  Select: ({ id, value, onChange, options, groups, placeholder, disabled, 'aria-label': ariaLabel }: any) => (
    <select id={id} aria-label={ariaLabel} value={value} disabled={disabled} onChange={(e) => onChange?.(e.target.value)}>
      <option value="">{placeholder}</option>
      {options?.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      {groups?.map((g: any) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o: any) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  ),
  toast: { success: vi.fn(), error: vi.fn() },
}))

// The hold dialog and the Undo window are facet-hold's own suite; here a confirm is one click and each deferred
// delete is committed, undone or failed by the test itself (PUL-28).
vi.mock('@ciphera-net/facet-hold', async () => (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())

import DataPage from '@/components/settings/pages/data/DataPage'
import { ImportError } from '@/lib/import/errors'
import { toast } from '@ciphera-net/facet'
import { deferred, resetDeferred, commitLast, undoLast } from '@/lib/hold/__tests__/facetHoldStandIn'

// ─── fixtures ──────────────────────────────────────────────────────────────
const PLAUSIBLE = { source: 'plausible', kind: 'upload_aggregate', enabled: true }
const MATOMO = { source: 'matomo', kind: 'api_key', enabled: true }
const GA4 = { source: 'ga4', kind: 'oauth', enabled: true }

const UNEXPECTED = "Pulse sent an answer this page can't read. Nothing more was saved. Try again."
const IDLE_NOTE =
  "Pulse imports the days before it started measuring this site, back as far as this site keeps data (Privacy). One import per site. An export you upload is read in your browser, and Pulse receives only its daily counts, never the file."

function status(over: Record<string, unknown> = {}) {
  return {
    id: 'imp-1',
    source: 'plausible',
    kind: 'upload_aggregate',
    status: 'completed',
    error_code: null,
    source_timezone: 'Europe/Brussels',
    range_start: '2025-01-01',
    range_end: '2026-09-14',
    steps_total: 38,
    cursor: { step: 38, part: 0 },
    fingerprint: 'f'.repeat(64),
    totals: { rows: { daily: 622, monthly: 0, dimensions: 1, acquisition: 1 }, visitors: 212480, pageviews: 486113 },
    skipped: { browser: { outside_history_window: 412 }, server: {} },
    visits_are_visitors: false,
    import_through: '2026-09-14',
    created_at: '2026-09-27T10:00:00Z',
    started_at: '2026-09-27T10:00:00Z',
    progressed_at: '2026-09-27T10:40:00Z',
    finished_at: new Date(Date.now() - 60_000).toISOString(),
    ...over,
  }
}

function plan(over: Record<string, unknown> = {}) {
  return {
    source: 'plausible',
    kind: 'upload_aggregate',
    visits_are_visitors: false,
    range_start: '2025-01-01',
    range_end: '2026-09-14',
    steps: [{ start: '2025-01-01', end: '2026-09-14', parts: 38 }],
    parts_total: 38,
    fingerprint: 'f'.repeat(64),
    totals: { rows: { daily: 622, monthly: 0, dimensions: 1, acquisition: 1 }, visitors: 212480, pageviews: 486113 },
    skipped: { outside_history_window: 412, pulse_measured: 3 },
    skipped_samples: { outside_history_window: [{ file: 'imported_visitors.csv', line: 2 }] },
    ignored_files: ['imported_custom_props.csv'],
    notes: {},
    events: [],
    ...over,
  }
}

function preparedImport(over: Record<string, unknown> = {}) {
  return {
    window: {
      source: 'plausible',
      kind: 'upload_aggregate',
      site_timezone: 'Europe/Brussels',
      source_timezone: 'Europe/Brussels',
      allowed_from: '2025-01-01',
      allowed_through: '2026-09-14',
      collect: {},
      existing_import: null,
    },
    plan: plan(),
    sourceTimezone: 'Europe/Brussels',
    resume: null,
    upload: vi.fn(),
    dispose: vi.fn(),
    ...over,
  }
}

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <DataPage siteId="s1" />
    </SWRConfig>,
  )
}

const IDS: Record<string, string> = { 'Google Analytics': 'ga4', Plausible: 'plausible', Matomo: 'matomo' }

/** One source's block: its flow, or the settled import's record. */
function block(name: string): HTMLElement {
  const id = IDS[name]
  const el = document.querySelector(`[data-import-source="${id}"], [data-data-import="${id}"]`)
  if (!el) throw new Error(`no block for ${name}`)
  return el as HTMLElement
}
const findBlock = (name: string) => waitFor(() => block(name))

/** The state leading a block's caption (R24, R32): its words and its colour meaning. */
function state(b: HTMLElement): { text: string; tone: string | null } {
  const el = b.querySelector('[data-kit-status]')
  if (!el) throw new Error('no state in this block')
  return { text: el.textContent ?? '', tone: el.getAttribute('data-kit-status') }
}

/** The figures over the check (B), as "Label value" pairs. */
function figures(): string[] {
  const el = document.querySelector('[data-import-figures]')
  if (!el) throw new Error('no figures')
  return [...el.querySelectorAll('.grid > div')].map((c) => [...c.querySelectorAll('p')].map((p) => p.textContent).join(' '))
}

const section = () => document.querySelector('[data-kit-section="Import history"]') as HTMLElement

function chooseFile(name = 'plausible-export.zip') {
  const input = screen.getByTestId('import-file-input') as HTMLInputElement
  const file = new File(['PK'], name, { type: 'application/zip' })
  fireEvent.change(input, { target: { files: [file] } })
  return file
}

async function openPlausible() {
  fireEvent.click(await within(await findBlock('Plausible')).findByRole('button', { name: 'Upload' }))
}

beforeEach(() => {
  h.canManage = true
  h.sources = { sources: [GA4, PLAUSIBLE, MATOMO] }
  h.slot = { existing_import: null }
  h.getImportSlot.mockReset().mockImplementation(async () => h.slot)
  h.prepareImport.mockReset()
  h.deleteImport.mockReset().mockResolvedValue(undefined)
  h.connectMatomo.mockReset()
  h.getMatomoProperties.mockReset()
  h.confirmDataImport.mockReset()
  h.previewDataImportEvents.mockReset().mockResolvedValue({ events: [] })
  h.listGoals.mockReset().mockResolvedValue([])
  h.getGoalStats.mockReset().mockResolvedValue([])
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  window.history.replaceState({}, '', '/settings/site/integrations')
  resetDeferred()
})

// ─── A1: the sources ───────────────────────────────────────────────────────
describe('the sources (A1)', () => {
  it('lists the sources this build can drive, in the server order, each as a kit row with its full-colour logo', async () => {
    renderPage()
    await findBlock('Plausible')
    expect(
      within(section()).getByText(
        "Bring this site's history from another analytics tool. Imported days are marked as imported on the dashboard and in exports.",
      ),
    ).toBeInTheDocument()
    const order = [...section().querySelectorAll('[data-import-source]')].map((el) => el.getAttribute('data-import-source'))
    expect(order).toEqual(['ga4', 'plausible', 'matomo'])
    expect(within(block('Plausible')).getByRole('button', { name: 'Upload' })).toBeEnabled()
    expect(within(block('Matomo')).getByRole('button', { name: 'Connect' })).toBeEnabled()
    // Full colour, always (owner, Q-M11), as a row's logo (R9). The file name is the slug in hex (lib/comparisonLogos.ts).
    const files: Record<string, string> = { plausible: '_706c61757369626c65', matomo: '_6d61746f6d6f' }
    for (const id of ['plausible', 'matomo']) {
      const img = screen.getByTestId(`import-logo-${id}`)
      expect(img).toHaveAttribute('src', `https://cdn.ciphera.net/website/blog/tools/${files[id]}.png`)
      expect(img.closest('[data-kit-icon="logo"]')).not.toBeNull()
    }
    expect(document.querySelector('[data-data-import-note]')!.textContent).toBe(IDLE_NOTE)
  })
})

// ─── A2: the file and the timezone ─────────────────────────────────────────
describe('choosing a file (A2)', () => {
  it('opens under its row: the file as one dashed line, the timezone picker, and Review import on the right', async () => {
    renderPage()
    await openPlausible()
    const b = block('Plausible')
    expect(within(b).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(b).getByText('Choose the ZIP file')).toBeInTheDocument()
    expect(within(b).getByText('In Plausible: Site settings, Imports and Exports, Export to CSV. Plausible emails you a link to a ZIP file.')).toBeInTheDocument()
    // B: one dashed line as tall as the settings fields, not today's tall drop area.
    const drop = within(b).getByTestId('import-dropzone')
    expect(drop.className).toContain('h-11')
    expect(drop.className).toContain('border-dashed')
    expect(drop.className).not.toContain('py-6')
    const input = screen.getByTestId('import-file-input')
    expect(input).toHaveAttribute('accept', expect.stringContaining('.zip'))
    expect(input).not.toHaveAttribute('multiple')
    // The timezone defaults to the site's; the deck's placeholder (§8.3) is "Pick a timezone".
    const tz = within(b).getByLabelText('Plausible timezone') as HTMLSelectElement
    expect(tz.value).toBe('Europe/Brussels')
    expect(within(tz).getByText('Pick a timezone')).toBeInTheDocument()
    expect(within(b).queryByText('Select a timezone…')).toBeNull()
    const review = within(b).getByRole('button', { name: 'Review import' })
    expect(review.closest('[data-import-actions]')).not.toBeNull()
    expect(review).toBeDisabled()
    chooseFile()
    expect(within(b).getByText('plausible-export.zip')).toBeInTheDocument()
    expect(review).toBeEnabled()
  })

  it('keeps one flow open at a time', async () => {
    renderPage()
    await openPlausible()
    expect(screen.getByTestId('import-choose')).toBeInTheDocument()
    fireEvent.click(within(block('Matomo')).getByRole('button', { name: 'Connect' }))
    expect(screen.queryByTestId('import-choose')).toBeNull()
    expect(screen.getByTestId('matomo-connect')).toBeInTheDocument()
  })
})

// ─── reading, then A5: the check ───────────────────────────────────────────
describe('reading and the check (A5)', () => {
  it('shows the read progress, then the check: the figures, the two lists side by side, and what was skipped', async () => {
    let onEvent: ((e: unknown) => void) | undefined
    let resolve: (v: unknown) => void = () => {}
    h.prepareImport.mockImplementation((opts: any) => {
      onEvent = opts.onEvent
      return new Promise((r) => (resolve = r))
    })
    renderPage()
    await openPlausible()
    chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }))

    // The library is handed the file, the site and the chosen zone.
    const opts = h.prepareImport.mock.calls[0][0]
    expect(opts).toMatchObject({ siteId: 's1', source: 'plausible', sourceTimezone: 'Europe/Brussels' })
    expect(opts.file.name).toBe('plausible-export.zip')

    act(() => onEvent!({ type: 'progress', stage: 'reading', bytesRead: 50, bytesTotal: 100 }))
    expect(screen.getByText('Reading plausible-export.zip')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('Read here, in your browser. Nothing is sent until you confirm.')).toBeInTheDocument()

    await act(async () => resolve(preparedImport()))

    const confirm = screen.getByTestId('import-confirm')
    const b = block('Plausible')
    expect(b.querySelector('[data-kit-row]')!.textContent).toContain('Ready to import · plausible-export.zip · read in your browser')
    expect(state(b)).toEqual({ text: 'Ready to import', tone: 'off' })
    // B: the three numbers that decide an import are figures, the days and the zone under them.
    expect(figures()).toEqual(['Days 622', 'Visitors 212,480', 'Pageviews 486,113'])
    expect(confirm.querySelector('[data-import-figures-line]')!.textContent).toBe(
      '1 Jan 2025 to 14 Sep 2026 · Europe/Brussels, the same as this site. Pulse measures this site from 15 Sep 2026, so the import stops the day before.',
    )
    // Imported and Not imported side by side.
    const lists = confirm.querySelector('[data-import-lists]') as HTMLElement
    expect(lists.className).toContain('md:grid-cols-2')
    const [imported, notImported] = [...lists.children] as HTMLElement[]
    expect(within(imported).getByText('Imported')).toBeInTheDocument()
    expect(within(imported).getByText('Visitors, visits and pageviews')).toBeInTheDocument()
    expect(within(notImported).getByText('Not imported')).toBeInTheDocument()
    expect(within(notImported).getByText("Languages and screen sizes: Plausible doesn't export them")).toBeInTheDocument()
    // W-M12-4: the line that replaced "Events and goals: coming in a later release".
    expect(within(notImported).getByText('Event properties, and the link or page each event happened on')).toBeInTheDocument()
    expect(within(confirm).queryByText(/coming in a later release/)).toBeNull()
    expect(within(notImported).getByText("Files it doesn't read: imported_custom_props.csv")).toBeInTheDocument()
    // A file with no events has no Events table and no "named as you choose" line.
    expect(screen.queryByTestId('import-event-mapping')).toBeNull()
    expect(within(confirm).queryByText('Events, named as you choose below')).toBeNull()
    // W1 A, the aggregate sources' visitors caveat.
    expect(
      within(confirm).getByText("Visitors are Plausible's daily counts added up, so over a range someone who came on three days counts three times."),
    ).toBeInTheDocument()
    // Copy deck §8.3: the days a site no longer keeps, in Privacy's words.
    expect(within(confirm).getByText('412 rows older than this site keeps data')).toBeInTheDocument()
    expect(within(confirm).getByText('3 rows on days Pulse already measured')).toBeInTheDocument()
    expect(within(confirm).queryByText(/history window/)).toBeNull()
    // Show lines: file and line only.
    fireEvent.click(within(confirm).getByRole('button', { name: 'Show lines' }))
    expect(within(screen.getByTestId('import-skip-samples')).getByText('imported_visitors.csv')).toBeInTheDocument()
    // The deck's button (§8.3), as Google Analytics and Matomo say it, in the step's own row on the right edge.
    const start = within(confirm).getByRole('button', { name: 'Start the import' })
    expect(start.closest('[data-import-actions]')).not.toBeNull()
    expect(within(confirm).queryByRole('button', { name: /^Import \d/ })).toBeNull()
  })

  it('disposes the prepared import on Back and on Cancel', async () => {
    const prepared = preparedImport()
    h.prepareImport.mockResolvedValue(prepared)
    renderPage()
    await openPlausible()
    chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }))
    expect(prepared.dispose).toHaveBeenCalledTimes(1)
    // Back keeps the file: the chooser is showing it.
    expect(screen.getByText('plausible-export.zip')).toBeInTheDocument()

    const again = preparedImport()
    h.prepareImport.mockResolvedValue(again)
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }))
    await screen.findByTestId('import-confirm')
    fireEvent.click(within(block('Plausible')).getByRole('button', { name: 'Cancel' }))
    expect(again.dispose).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('import-confirm')).toBeNull()
  })

  it('closes a row left on its check when another row opens, and disposes its prepared import', async () => {
    const prepared = preparedImport()
    h.prepareImport.mockResolvedValue(prepared)
    renderPage()
    await openPlausible()
    chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }))
    await screen.findByTestId('import-confirm')
    // Nothing holds the slot yet (M2-c: no import exists before the first write), so Matomo can open.
    fireEvent.click(within(block('Matomo')).getByRole('button', { name: 'Connect' }))
    // One open at a time (M11-d): the check closes with its row.
    expect(screen.queryByTestId('import-confirm')).toBeNull()
    expect(screen.getByTestId('matomo-connect')).toBeInTheDocument()
    expect(prepared.dispose).toHaveBeenCalledTimes(1)
    expect(within(block('Plausible')).getByRole('button', { name: 'Upload' })).toBeEnabled()
  })

  it('stops reading when another row opens, and never springs back to its check', async () => {
    let signal: AbortSignal | undefined
    let resolve: (v: unknown) => void = () => {}
    h.prepareImport.mockImplementation((opts: any) => {
      signal = opts.signal
      return new Promise((r) => (resolve = r))
    })
    renderPage()
    await openPlausible()
    chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }))
    expect(screen.getByRole('button', { name: 'Reading…' })).toBeInTheDocument()
    fireEvent.click(within(block('Matomo')).getByRole('button', { name: 'Connect' }))
    expect(signal!.aborted).toBe(true)
    // A plan that lands after its row closed is let go, never shown.
    const late = preparedImport()
    await act(async () => resolve(late))
    expect(screen.queryByTestId('import-confirm')).toBeNull()
    expect(late.dispose).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('matomo-connect')).toBeInTheDocument()
  })

  it('disposes the prepared import when the page unmounts', async () => {
    const prepared = preparedImport()
    h.prepareImport.mockResolvedValue(prepared)
    const { unmount } = renderPage()
    await openPlausible()
    chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }))
    await screen.findByTestId('import-confirm')
    unmount()
    expect(prepared.dispose).toHaveBeenCalled()
  })

  it('says a file it cannot use under the file, in coral, with the field’s edge coral, and keeps the chooser (B)', async () => {
    h.prepareImport.mockRejectedValue(
      new ImportError('wrong_file', 'raw', { detail: { reason: 'missing_columns', file: 'imported_visitors.csv', columns: ['date'] } }),
    )
    renderPage()
    await openPlausible()
    chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }))
    const words = "This doesn't look like a Plausible export. imported_visitors.csv is missing the date columns."
    const line = await screen.findByText(words)
    expect(line.className).toContain('text-destructive')
    const alert = line.closest('[role="alert"]') as HTMLElement
    expect(alert.getAttribute('data-import-error')).toBe('field')
    // Under the file it is about: in the file's own field, after the dashed line.
    const field = screen.getByTestId('import-dropzone')
    expect(field.closest('[data-import-file]')!.contains(alert)).toBe(true)
    expect(field.className).toContain('border-destructive')
    expect(field.getAttribute('aria-describedby')).toBe(line.id)
    expect(screen.queryByText('raw')).toBeNull()
    // Choosing another file takes the refusal away.
    chooseFile('another.zip')
    expect(screen.queryByText(words)).toBeNull()
    expect(screen.getByTestId('import-dropzone').className).not.toContain('border-destructive')
    expect(screen.getByTestId('import-dropzone')).not.toHaveAttribute('aria-describedby')
  })

  it('never shows a code it does not know: the unexpected sentence, and the code behind Details', async () => {
    h.prepareImport.mockRejectedValue(new ImportError('unexpected_response', 'HTTP 418', { detail: { server_code: 'teapot' } }))
    renderPage()
    await openPlausible()
    chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }))
    expect(await screen.findByText(UNEXPECTED)).toBeInTheDocument()
    expect(within(screen.getByTestId('import-error-details')).getByText('teapot')).toBeInTheDocument()
    expect(screen.queryByText('HTTP 418')).toBeNull()
  })
})

// ─── A6: uploading from this tab ────────────────────────────────────────────
describe('uploading (A6)', () => {
  it('shows the progress in the source’s own row: its line, and its hairline filling; the other rows lock', async () => {
    let onEvent: ((e: unknown) => void) | undefined
    const prepared = preparedImport()
    prepared.upload.mockReturnValue(new Promise(() => {}))
    h.prepareImport.mockImplementation(async (opts: any) => {
      onEvent = opts.onEvent
      return prepared
    })
    renderPage()
    await openPlausible()
    chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start the import' }))
    act(() => onEvent!({ type: 'progress', stage: 'uploading', importId: 'imp-1', partsDone: 14, partsTotal: 38 }))

    const b = block('Plausible')
    expect(state(b)).toEqual({ text: 'Importing', tone: 'live' })
    expect(b.querySelector('[data-import-progress="line"]')!.textContent).toBe(
      'Part 14 of 38 · Keep this tab open until it finishes. If it closes, choose the same file again and it carries on where it stopped.',
    )
    // One bar: the row's hairline, at 37%, its fill orange; no Progress row under it.
    const bars = within(b).getAllByRole('progressbar')
    expect(bars).toHaveLength(1)
    expect(bars[0].getAttribute('data-import-progress')).toBe('hairline')
    expect(bars[0]).toHaveAttribute('aria-valuenow', '37')
    expect(bars[0].className).toContain('-bottom-px')
    const fill = within(b).getByTestId('import-progress-fill')
    expect(fill.style.width).toBe('37%')
    expect(fill.className).toContain('bg-primary')
    expect(within(b).queryByText('Progress')).toBeNull()
    // One import per site: while it holds the slot it is the section, and the section says so once.
    expect(document.querySelector('[data-import-source="matomo"]')).toBeNull()
    expect(screen.getByText('One import per site. Delete this one to import from another tool.')).toBeInTheDocument()
  })

  it('offers Try again after a network blip, under the row, and sends the SAME prepared upload', async () => {
    const prepared = preparedImport()
    prepared.upload.mockRejectedValueOnce(new ImportError('network', 'offline')).mockReturnValueOnce(new Promise(() => {}))
    h.prepareImport.mockResolvedValue(prepared)
    renderPage()
    await openPlausible()
    chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start the import' }))
    const line = await screen.findByText("Pulse can't be reached. The import is paused where it was and continues when you try again.")
    expect(line.closest('[data-import-error="line"]')).not.toBeNull()
    expect(line.className).toContain('text-destructive')
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(prepared.upload).toHaveBeenCalledTimes(2))
    expect(h.prepareImport).toHaveBeenCalledTimes(1)
  })
})

// ─── A7 + A9: done, and delete ──────────────────────────────────────────────
describe('done (A7) and delete (A9)', () => {
  it('shows the finished import as its row, with the one-minute caveat and Details', async () => {
    h.slot = { existing_import: status() }
    renderPage()
    const b = await findBlock('Plausible')
    expect(state(b).tone).toBe('live')
    expect(state(b).text).toMatch(/^Imported \d{1,2} [A-Z][a-z]{2}/)
    expect(b.textContent).toContain('1 Jan 2025 to 14 Sep 2026')
    expect(within(b).getByText('It can take a minute before the dashboard shows the imported days.')).toBeInTheDocument()
    fireEvent.click(within(b).getByRole('button', { name: 'Details' }))
    const details = b.querySelector('[data-data-import-details]') as HTMLElement
    expect(within(details).getByText('1 Jan 2025 to 14 Sep 2026 · 622 days')).toBeInTheDocument()
    expect(within(details).getByText('212,480')).toBeInTheDocument()
    expect(within(details).getByText('412 rows older than this site keeps data')).toBeInTheDocument()
    expect(within(details).getByText('Your export file never left your browser.')).toBeInTheDocument()
    expect(screen.getByText('One import per site. Delete this one to import from another tool.')).toBeInTheDocument()
    // The site's one import is the section: the other sources leave it.
    expect(document.querySelector('[data-import-source="matomo"]')).toBeNull()
  })

  it('drops the one-minute caveat once the cache has long expired', async () => {
    h.slot = { existing_import: status({ finished_at: '2026-01-01T00:00:00Z' }) }
    renderPage()
    await findBlock('Plausible')
    expect(screen.queryByText('It can take a minute before the dashboard shows the imported days.')).toBeNull()
  })

  it('names the import in a hold dialog, hides it at once on confirm, and sends nothing until the Undo window runs out', async () => {
    h.slot = { existing_import: status() }
    renderPage()
    const del = await within(await findBlock('Plausible')).findByRole('button', { name: 'Delete imported data' })
    expect(del.className).toMatch(/text-destructive/)
    fireEvent.click(del)
    const dialog = screen.getByRole('dialog', { name: 'Delete the data imported from Plausible?' })
    expect(
      within(dialog).getByText(
        "Everything imported from Plausible leaves every chart, card, export and API answer. What Pulse measured itself stays. You can import again afterwards. After 6 seconds this can't be undone.",
      ),
    ).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to delete' }))

    // Gone at once; the slot reads as empty, and nothing has been sent yet.
    await waitFor(() => expect(document.querySelector('[data-data-import-note]')!.textContent).toBe(IDLE_NOTE))
    expect(h.deleteImport).not.toHaveBeenCalled()
    expect(deferred[0]!.message).toBe('Imported data from Plausible deleted')

    const reads = h.getImportSlot.mock.calls.length
    h.slot = { existing_import: null }
    await act(() => commitLast())
    expect(h.deleteImport).toHaveBeenCalledWith(expect.objectContaining({ siteId: 's1', importId: 'imp-1', keepalive: false }))
    await waitFor(() => expect(h.getImportSlot.mock.calls.length).toBeGreaterThan(reads))
  })

  it('passes keepalive through to the request on a commit sent as the page closes', async () => {
    h.slot = { existing_import: status() }
    renderPage()
    fireEvent.click(await within(await findBlock('Plausible')).findByRole('button', { name: 'Delete imported data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    await act(() => commitLast({ keepalive: true }))
    expect(h.deleteImport).toHaveBeenCalledWith(expect.objectContaining({ siteId: 's1', importId: 'imp-1', keepalive: true }))
  })

  it('Undo restores the import and sends nothing', async () => {
    h.slot = { existing_import: status() }
    renderPage()
    fireEvent.click(await within(await findBlock('Plausible')).findByRole('button', { name: 'Delete imported data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    await waitFor(() => expect(document.querySelector('[data-data-import-note]')!.textContent).toBe(IDLE_NOTE))

    act(() => undoLast())
    expect(await screen.findByTestId('import-record')).toBeInTheDocument()
    expect(h.deleteImport).not.toHaveBeenCalled()
  })

  it("a rejected delete brings the import back, in the import error map's words", async () => {
    h.slot = { existing_import: status() }
    h.deleteImport.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    fireEvent.click(await within(await findBlock('Plausible')).findByRole('button', { name: 'Delete imported data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    await waitFor(() => expect(document.querySelector('[data-data-import-note]')!.textContent).toBe(IDLE_NOTE))

    await act(() => commitLast())
    expect(toast.error).toHaveBeenCalledWith("Pulse can't be reached. The import is paused where it was and continues when you try again.")
    expect(await screen.findByTestId('import-record')).toBeInTheDocument()
  })
})

// ─── A8: stopped, resumable ─────────────────────────────────────────────────
describe('stopped (A8)', () => {
  const stopped = () =>
    status({ status: 'failed', error_code: 'upload_abandoned', cursor: { step: 13, part: 0 }, finished_at: null, progressed_at: '2026-09-26T10:00:00Z' })

  it('names where it stopped under its caption and carries on from the same file', async () => {
    h.slot = { existing_import: stopped() }
    const prepared = preparedImport({ resume: status({ status: 'failed', error_code: 'upload_abandoned' }) })
    prepared.upload.mockReturnValue(new Promise(() => {}))
    h.prepareImport.mockResolvedValue(prepared)
    renderPage()
    const b = await findBlock('Plausible')
    expect(state(b)).toEqual({ text: 'Stopped', tone: 'off' })
    // The reason is the line under the caption, as a failed import's is; no box, and no hairline (it isn't moving).
    expect(within(b).getByText(/^The upload stopped at part 14 of 38 on 26 Sep/)).toBeInTheDocument()
    expect(within(b).queryByRole('alert')).toBeNull()
    expect(within(b).queryByRole('progressbar')).toBeNull()
    expect(within(b).getByRole('button', { name: 'Delete imported data' })).toBeInTheDocument()
    expect(within(b).getByText('Choose the same ZIP file')).toBeInTheDocument()
    const go = within(b).getByRole('button', { name: 'Continue the import' })
    expect(go.closest('[data-import-actions]')).not.toBeNull()
    expect(go).toBeDisabled()
    chooseFile()
    fireEvent.click(go)
    // A resume goes straight on: no second check, and no zone is sent (the import keeps its own).
    await waitFor(() => expect(prepared.upload).toHaveBeenCalledTimes(1))
    expect(h.prepareImport.mock.calls[0][0].sourceTimezone).toBeNull()
  })

  it('says a different file in words, under the file (plan_mismatch)', async () => {
    h.slot = { existing_import: stopped() }
    h.prepareImport.mockRejectedValue(new ImportError('plan_mismatch', 'raw', { detail: { import_id: 'imp-1' } }))
    renderPage()
    const b = await findBlock('Plausible')
    chooseFile('other.zip')
    fireEvent.click(within(b).getByRole('button', { name: 'Continue the import' }))
    const line = await screen.findByText(
      'This is a different file from the one this import started with. Choose the same file, or delete the import to start again.',
    )
    expect(line.closest('[data-import-error="field"]')).not.toBeNull()
  })
})

// ─── moving without this tab ────────────────────────────────────────────────
describe('an import moving without this tab', () => {
  it('shows an upload another tab is sending in its row, polls it, and still lets the same file carry it on', async () => {
    h.slot = { existing_import: status({ status: 'running', cursor: { step: 10, part: 0 }, finished_at: null }) }
    renderPage()
    const b = await findBlock('Plausible')
    expect(state(b)).toEqual({ text: 'Importing', tone: 'live' })
    expect(b.querySelector('[data-import-progress="line"]')!.textContent).toBe(
      'Part 10 of 38 · This import is uploading from another tab or window. If that tab closed, choose the same file here and it carries on where it stopped.',
    )
    expect(within(b).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '26')
    expect(within(b).getByText('Choose the same ZIP file')).toBeInTheDocument()
    // Polled every five seconds (M11-e) until it stops moving.
    const reads = h.getImportSlot.mock.calls.length
    h.slot = { existing_import: status() }
    await waitFor(() => expect(h.getImportSlot.mock.calls.length).toBeGreaterThan(reads), { timeout: 8_000 })
    expect(await screen.findByTestId('import-record')).toBeInTheDocument()
  }, 20_000)

  it('does not poll an import that has finished', async () => {
    h.slot = { existing_import: status() }
    renderPage()
    await findBlock('Plausible')
    const reads = h.getImportSlot.mock.calls.length
    await new Promise((r) => setTimeout(r, 6_000))
    expect(h.getImportSlot.mock.calls.length).toBe(reads)
  }, 20_000)

  it('shows a pull import in progress to every member, its progress in its row', async () => {
    h.canManage = false
    h.slot = {
      existing_import: status({ id: 'imp-m', source: 'matomo', kind: 'api_key', status: 'running', cursor: { step: 3, part: 0 }, steps_total: 20, fingerprint: null, finished_at: null }),
    }
    renderPage()
    const b = await findBlock('Matomo')
    expect(state(b)).toEqual({ text: 'Importing', tone: 'live' })
    expect(b.querySelector('[data-import-progress="line"]')!.textContent).toBe('Part 3 of 20 · You can close this page.')
    expect(within(b).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '15')
    expect(within(b).queryByRole('button')).toBeNull()
  })
})

// ─── an import this page has no flow for ────────────────────────────────────
describe('an import whose source has no flow in this build', () => {
  it('is still shown, with its state and Delete, so the one slot is never held invisibly', async () => {
    // The server no longer lists GA4 (its flag turned off), but the import stays.
    h.sources = { sources: [PLAUSIBLE, MATOMO] }
    h.slot = { existing_import: status({ id: 'imp-g', source: 'ga4', kind: 'oauth', fingerprint: null }) }
    renderPage()
    const record = await screen.findByTestId('import-record')
    expect(within(record).getByText('Google Analytics')).toBeInTheDocument()
    expect(state(record).tone).toBe('live')
    expect(within(record).getByRole('button', { name: 'Delete imported data' })).toBeInTheDocument()
    // The record is the section while it holds the slot.
    expect(document.querySelector('[data-import-source]')).toBeNull()
  })

  it('names a source this build does not know without its id', async () => {
    h.slot = { existing_import: status({ id: 'imp-x', source: 'brand_new_tool', kind: 'upload_raw', status: 'failed', error_code: 'upload_abandoned', finished_at: null }) }
    renderPage()
    const record = await screen.findByTestId('import-record')
    expect(within(record).getByText('the other tool')).toBeInTheDocument()
    expect(within(record).queryByText(/brand_new_tool/)).toBeNull()
    expect(state(record)).toEqual({ text: 'Stopped', tone: 'off' })
  })
})

// ─── failed, not resumable: Delete only ─────────────────────────────────────
describe('failed', () => {
  it('shows the failure in words under its caption, Failed in coral, and offers only Details and Delete', async () => {
    h.slot = { existing_import: status({ status: 'failed', error_code: 'some_future_code', finished_at: null }) }
    renderPage()
    const b = await findBlock('Plausible')
    expect(state(b)).toEqual({ text: 'Failed', tone: 'broken' })
    expect(within(b).getByText(UNEXPECTED)).toBeInTheDocument()
    expect(within(b).getByRole('button', { name: 'Delete imported data' })).toBeInTheDocument()
    expect(within(b).queryByTestId('import-dropzone')).toBeNull()
  })
})

// ─── every member reads the state; only owners and admins act ──────────────
describe('a member without integrations.manage', () => {
  it('sees the state and no controls but Details', async () => {
    h.canManage = false
    h.slot = { existing_import: status() }
    renderPage()
    const b = await findBlock('Plausible')
    expect(state(b).text).toMatch(/^Imported /)
    expect(b.textContent).toContain('1 Jan 2025 to 14 Sep 2026')
    expect(screen.queryByRole('button', { name: 'Delete imported data' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull()
  })

  it('sees a stopped upload without a file chooser', async () => {
    h.canManage = false
    h.slot = { existing_import: status({ status: 'failed', error_code: 'upload_abandoned', cursor: { step: 13, part: 0 }, finished_at: null }) }
    renderPage()
    const b = await findBlock('Plausible')
    expect(state(b).text).toBe('Stopped')
    expect(within(b).queryByTestId('import-dropzone')).toBeNull()
  })
})

// ─── M11-j: Matomo, against M10's route contract ────────────────────────────
describe('Matomo (M11-j)', () => {
  const awaiting = status({
    id: 'imp-m',
    source: 'matomo',
    kind: 'api_key',
    status: 'awaiting_property',
    range_start: null,
    range_end: null,
    steps_total: null,
    cursor: { step: 0, part: 0 },
    fingerprint: null,
    totals: null,
    skipped: { browser: {}, server: {} },
    finished_at: null,
  })

  it('connects with an address and a token, lists the sites, and starts the import', async () => {
    h.connectMatomo.mockImplementation(async () => {
      h.slot = { existing_import: awaiting }
      return awaiting
    })
    h.getMatomoProperties.mockResolvedValue({
      properties: [
        { id: '1', name: 'Other site', main_url: 'https://other.example', timezone: 'UTC' },
        { id: '3', name: 'acme.example', main_url: 'https://acme.example', timezone: 'Europe/Brussels' },
      ],
      suggested_id: '3',
    })
    h.confirmDataImport.mockResolvedValue(status({ id: 'imp-m', source: 'matomo', kind: 'api_key', status: 'pending', cursor: { step: 0, part: 0 }, finished_at: null }))
    renderPage()
    fireEvent.click(await within(await findBlock('Matomo')).findByRole('button', { name: 'Connect' }))
    const form = screen.getByTestId('matomo-connect')
    expect(within(form).getByText('Create a token for a user with View access to only this site. Pulse deletes its copy when the import ends.')).toBeInTheDocument()
    const load = within(form).getByRole('button', { name: 'Load sites' })
    expect(load).toBeDisabled()
    fireEvent.change(within(form).getByLabelText('Matomo address'), { target: { value: 'https://stats.example.org' } })
    fireEvent.change(within(form).getByLabelText('Token'), { target: { value: 'secret-token' } })
    expect(within(form).getByLabelText('Token')).toHaveAttribute('type', 'password')
    fireEvent.click(load)
    await waitFor(() =>
      expect(h.connectMatomo).toHaveBeenCalledWith('s1', { base_url: 'https://stats.example.org', token: 'secret-token', import_id: undefined }),
    )
    const select = (await screen.findByLabelText('Matomo site')) as HTMLSelectElement
    await waitFor(() => expect(select.value).toBe('3'))
    // M10's disclosures, before anything starts, under Worth knowing; the two lists side by side.
    expect(screen.getByText(/Matomo keeps at most 500 to 1,000 rows of a report per day by default/)).toBeInTheDocument()
    expect(document.querySelector('[data-import-lists]')).not.toBeNull()
    // Matomo has no plan to preview, so no figures.
    expect(document.querySelector('[data-import-figures]')).toBeNull()
    // M12: Start waits for the chosen site's events preview.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start the import' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Start the import' }))
    // M12: the preview named no events, so the import carries an empty map (events-capable, none to import).
    await waitFor(() => expect(h.previewDataImportEvents).toHaveBeenCalledWith('s1', 'imp-m', '3'))
    await waitFor(() => expect(h.confirmDataImport).toHaveBeenCalledWith('s1', 'imp-m', '3', {}))
    // Pull: the page can close, and the status is polled; the progress is in the row.
    await waitFor(() => expect(block('Matomo').querySelector('[data-import-progress="line"]')?.textContent).toMatch(/ · You can close this page\.$/))
  })

  it('deletes the waiting connection on Cancel, so no token is left behind', async () => {
    h.slot = { existing_import: awaiting }
    h.getMatomoProperties.mockResolvedValue({ properties: [], suggested_id: null })
    renderPage()
    const b = await findBlock('Matomo')
    expect(state(b)).toEqual({ text: 'Choose a site', tone: 'off' })
    h.slot = { existing_import: null }
    fireEvent.click(within(b).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(h.deleteImport).toHaveBeenCalledWith(expect.objectContaining({ importId: 'imp-m' })))
  })

  it('deletes the waiting connection once, however often Cancel is pressed', async () => {
    h.slot = { existing_import: awaiting }
    h.getMatomoProperties.mockResolvedValue({ properties: [], suggested_id: null })
    let finish: () => void = () => {}
    h.deleteImport.mockImplementation(() => new Promise<void>((r) => (finish = r)))
    renderPage()
    const b = await findBlock('Matomo')
    const cancel = within(b).getByRole('button', { name: 'Cancel' })
    // Both presses in one batch: the second lands before the re-render that disables the button.
    act(() => {
      cancel.click()
      cancel.click()
    })
    expect(cancel).toBeDisabled()
    expect(h.deleteImport).toHaveBeenCalledTimes(1)
    h.slot = { existing_import: null }
    await act(async () => finish())
    expect(screen.queryByText('This import no longer exists. Refresh the page.')).toBeNull()
  })

  it('drops a typed token when another row opens', async () => {
    renderPage()
    fireEvent.click(await within(await findBlock('Matomo')).findByRole('button', { name: 'Connect' }))
    fireEvent.change(screen.getByLabelText('Token'), { target: { value: 'secret-token' } })
    fireEvent.click(within(block('Plausible')).getByRole('button', { name: 'Upload' }))
    fireEvent.click(within(block('Matomo')).getByRole('button', { name: 'Connect' }))
    expect((screen.getByLabelText('Token') as HTMLInputElement).value).toBe('')
  })

  it("says each connect refusal in words under the token, and keeps Matomo's own message behind Details", async () => {
    // matomo_bad_token answers 422, not 401 (M10 fix pass), so this never looks
    // like the user's OWN session expiring to anything reading the status alone.
    h.connectMatomo.mockRejectedValue(
      Object.assign(new Error('Unprocessable'), {
        status: 422,
        data: { error: 'raw', code: 'matomo_bad_token', source_message: 'Unable to authenticate with the provided token.' },
      }),
    )
    renderPage()
    fireEvent.click(await within(await findBlock('Matomo')).findByRole('button', { name: 'Connect' }))
    fireEvent.change(screen.getByLabelText('Matomo address'), { target: { value: 'https://stats.example.org' } })
    fireEvent.change(screen.getByLabelText('Token'), { target: { value: 'bad' } })
    fireEvent.click(screen.getByRole('button', { name: 'Load sites' }))
    const line = await screen.findByText(
      "Pulse can't sign in with this token. Check that you copied it in full and that it's still active in Matomo.",
    )
    const alert = line.closest('[data-import-error="line"]') as HTMLElement
    expect(alert).not.toBeNull()
    // Under the token, whose button asked: the token's row comes right before it.
    expect(alert.previousElementSibling?.textContent).toContain('Token')
    expect(within(screen.getByTestId('import-error-details')).getByText('Unable to authenticate with the provided token.')).toBeInTheDocument()
    expect(screen.queryByText('raw')).toBeNull()
  })

  it('says a token that can see no site in words, and a failed list without waiting forever', async () => {
    h.slot = { existing_import: awaiting }
    h.getMatomoProperties.mockResolvedValueOnce({ properties: [], suggested_id: null })
    const { unmount } = renderPage()
    expect(await screen.findByText(/can't see any Matomo sites/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start the import' })).toBeDisabled()
    unmount()

    h.getMatomoProperties.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 409, data: { code: 'import_not_active' } }))
    renderPage()
    const line = await screen.findByText('This import has ended. Delete it to start again.')
    // Said under the site it was reading, not in a box.
    expect(line.closest('[data-import-error="line"]')!.previousElementSibling?.textContent).toContain('Matomo site')
    expect(screen.queryByText(/Loading the sites/)).toBeNull()
  })

  it('says, under Details, that Pulse cannot revoke a finished import’s token', async () => {
    h.slot = { existing_import: status({ id: 'imp-m', source: 'matomo', kind: 'api_key', fingerprint: null, totals: null }) }
    renderPage()
    const b = await findBlock('Matomo')
    expect(state(b).tone).toBe('live')
    fireEvent.click(within(b).getByRole('button', { name: 'Details' }))
    expect(within(b).getByText(/Pulse can't revoke this token automatically/)).toBeInTheDocument()
    expect(document.querySelector('[data-import-source="plausible"]')).toBeNull()
  })
})

// ─── presses that land before the re-render, and bodies of the wrong shape ──
describe('double presses, races and malformed answers', () => {
  async function reachCheck() {
    renderPage()
    await openPlausible()
    chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }))
    return screen.findByTestId('import-confirm')
  }

  it('does not crash when a listed source has no kind, or the list is not a list', async () => {
    h.sources = { sources: [{ source: 'plausible', enabled: true } as never, { source: 'fathom', kind: null } as never, MATOMO] }
    const { unmount } = renderPage()
    expect(await within(await findBlock('Matomo')).findByRole('button', { name: 'Connect' })).toBeInTheDocument()
    expect(document.querySelector('[data-import-source="plausible"]')).toBeNull()
    unmount()
    h.sources = { sources: {} as never }
    renderPage()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    // No source this build can read: the section does not exist (M11-b), and nothing throws.
    expect(document.querySelector('[data-kit-section="Import history"]')).toBeNull()
  })

  it('shows an import whose failure code is named like an Object member, without crashing', async () => {
    h.slot = { existing_import: status({ source: 'fathom', status: 'failed', error_code: 'toLocaleString', finished_at: null }) }
    renderPage()
    expect(await screen.findByText(UNEXPECTED)).toBeInTheDocument()
  })

  it('sends one upload for two presses of Start the import in one batch', async () => {
    const prepared = preparedImport()
    prepared.upload.mockReturnValue(new Promise(() => {}))
    h.prepareImport.mockResolvedValue(prepared)
    const confirm = await reachCheck()
    const go = within(confirm).getByRole('button', { name: 'Start the import' })
    act(() => {
      go.click()
      go.click()
    })
    expect(prepared.upload).toHaveBeenCalledTimes(1)
  })

  it("defers one delete for two presses of the dialog's hold button in one batch", async () => {
    h.slot = { existing_import: status() }
    renderPage()
    fireEvent.click(await within(await findBlock('Plausible')).findByRole('button', { name: 'Delete imported data' }))
    const confirm = within(screen.getByRole('dialog', { name: 'Delete the data imported from Plausible?' })).getByRole('button', { name: 'Hold to delete' })
    act(() => {
      confirm.click()
      confirm.click()
    })
    // The deletingRef guard still holds: a second press lands before the re-render that empties the slot, and must
    // not queue a second delete.
    expect(deferred).toHaveLength(1)
    expect(h.deleteImport).not.toHaveBeenCalled()

    h.slot = { existing_import: null }
    await act(() => commitLast())
    expect(h.deleteImport).toHaveBeenCalledTimes(1)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('connects once for two presses of Load sites in one batch', async () => {
    h.connectMatomo.mockReturnValue(new Promise(() => {}))
    renderPage()
    fireEvent.click(await within(await findBlock('Matomo')).findByRole('button', { name: 'Connect' }))
    fireEvent.change(screen.getByLabelText('Matomo address'), { target: { value: 'https://stats.example.org' } })
    fireEvent.change(screen.getByLabelText('Token'), { target: { value: 'secret-token' } })
    const load = screen.getByRole('button', { name: 'Load sites' })
    act(() => {
      load.click()
      load.click()
    })
    expect(h.connectMatomo).toHaveBeenCalledTimes(1)
  })

  it('offers no Try again after the session ended, and asks for the file again', async () => {
    const prepared = preparedImport()
    prepared.upload.mockRejectedValueOnce(new ImportError('unauthorized', 'HTTP 401'))
    h.prepareImport.mockResolvedValue(prepared)
    const confirm = await reachCheck()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Start the import' }))
    expect(await screen.findByText('Your session ended. Sign in again and choose the same file to continue.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(prepared.dispose).toHaveBeenCalled()
    expect(screen.getByTestId('import-file-input')).toBeInTheDocument()
  })

  it("never leaves a row open under a lock when Start and another row's Connect land in one batch", async () => {
    const prepared = preparedImport()
    let rejectUpload: (e: unknown) => void = () => {}
    prepared.upload.mockImplementation(() => new Promise((_r, rej) => (rejectUpload = rej)))
    h.prepareImport.mockResolvedValue(prepared)
    const confirm = await reachCheck()
    const go = within(confirm).getByRole('button', { name: 'Start the import' })
    const connect = within(block('Matomo')).getByRole('button', { name: 'Connect' })
    act(() => {
      go.click()
      connect.click()
    })
    // The upload holds the slot, so it is the section; Matomo's form never opened behind it.
    expect(document.querySelector('[data-import-source="matomo"]')).toBeNull()
    expect(screen.queryByTestId('matomo-connect')).toBeNull()
    // When the upload lets go of the slot, Matomo's row is back, closed.
    await act(async () => rejectUpload(new ImportError('forbidden', 'HTTP 403')))
    const matomo = await findBlock('Matomo')
    expect(within(matomo).queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(within(matomo).getByRole('button', { name: 'Connect' })).toBeEnabled()
    expect(screen.queryByTestId('matomo-connect')).toBeNull()
  })

  it('does not read the slot again after the page has gone, when an upload fails late', async () => {
    const prepared = preparedImport()
    let rejectUpload: (e: unknown) => void = () => {}
    prepared.upload.mockImplementation(() => new Promise((_r, rej) => (rejectUpload = rej)))
    h.prepareImport.mockResolvedValue(prepared)
    const { unmount } = renderPage()
    await openPlausible()
    chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }))
    fireEvent.click(within(await screen.findByTestId('import-confirm')).getByRole('button', { name: 'Start the import' }))
    unmount()
    const reads = h.getImportSlot.mock.calls.length
    let unhandled: unknown = null
    const onUnhandled = (e: unknown) => {
      unhandled = e
    }
    process.on('unhandledRejection', onUnhandled)
    try {
      await act(async () => {
        rejectUpload(new ImportError('forbidden', 'HTTP 403'))
        await new Promise((r) => setTimeout(r, 30))
      })
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
    expect(unhandled).toBeNull()
    expect(h.getImportSlot.mock.calls.length).toBe(reads)
  })
})

// ─── M12: naming the events, as one table (R51, option B) ───────────────────
describe('naming the events (M12; one table, R51)', () => {
  const EVENTS = [
    { source_name: 'Outbound Link: Click', count: 4812 },
    { source_name: 'Signup', count: 1946 },
    { source_name: 'File Download', count: 1203 },
    { source_name: 'Header CTA: Get started', count: 418 },
    { source_name: '404', count: 391 },
    { source_name: 'Test event (staging)', count: 12 },
  ]

  async function openCheck(prepared = preparedImport({ plan: plan({ events: EVENTS }) })) {
    h.prepareImport.mockResolvedValue(prepared)
    renderPage()
    await openPlausible()
    chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }))
    const section = await screen.findByTestId('import-event-mapping')
    return { prepared, section }
  }
  const input = (section: HTMLElement, src: string) => within(section).getByLabelText(`Name in Pulse for ${src}`) as HTMLInputElement
  const row = (section: HTMLElement, src: string) => input(section, src).closest('[role="row"]') as HTMLElement

  it('draws one table, Event in Plausible · Events · Name in Pulse · Import, a row per event with its count', async () => {
    const { section } = await openCheck()
    const table = within(section).getByRole('table', { name: 'Events' })
    expect(within(table).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Event in Plausible', 'Events', 'Name in Pulse', 'Import'])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(EVENTS.length)
    // The four cells, in the header's order: the event, its count (its unit shown only below md, where the header is
    // hidden), its name, its switch.
    const first = within(rows[0]).getAllByRole('cell')
    expect(first).toHaveLength(4)
    expect(first[0].textContent).toBe('Outbound Link: Click')
    expect(first[1].textContent).toBe('4,812 events')
    expect(first[1].querySelector('.md\\:hidden')?.textContent).toBe(' events')
    expect(within(first[2]).getByLabelText('Name in Pulse for Outbound Link: Click')).toBeInTheDocument()
    expect(within(first[3]).getByRole('switch', { name: 'Import Outbound Link: Click' })).toBeInTheDocument()
    // The header row and every event row share one column template, so the columns line up.
    const header = within(table).getAllByRole('row')[0]
    const cols = (el: Element) => el.className.split(' ').find((c) => c.startsWith('md:grid-cols-'))
    expect(cols(header)).toBe('md:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1.25fr)_3rem]')
    for (const r of rows) expect(cols(r)).toBe(cols(header))
    // The name fields are the settings fields' height (Facet's own), not a smaller one.
    expect(input(section, 'Signup').className).not.toMatch(/\bh-9\b/)
  })

  it('lists every source event with its count, a suggested name, the ruled notes and a switch', async () => {
    // A goal spelled with capitals, and a name Pulse measured itself.
    h.listGoals.mockResolvedValue([{ id: 'g', site_id: 's1', name: 'CTA', event_name: 'Header_CTA_Get_Started', created_at: '', updated_at: '' }])
    h.getGoalStats.mockResolvedValue([{ event_name: 'signup', count: 3 }])
    const { section } = await openCheck()
    const confirm = screen.getByTestId('import-confirm')
    expect(within(confirm).getByText('Events, named as you choose below')).toBeInTheDocument()
    expect(within(confirm).getByText('Event properties, and the link or page each event happened on')).toBeInTheDocument()
    expect(within(section).getByText('Choose the name each event gets in Pulse, or leave it out. Names use letters, numbers and underscores.')).toBeInTheDocument()
    expect(within(section).getByTestId('import-events-count')).toHaveTextContent('6 of 6 imported')
    expect(within(row(section, 'Outbound Link: Click')).getAllByRole('cell')[1].textContent).toBe('4,812 events')
    // Suggestions (M12-d): built-ins, the goal as the goal spells it, else the slug.
    await waitFor(() => expect(input(section, 'Header CTA: Get started').value).toBe('Header_CTA_Get_Started'))
    expect(EVENTS.map((e) => input(section, e.source_name).value)).toEqual([
      'outbound_link',
      'signup',
      'file_download',
      'Header_CTA_Get_Started',
      '404',
      'test_event_staging',
    ])
    // The name IS an event key: mono, as Goals' field. Nothing else in the table is.
    expect(input(section, 'Signup').className).toContain('font-mono')
    expect(section.querySelectorAll('.font-mono')).toHaveLength(EVENTS.length)
    // W-M12-2 under the three built-ins.
    expect(within(row(section, 'Outbound Link: Click')).getByText('Adds to the outbound clicks Pulse measures')).toBeInTheDocument()
    expect(within(row(section, 'File Download')).getByText('Adds to the file downloads Pulse measures')).toBeInTheDocument()
    expect(within(row(section, '404')).getByText('Adds to the 404 pages Pulse measures')).toBeInTheDocument()
    // W-M12-3 under a goal's name and a name Pulse measured.
    const known = 'Pulse already records this event; the imported count is added'
    await waitFor(() => expect(within(row(section, 'Signup')).getByText(known)).toBeInTheDocument())
    expect(within(row(section, 'Header CTA: Get started')).getByText(known)).toBeInTheDocument()
    expect(within(row(section, 'Test event (staging)')).queryByText(known)).toBeNull()
  })

  it("keeps a switched-off row's name, disabled, and sends it as null", async () => {
    const { section, prepared } = await openCheck()
    prepared.upload.mockReturnValue(new Promise(() => {}))
    fireEvent.click(within(section).getByRole('switch', { name: 'Import Test event (staging)' }))
    expect(within(section).getByTestId('import-events-count')).toHaveTextContent('5 of 6 imported')
    expect(input(section, 'Test event (staging)')).toBeDisabled()
    expect(input(section, 'Test event (staging)').value).toBe('test_event_staging')
    fireEvent.click(screen.getByRole('button', { name: 'Start the import' }))
    await waitFor(() => expect(prepared.upload).toHaveBeenCalledTimes(1))
    expect(prepared.upload.mock.calls[0][0]).toEqual({
      eventMap: {
        'Outbound Link: Click': 'outbound_link',
        Signup: 'signup',
        'File Download': 'file_download',
        'Header CTA: Get started': 'header_cta_get_started',
        '404': '404',
        'Test event (staging)': null,
      },
    })
  })

  it('says when two events add up under one name, and refuses a name the server would, under its field', async () => {
    const { section } = await openCheck()
    const startButton = screen.getByRole('button', { name: 'Start the import' })
    fireEvent.change(input(section, 'Signup'), { target: { value: 'outbound_link' } })
    expect(within(row(section, 'Signup')).getByText('Adds up with Outbound Link: Click')).toBeInTheDocument()
    expect(within(row(section, 'Outbound Link: Click')).getByText('Adds up with Signup')).toBeInTheDocument()
    expect(within(row(section, 'Signup')).getByText('Adds to the outbound clicks Pulse measures')).toBeInTheDocument()

    for (const [value, words] of [
      ['sign up', 'Use only letters, numbers and underscores.'],
      ['', 'Enter a name, or switch this event off.'],
      ['a'.repeat(65), 'Use at most 64 characters.'],
      ['pulse_click', 'Pulse keeps this name for its own events.'],
      ['rage_click', 'Pulse keeps this name for its own events.'],
      ['pageview', 'Pulse keeps this name for its own events.'],
    ]) {
      fireEvent.change(input(section, 'Signup'), { target: { value } })
      expect(within(row(section, 'Signup')).getByText(words), value).toBeInTheDocument()
      expect(input(section, 'Signup')).toHaveAttribute('aria-invalid', 'true')
      expect(startButton).toBeDisabled()
    }
    // Switching the event off clears the objection: its name is not sent.
    fireEvent.click(within(section).getByRole('switch', { name: 'Import Signup' }))
    expect(startButton).toBeEnabled()
    fireEvent.click(within(section).getByRole('switch', { name: 'Import Signup' }))
    fireEvent.change(input(section, 'Signup'), { target: { value: 'signup' } })
    expect(startButton).toBeEnabled()
  })

  it("maps a Matomo site's events through the preview, in a table named for Matomo, and confirms with the map", async () => {
    const awaiting = status({ id: 'imp-m', source: 'matomo', kind: 'api_key', status: 'awaiting_property', range_start: null, range_end: null, steps_total: null, fingerprint: null, totals: null, finished_at: null })
    h.slot = { existing_import: awaiting }
    h.getMatomoProperties.mockResolvedValue({ properties: [{ id: '3', name: 'acme.example', main_url: 'https://acme.example', timezone: 'UTC' }], suggested_id: '3' })
    h.previewDataImportEvents.mockResolvedValue({ events: [{ source_name: 'Forms - Submit', count: 40 }, { source_name: 'Video - Play', count: 7 }] })
    h.confirmDataImport.mockResolvedValue(status({ id: 'imp-m', source: 'matomo', kind: 'api_key', status: 'pending', cursor: { step: 0, part: 0 }, finished_at: null }))
    renderPage()
    const section = await screen.findByTestId('import-event-mapping')
    expect(h.previewDataImportEvents).toHaveBeenCalledWith('s1', 'imp-m', '3')
    expect(within(section).getByRole('columnheader', { name: 'Event in Matomo' })).toBeInTheDocument()
    expect(screen.getByText('Events, named as you choose below')).toBeInTheDocument()
    expect(input(section, 'Forms - Submit').value).toBe('forms_submit')
    fireEvent.click(within(section).getByRole('switch', { name: 'Import Video - Play' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start the import' }))
    await waitFor(() =>
      expect(h.confirmDataImport).toHaveBeenCalledWith('s1', 'imp-m', '3', { 'Forms - Submit': 'forms_submit', 'Video - Play': null }),
    )
  })

  it("holds Matomo's Start while the preview fails, and says so where the events would be, with Try again", async () => {
    const awaiting = status({ id: 'imp-m', source: 'matomo', kind: 'api_key', status: 'awaiting_property', range_start: null, range_end: null, steps_total: null, fingerprint: null, totals: null, finished_at: null })
    h.slot = { existing_import: awaiting }
    h.getMatomoProperties.mockResolvedValue({ properties: [{ id: '3', name: 'acme.example', main_url: 'https://acme.example', timezone: 'UTC' }], suggested_id: '3' })
    h.previewDataImportEvents.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 502, data: { code: 'source_unavailable' } }))
    renderPage()
    const line = await screen.findByText('Matomo kept failing to answer. The import is paused where it was. Try again later.')
    expect(line.closest('[data-import-error="line"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Start the import' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start the import' })).toBeEnabled())
    expect(h.previewDataImportEvents).toHaveBeenCalledTimes(2)
  })
})

// ─── R51's devices, everywhere in the section ───────────────────────────────
describe("option B's devices (R51)", () => {
  it('draws no boxed banner and no footer strip: every alert is a line, every step’s buttons a row of their own', async () => {
    h.prepareImport.mockRejectedValue(new ImportError('unexpected_response', 'HTTP 418', { detail: { server_code: 'teapot' } }))
    renderPage()
    await openPlausible()
    chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }))
    await screen.findByText(UNEXPECTED)
    for (const alert of section().querySelectorAll('[role="alert"]')) {
      expect(alert.getAttribute('data-import-error')).toMatch(/^(line|field)$/)
      expect(alert.className).not.toMatch(/\bborder\b|bg-/)
    }
    // No strip: the step's buttons sit in a row with the kit's 16 px, and no panel row inset 20 px is left.
    const actions = section().querySelector('[data-import-actions]') as HTMLElement
    expect(actions.className).toContain('py-4')
    expect(section().querySelector('.px-5')).toBeNull()
    // The section no longer takes px-5 back from what it holds (round finding 1): kit parts keep their insets.
    const strips = [section(), ...section().querySelectorAll('*')].filter((el) => (el.getAttribute('class') ?? '').includes('.px-5]'))
    expect(strips).toEqual([])
  })
})
