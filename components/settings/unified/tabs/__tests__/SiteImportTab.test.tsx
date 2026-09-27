import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SWRConfig } from 'swr'

// ─── Site settings → Import (PULSE-118, design §3.10b M11-c…g, M11-j) ──────
//
// One test per state of the ruled shots (A1–A9), run on jsdom with lib/import
// mocked at its PUBLIC boundary (prepareImport, deleteImport): a Worker cannot
// run here, and the library has its own suites. The server is mocked at the one
// API module the screen calls (lib/api/dataImports), so the real hooks, SWR, the
// real error map and the real display metadata all run.

vi.mock('framer-motion', () => import('@/components/settings/__tests__/framer-mock'))

const h = vi.hoisted(() => ({
  canManage: true,
  sources: { sources: [] as { source: string; kind: string; enabled: boolean }[] },
  slot: { existing_import: null as unknown },
  prepareImport: vi.fn(),
  deleteImport: vi.fn(),
  connectMatomo: vi.fn(),
  getMatomoProperties: vi.fn(),
  confirmDataImport: vi.fn(),
  getImportSlot: vi.fn(),
}))

vi.mock('@/lib/auth/permissions', () => ({ useCan: () => h.canManage }))
vi.mock('@/lib/swr/dashboard', () => ({ useSite: () => ({ data: { id: 's1', timezone: 'Europe/Brussels' } }) }))
vi.mock('@/lib/api/dataImports', () => ({
  getImportSources: vi.fn(async () => h.sources),
  getImportSlot: (...a: unknown[]) => h.getImportSlot(...a),
  connectMatomo: (...a: unknown[]) => h.connectMatomo(...a),
  getMatomoProperties: (...a: unknown[]) => h.getMatomoProperties(...a),
  confirmDataImport: (...a: unknown[]) => h.confirmDataImport(...a),
}))
vi.mock('@/lib/import', () => ({
  prepareImport: (...a: unknown[]) => h.prepareImport(...a),
  deleteImport: (...a: unknown[]) => h.deleteImport(...a),
}))
vi.mock('@/lib/import/app-transport', () => ({ appTransport: vi.fn() }))

vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, variant, size, asChild, ...props }: any) => (
    <button data-variant={variant} {...props}>
      {children}
    </button>
  ),
  Input: (props: any) => <input {...props} />,
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
  Modal: ({ isOpen, title, children }: any) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
  toast: { success: vi.fn(), error: vi.fn() },
}))

import SiteImportTab from '../SiteImportTab'
import { ImportError } from '@/lib/import/errors'
import { toast } from '@ciphera-net/facet'

// ─── fixtures ──────────────────────────────────────────────────────────────
const PLAUSIBLE = { source: 'plausible', kind: 'upload_aggregate', enabled: true }
const MATOMO = { source: 'matomo', kind: 'api_key', enabled: true }
const GA4 = { source: 'ga4', kind: 'oauth', enabled: true }

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
    ignored_files: ['imported_custom_events.csv'],
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

function renderTab() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SiteImportTab siteId="s1" />
    </SWRConfig>,
  )
}

/** The block (header row + everything under it) for one source, found by its name. */
function block(name: string): HTMLElement {
  const label = screen.getAllByText(name).find((el) => el.closest('div.px-5'))
  const b = label?.closest('div.px-5')?.parentElement
  if (!b) throw new Error(`no block for ${name}`)
  return b as HTMLElement
}

/** The StatusChip in a block carrying this word (the chip, not a detail row's label). */
function chip(b: HTMLElement, label: string): HTMLElement {
  const el = within(b)
    .getAllByText(label)
    .find((e) => e.className.includes('border-neutral-800'))
  if (!el) throw new Error(`no ${label} chip`)
  return el
}

function chooseFile(name = 'plausible-export.zip') {
  const input = screen.getByTestId('import-file-input') as HTMLInputElement
  const file = new File(['PK'], name, { type: 'application/zip' })
  fireEvent.change(input, { target: { files: [file] } })
  return file
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
  ;(toast.success as any).mockClear()
  ;(toast.error as any).mockClear()
})

// ─── A1: the picker ────────────────────────────────────────────────────────
describe('the picker (A1)', () => {
  it('lists the sources this build can drive, in the server order, with full-colour logos', async () => {
    renderTab()
    expect(await screen.findByText('Import history')).toBeInTheDocument()
    expect(screen.getByText("Bring this site's history from another analytics tool. Imported days are labelled as imported wherever they appear.")).toBeInTheDocument()
    // GA4's sign-in flow is M5's: listed by the server, not shown by this build.
    expect(screen.queryByText('Google Analytics')).toBeNull()
    const names = screen.getAllByText(/^(Plausible|Matomo)$/).map((el) => el.textContent)
    expect(names).toEqual(['Plausible', 'Matomo'])
    expect(within(block('Plausible')).getByRole('button', { name: 'Upload' })).toBeEnabled()
    expect(within(block('Matomo')).getByRole('button', { name: 'Connect' })).toBeEnabled()
    // Full colour, always (owner, Q-M11): never the Integrations idle treatment.
    for (const id of ['plausible', 'matomo']) {
      const img = screen.getByTestId(`import-logo-${id}`)
      expect(img).toHaveAttribute('src', `https://cdn.ciphera.net/website/blog/tools/${id}.png`)
      expect(img.closest('span')!.className).not.toMatch(/grayscale|opacity-60/)
    }
    expect(screen.getByText('One import per site. An uploaded export is read in your browser and never sent to Pulse.')).toBeInTheDocument()
  })
})

// ─── A2: choose a file, with the timezone question ─────────────────────────
describe('choosing a file (A2)', () => {
  it('opens in place under its row, asks for the ZIP and the timezone, and waits for a file', async () => {
    renderTab()
    fireEvent.click(await within(await waitFor(() => block('Plausible'))).findByRole('button', { name: 'Upload' }))
    const b = block('Plausible')
    expect(within(b).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(b).getByText('Choose the ZIP file')).toBeInTheDocument()
    expect(within(b).getByText('In Plausible: Site settings, Imports and Exports, Export to CSV. Plausible emails you a link to a ZIP file.')).toBeInTheDocument()
    const input = screen.getByTestId('import-file-input')
    expect(input).toHaveAttribute('accept', expect.stringContaining('.zip'))
    expect(input).not.toHaveAttribute('multiple')
    // The timezone defaults to the site's.
    expect((within(b).getByLabelText('Plausible timezone') as HTMLSelectElement).value).toBe('Europe/Brussels')
    const review = within(b).getByRole('button', { name: 'Review import' })
    expect(review).toBeDisabled()
    chooseFile()
    expect(within(b).getByText('plausible-export.zip')).toBeInTheDocument()
    expect(review).toBeEnabled()
  })

  it('keeps one flow open at a time', async () => {
    renderTab()
    fireEvent.click(await within(await waitFor(() => block('Plausible'))).findByRole('button', { name: 'Upload' }))
    expect(screen.getByTestId('import-choose')).toBeInTheDocument()
    fireEvent.click(within(block('Matomo')).getByRole('button', { name: 'Connect' }))
    expect(screen.queryByTestId('import-choose')).toBeNull()
    expect(screen.getByTestId('matomo-connect')).toBeInTheDocument()
  })
})

// ─── reading, then A5: confirm ──────────────────────────────────────────────
describe('reading and confirming (A5)', () => {
  it('shows the read progress, then exactly what the plan will import', async () => {
    let onEvent: ((e: unknown) => void) | undefined
    let resolve: (v: unknown) => void = () => {}
    h.prepareImport.mockImplementation((opts: any) => {
      onEvent = opts.onEvent
      return new Promise((r) => (resolve = r))
    })
    renderTab()
    fireEvent.click(await within(await waitFor(() => block('Plausible'))).findByRole('button', { name: 'Upload' }))
    chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }))

    // The library is handed the file, the site and the chosen zone.
    const opts = h.prepareImport.mock.calls[0][0]
    expect(opts).toMatchObject({ siteId: 's1', source: 'plausible', sourceTimezone: 'Europe/Brussels' })
    expect(opts.file.name).toBe('plausible-export.zip')

    act(() => onEvent!({ type: 'progress', stage: 'reading', bytesRead: 50, bytesTotal: 100 }))
    expect(screen.getByText('Reading plausible-export.zip')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()

    const prepared = preparedImport()
    await act(async () => resolve(prepared))

    const confirm = screen.getByTestId('import-confirm')
    expect(within(block('Plausible')).getByText('plausible-export.zip · read in your browser')).toBeInTheDocument()
    expect(within(block('Plausible')).getByText('Ready to import')).toBeInTheDocument()
    expect(within(confirm).getByText('1 Jan 2025 to 14 Sep 2026 · 622 days')).toBeInTheDocument()
    expect(within(confirm).getByText('Pulse measures this site from 15 Sep 2026, so the import stops the day before.')).toBeInTheDocument()
    expect(within(confirm).getByText('212,480 visitors · 486,113 pageviews')).toBeInTheDocument()
    expect(within(confirm).getByText('Europe/Brussels, the same as this site')).toBeInTheDocument()
    expect(within(confirm).getByText('Visitors, visits and pageviews')).toBeInTheDocument()
    expect(within(confirm).getByText("Languages and screen sizes: Plausible doesn't export them")).toBeInTheDocument()
    expect(within(confirm).getByText('Events and goals: coming in a later release')).toBeInTheDocument()
    expect(within(confirm).getByText("Files it doesn't read: imported_custom_events.csv")).toBeInTheDocument()
    // W1 A, the aggregate sources' visitors caveat.
    expect(
      within(confirm).getByText("Visitors are Plausible's daily counts added up, so over a range someone who came on three days counts three times."),
    ).toBeInTheDocument()
    expect(within(confirm).getByText("412 rows dated before this site's history window")).toBeInTheDocument()
    expect(within(confirm).getByText('3 rows on days Pulse already measured')).toBeInTheDocument()
    // Show lines: file and line only.
    fireEvent.click(within(confirm).getByRole('button', { name: 'Show lines' }))
    expect(within(screen.getByTestId('import-skip-samples')).getByText('imported_visitors.csv')).toBeInTheDocument()
    expect(within(confirm).getByRole('button', { name: 'Import 622 days' })).toBeInTheDocument()
  })

  it('disposes the prepared import on Back and on Cancel', async () => {
    const prepared = preparedImport()
    h.prepareImport.mockResolvedValue(prepared)
    renderTab()
    fireEvent.click(await within(await waitFor(() => block('Plausible'))).findByRole('button', { name: 'Upload' }))
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

  it('disposes the prepared import when the tab unmounts', async () => {
    const prepared = preparedImport()
    h.prepareImport.mockResolvedValue(prepared)
    const { unmount } = renderTab()
    fireEvent.click(await within(await waitFor(() => block('Plausible'))).findByRole('button', { name: 'Upload' }))
    chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }))
    await screen.findByTestId('import-confirm')
    unmount()
    expect(prepared.dispose).toHaveBeenCalled()
  })

  it('says a wrong file inline, in the error map words, and keeps the chooser', async () => {
    h.prepareImport.mockRejectedValue(
      new ImportError('wrong_file', 'raw', { detail: { reason: 'missing_columns', file: 'imported_visitors.csv', columns: ['date'] } }),
    )
    renderTab()
    fireEvent.click(await within(await waitFor(() => block('Plausible'))).findByRole('button', { name: 'Upload' }))
    chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }))
    expect(
      await screen.findByText("This doesn't look like a Plausible export. imported_visitors.csv is missing the date columns."),
    ).toBeInTheDocument()
    expect(screen.getByTestId('import-dropzone')).toBeInTheDocument()
    expect(screen.queryByText('raw')).toBeNull()
  })

  it('never shows a code it does not know: the unexpected sentence, and the code behind Details', async () => {
    h.prepareImport.mockRejectedValue(new ImportError('unexpected_response', 'HTTP 418', { detail: { server_code: 'teapot' } }))
    renderTab()
    fireEvent.click(await within(await waitFor(() => block('Plausible'))).findByRole('button', { name: 'Upload' }))
    chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }))
    expect(await screen.findByText('Something unexpected came back from Pulse. Nothing more was saved. Try again.')).toBeInTheDocument()
    expect(within(screen.getByTestId('import-error-details')).getByText('teapot')).toBeInTheDocument()
    expect(screen.queryByText('HTTP 418')).toBeNull()
  })
})

// ─── A6: uploading from this tab ────────────────────────────────────────────
describe('uploading (A6)', () => {
  it('shows "Part n of total", tells the reader to keep the tab open, and locks the other rows', async () => {
    let onEvent: ((e: unknown) => void) | undefined
    const prepared = preparedImport()
    prepared.upload.mockReturnValue(new Promise(() => {}))
    h.prepareImport.mockImplementation(async (opts: any) => {
      onEvent = opts.onEvent
      return prepared
    })
    renderTab()
    fireEvent.click(await within(await waitFor(() => block('Plausible'))).findByRole('button', { name: 'Upload' }))
    chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Import 622 days' }))
    act(() => onEvent!({ type: 'progress', stage: 'uploading', importId: 'imp-1', partsDone: 14, partsTotal: 38 }))

    const b = block('Plausible')
    expect(within(b).getByText('Importing')).toBeInTheDocument()
    expect(within(b).getByText('Part 14 of 38')).toBeInTheDocument()
    expect(within(b).getByText('37%')).toBeInTheDocument()
    expect(
      within(b).getByText('Keep this tab open until it finishes. If it closes, choose the same file again and it carries on where it stopped.'),
    ).toBeInTheDocument()
    // One import per site: the other rows lock, and the panel says so once.
    expect(within(block('Matomo')).getByRole('button', { name: 'Connect' })).toBeDisabled()
    expect(screen.getByText('One import per site. Delete this one to import from another tool.')).toBeInTheDocument()
  })

  it('offers Try again after a network blip, and sends the SAME prepared upload', async () => {
    const prepared = preparedImport()
    prepared.upload
      .mockRejectedValueOnce(new ImportError('network', 'offline'))
      .mockReturnValueOnce(new Promise(() => {}))
    h.prepareImport.mockResolvedValue(prepared)
    renderTab()
    fireEvent.click(await within(await waitFor(() => block('Plausible'))).findByRole('button', { name: 'Upload' }))
    chooseFile()
    fireEvent.click(screen.getByRole('button', { name: 'Review import' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Import 622 days' }))
    expect(await screen.findByText("Pulse can't be reached. The import is paused where it was; it continues when you try again.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(prepared.upload).toHaveBeenCalledTimes(2))
    expect(h.prepareImport).toHaveBeenCalledTimes(1)
  })
})

// ─── A7 + A9: done, and delete ──────────────────────────────────────────────
describe('done (A7) and delete (A9)', () => {
  it('shows the finished import with its details and the one-minute caveat', async () => {
    h.slot = { existing_import: status() }
    renderTab()
    const b = await waitFor(() => block('Plausible'))
    expect(chip(b, 'Imported').className).toMatch(/text-pos/)
    expect(within(b).getByText('Your export file never left your browser.')).toBeInTheDocument()
    expect(within(b).getByText('It can take a minute before the dashboard shows the imported days.')).toBeInTheDocument()
    expect(within(b).getByText('1 Jan 2025 to 14 Sep 2026 · 622 days')).toBeInTheDocument()
    expect(within(b).getByText('212,480')).toBeInTheDocument()
    expect(within(b).getByText("412 rows dated before this site's history window")).toBeInTheDocument()
    expect(screen.getByText('One import per site. Delete this one to import from another tool.')).toBeInTheDocument()
    expect(within(block('Matomo')).getByRole('button', { name: 'Connect' })).toBeDisabled()
  })

  it('drops the one-minute caveat once the cache has long expired', async () => {
    h.slot = { existing_import: status({ finished_at: '2026-01-01T00:00:00Z' }) }
    renderTab()
    await waitFor(() => block('Plausible'))
    expect(screen.queryByText('It can take a minute before the dashboard shows the imported days.')).toBeNull()
  })

  it('deletes through a confirm dialog, then reads the slot again', async () => {
    h.slot = { existing_import: status() }
    renderTab()
    const del = await within(await waitFor(() => block('Plausible'))).findByRole('button', { name: 'Delete imported data' })
    expect(del.className).toMatch(/text-destructive/)
    fireEvent.click(del)
    const dialog = screen.getByRole('dialog', { name: 'Delete imported data' })
    expect(
      within(dialog).getByText(
        "This removes everything imported from Plausible from every chart, card, export and API answer. Data Pulse measured itself isn't touched.",
      ),
    ).toBeInTheDocument()
    const reads = h.getImportSlot.mock.calls.length
    h.slot = { existing_import: null }
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(h.deleteImport).toHaveBeenCalledWith(expect.objectContaining({ siteId: 's1', importId: 'imp-1' })))
    await waitFor(() => expect(h.getImportSlot.mock.calls.length).toBeGreaterThan(reads))
    expect(await screen.findByText('One import per site. An uploaded export is read in your browser and never sent to Pulse.')).toBeInTheDocument()
  })
})

// ─── A8: stopped, resumable ─────────────────────────────────────────────────
describe('stopped (A8)', () => {
  it('names where it stopped and carries on from the same file', async () => {
    h.slot = { existing_import: status({ status: 'failed', error_code: 'upload_abandoned', cursor: { step: 13, part: 0 }, finished_at: null, progressed_at: '2026-09-26T10:00:00Z' }) }
    const prepared = preparedImport({ resume: status({ status: 'failed', error_code: 'upload_abandoned' }) })
    prepared.upload.mockReturnValue(new Promise(() => {}))
    h.prepareImport.mockResolvedValue(prepared)
    renderTab()
    const b = await waitFor(() => block('Plausible'))
    expect(chip(b, 'Stopped').className).toMatch(/text-destructive/)
    expect(within(b).getByText(/^The upload stopped at part 14 of 38 on 26 Sep/)).toBeInTheDocument()
    expect(within(b).getByRole('button', { name: 'Delete imported data' })).toBeInTheDocument()
    expect(within(b).getByText('Choose the same ZIP file')).toBeInTheDocument()
    const go = within(b).getByRole('button', { name: 'Continue the import' })
    expect(go).toBeDisabled()
    chooseFile()
    fireEvent.click(go)
    // A resume goes straight on: no second confirm, and no zone is sent (the import keeps its own).
    await waitFor(() => expect(prepared.upload).toHaveBeenCalledTimes(1))
    expect(h.prepareImport.mock.calls[0][0].sourceTimezone).toBeNull()
  })

  it('says a different file in words (plan_mismatch)', async () => {
    h.slot = { existing_import: status({ status: 'failed', error_code: 'upload_abandoned', cursor: { step: 13, part: 0 }, finished_at: null }) }
    h.prepareImport.mockRejectedValue(new ImportError('plan_mismatch', 'raw', { detail: { import_id: 'imp-1' } }))
    renderTab()
    const b = await waitFor(() => block('Plausible'))
    chooseFile('other.zip')
    fireEvent.click(within(b).getByRole('button', { name: 'Continue the import' }))
    expect(
      await screen.findByText('This is a different file from the one this import started with. Choose the same file, or delete the import to start again.'),
    ).toBeInTheDocument()
  })
})

// ─── moving without this tab ────────────────────────────────────────────────
describe('an import moving without this tab', () => {
  it('shows an upload another tab is sending, polls it, and still lets the same file carry it on', async () => {
    h.slot = { existing_import: status({ status: 'running', cursor: { step: 10, part: 0 }, finished_at: null }) }
    renderTab()
    const b = await waitFor(() => block('Plausible'))
    expect(chip(b, 'Importing')).toBeInTheDocument()
    expect(within(b).getByText('Part 10 of 38')).toBeInTheDocument()
    expect(within(b).getByText(/uploading from another tab or window/)).toBeInTheDocument()
    expect(within(b).getByText('Choose the same ZIP file')).toBeInTheDocument()
    // Polled every five seconds (M11-e) until it stops moving.
    const reads = h.getImportSlot.mock.calls.length
    h.slot = { existing_import: status() }
    await waitFor(() => expect(h.getImportSlot.mock.calls.length).toBeGreaterThan(reads), { timeout: 8_000 })
    expect(await screen.findByText('Your export file never left your browser.')).toBeInTheDocument()
  }, 20_000)

  it('does not poll an import that has finished', async () => {
    h.slot = { existing_import: status() }
    renderTab()
    await waitFor(() => block('Plausible'))
    const reads = h.getImportSlot.mock.calls.length
    await new Promise((r) => setTimeout(r, 6_000))
    expect(h.getImportSlot.mock.calls.length).toBe(reads)
  }, 20_000)

  it('shows a pull import in progress to every member, with the pull progress text', async () => {
    h.canManage = false
    h.slot = {
      existing_import: status({ id: 'imp-m', source: 'matomo', kind: 'api_key', status: 'running', cursor: { step: 3, part: 0 }, steps_total: 20, fingerprint: null, finished_at: null }),
    }
    renderTab()
    const b = await waitFor(() => block('Matomo'))
    expect(chip(b, 'Importing')).toBeInTheDocument()
    expect(within(b).getByText('Part 3 of 20')).toBeInTheDocument()
    expect(within(b).getByText('You can close this page.')).toBeInTheDocument()
    expect(within(b).queryByRole('button')).toBeNull()
  })
})

// ─── failed, not resumable: Delete only ─────────────────────────────────────
describe('failed', () => {
  it('shows the failure in words and offers only Delete', async () => {
    h.slot = { existing_import: status({ status: 'failed', error_code: 'some_future_code', finished_at: null }) }
    renderTab()
    const b = await waitFor(() => block('Plausible'))
    expect(chip(b, 'Failed')).toBeInTheDocument()
    expect(within(b).getByText('Something unexpected came back from Pulse. Nothing more was saved. Try again.')).toBeInTheDocument()
    expect(within(b).getByRole('button', { name: 'Delete imported data' })).toBeInTheDocument()
    expect(within(b).queryByTestId('import-dropzone')).toBeNull()
  })
})

// ─── every member reads status; only managers act ───────────────────────────
describe('a member without integrations.manage', () => {
  it('sees the status and no controls', async () => {
    h.canManage = false
    h.slot = { existing_import: status() }
    renderTab()
    const b = await waitFor(() => block('Plausible'))
    expect(chip(b, 'Imported')).toBeInTheDocument()
    expect(within(b).getByText('1 Jan 2025 to 14 Sep 2026 · 622 days')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete imported data' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull()
  })

  it('sees a stopped upload without a file chooser', async () => {
    h.canManage = false
    h.slot = { existing_import: status({ status: 'failed', error_code: 'upload_abandoned', cursor: { step: 13, part: 0 }, finished_at: null }) }
    renderTab()
    const b = await waitFor(() => block('Plausible'))
    expect(within(b).getByText('Stopped')).toBeInTheDocument()
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
    renderTab()
    fireEvent.click(await within(await waitFor(() => block('Matomo'))).findByRole('button', { name: 'Connect' }))
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
    // M10's disclosures, before anything starts.
    expect(screen.getByText(/Matomo keeps at most 500 to 1,000 rows of a report per day by default/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start the import' }))
    await waitFor(() => expect(h.confirmDataImport).toHaveBeenCalledWith('s1', 'imp-m', '3'))
    // Pull: the page can close, and the status is polled.
    expect(await screen.findByText('You can close this page.')).toBeInTheDocument()
  })

  it('deletes the waiting connection on Cancel, so no token is left behind', async () => {
    h.slot = { existing_import: awaiting }
    h.getMatomoProperties.mockResolvedValue({ properties: [], suggested_id: null })
    renderTab()
    const b = await waitFor(() => block('Matomo'))
    expect(within(b).getByText('Choose a site')).toBeInTheDocument()
    h.slot = { existing_import: null }
    fireEvent.click(within(b).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(h.deleteImport).toHaveBeenCalledWith(expect.objectContaining({ importId: 'imp-m' })))
  })

  it('says each connect refusal in words, and keeps Matomo\'s own message behind Details', async () => {
    h.connectMatomo.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), {
        status: 401,
        data: { error: 'raw', code: 'matomo_bad_token', source_message: 'Unable to authenticate with the provided token.' },
      }),
    )
    renderTab()
    fireEvent.click(await within(await waitFor(() => block('Matomo'))).findByRole('button', { name: 'Connect' }))
    fireEvent.change(screen.getByLabelText('Matomo address'), { target: { value: 'https://stats.example.org' } })
    fireEvent.change(screen.getByLabelText('Token'), { target: { value: 'bad' } })
    fireEvent.click(screen.getByRole('button', { name: 'Load sites' }))
    expect(
      await screen.findByText("Pulse can't sign in with this token. Check that you copied it in full and that it's still active in Matomo."),
    ).toBeInTheDocument()
    expect(within(screen.getByTestId('import-error-details')).getByText('Unable to authenticate with the provided token.')).toBeInTheDocument()
    expect(screen.queryByText('raw')).toBeNull()
  })

  it('says a finished import cannot have its token revoked by Pulse', async () => {
    h.slot = { existing_import: status({ id: 'imp-m', source: 'matomo', kind: 'api_key', fingerprint: null, totals: null }) }
    renderTab()
    const b = await waitFor(() => block('Matomo'))
    expect(chip(b, 'Imported')).toBeInTheDocument()
    expect(within(b).getByText(/Pulse can't revoke this token automatically/)).toBeInTheDocument()
    expect(within(block('Plausible')).getByRole('button', { name: 'Upload' })).toBeDisabled()
  })
})
