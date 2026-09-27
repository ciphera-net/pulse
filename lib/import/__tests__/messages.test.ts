// The import's error map (M11-g): every code, wrong-file reason and skip reason
// has a sentence, in the house voice, and a code the map does not know is never
// shown raw.
//
// Exhaustiveness is enforced twice. At COMPILE time, by the `Exhaustive` checks
// below (and by the Record types inside messages.ts): a member added to one of
// the unions without a sentence fails `npm run type-check`. At RUN time, by
// walking the code arrays errors.ts exports and every key the tables hold, so a
// sentence cannot exist that nobody has read through this voice check.

import { describe, expect, it } from 'vitest'
import {
  BROWSER_ERROR_CODES,
  RUNTIME_ERROR_CODES,
  SERVER_ERROR_CODES,
  type ImportErrorCode,
  type WrongFileReason,
} from '../errors'
import type { SkipReason } from '../core/skipped'
import {
  ALL_ERROR_CODES,
  ANTICIPATED_SKIP_REASONS,
  ANTICIPATED_WRONG_FILE_REASONS,
  MAPPED_ERROR_CODES,
  MAPPED_SKIP_REASONS,
  MAPPED_WRONG_FILE_REASONS,
  MATOMO_CONNECT_CODES,
  PULL_ERROR_CODES,
  SERVER_SKIP_REASONS,
  failedImportMessage,
  importErrorMessage,
  isRetryableUploadError,
  skipLines,
  skipReasonPhrase,
  stoppedUploadMessage,
} from '../messages'
import { SOURCE_IDS } from '../source-display'

// ─── compile-time exhaustiveness ───────────────────────────────────────────
//
// messages.ts types its tables as Records over the unions, so a member without
// a sentence fails tsc there. The two unions below have no runtime list, so this
// file keeps one of each, and the Exhaustive checks fail tsc when a union grows
// past its list: the runtime checks further down can then never walk a stale list.
type Exhaustive<Missing> = [Missing] extends [never] ? true : { missing: Missing }

// Every server, browser and runtime code: errors.ts exports these as arrays.
const everyCodeIsListed: Exhaustive<
  Exclude<
    ImportErrorCode,
    (typeof SERVER_ERROR_CODES)[number] | (typeof BROWSER_ERROR_CODES)[number] | (typeof RUNTIME_ERROR_CODES)[number]
  >
> = true
void everyCodeIsListed

const WRONG_FILE_REASONS_ON_STAGING = [
  'not_an_archive',
  'unreadable_archive',
  'truncated_archive',
  'unsupported_compression',
  'duplicate_file',
  'missing_file',
  'empty_file',
  'missing_columns',
  'unexpected_columns',
  'duplicate_columns',
  'malformed_csv',
  'value_out_of_range',
] as const satisfies readonly WrongFileReason[]
// Fails tsc when WrongFileReason gains a member that is in neither list.
type ListedWrongFile = (typeof WRONG_FILE_REASONS_ON_STAGING)[number]
const wrongFileListed: Exhaustive<
  Exclude<WrongFileReason, ListedWrongFile | (typeof ANTICIPATED_WRONG_FILE_REASONS)[number]>
> = true
void wrongFileListed

const SKIP_REASONS_ON_STAGING = [
  'outside_history_window',
  'pulse_measured',
  'needs_place_names',
  'bad_timestamp',
  'not_a_pageview',
  'bot_row',
  'missing_field',
  'bad_number',
] as const satisfies readonly SkipReason[]
type ListedSkip = (typeof SKIP_REASONS_ON_STAGING)[number]
const skipListed: Exhaustive<Exclude<SkipReason, ListedSkip | (typeof ANTICIPATED_SKIP_REASONS)[number]>> = true
void skipListed

// ─── the voice ─────────────────────────────────────────────────────────────
const FORBIDDEN = /[—–!]/

/** Every detail field filled, so no sentence can hide a dash behind a missing value. */
const FULL_DETAIL = {
  file: 'imported_visitors.csv',
  files: ['imported_visitors.csv'],
  columns: ['date', 'visitors'],
  line: 12,
  limit: 7,
  observed: 30,
  skipped: { outside_history_window: 3, pulse_measured: 2 },
  server_code: 'some_new_code',
}

function allSentences(): string[] {
  const out: string[] = []
  for (const source of [...SOURCE_IDS, 'unknown_tool']) {
    for (const code of MAPPED_ERROR_CODES) {
      for (const detail of [{}, FULL_DETAIL]) {
        const m = importErrorMessage({ code, detail, sourceMessage: 'Unable to authenticate.' }, source)
        if (m) out.push(m.text)
      }
    }
    for (const reason of MAPPED_WRONG_FILE_REASONS) {
      for (const detail of [{ reason }, { ...FULL_DETAIL, reason }]) {
        out.push(importErrorMessage({ code: 'wrong_file', detail: detail as never }, source)!.text)
      }
    }
  }
  for (const reason of MAPPED_SKIP_REASONS) out.push(skipReasonPhrase(reason, 1), skipReasonPhrase(reason, 1234))
  return out
}

describe('the import error map', () => {
  it('has a sentence for every server, browser and runtime code errors.ts exports', () => {
    for (const code of [...SERVER_ERROR_CODES, ...BROWSER_ERROR_CODES, ...RUNTIME_ERROR_CODES]) {
      expect(MAPPED_ERROR_CODES, code).toContain(code)
    }
  })

  it('has a sentence for every pull and Matomo connect code', () => {
    for (const code of [...PULL_ERROR_CODES, ...MATOMO_CONNECT_CODES]) {
      expect(MAPPED_ERROR_CODES, code).toContain(code)
      expect(importErrorMessage({ code }, 'matomo')?.text.length).toBeGreaterThan(10)
    }
  })

  it('maps nothing it cannot name: the tables and the code lists agree exactly', () => {
    expect([...MAPPED_ERROR_CODES].sort()).toEqual([...ALL_ERROR_CODES].sort())
  })

  it('has a sentence for every wrong-file reason, including the ones sibling milestones add', () => {
    for (const reason of [...WRONG_FILE_REASONS_ON_STAGING, ...ANTICIPATED_WRONG_FILE_REASONS]) {
      expect(MAPPED_WRONG_FILE_REASONS, reason).toContain(reason)
    }
  })

  it('has a phrase for every skip reason, browser and server', () => {
    for (const reason of [...SKIP_REASONS_ON_STAGING, ...SERVER_SKIP_REASONS, ...ANTICIPATED_SKIP_REASONS]) {
      expect(MAPPED_SKIP_REASONS, reason).toContain(reason)
      expect(skipReasonPhrase(reason, 2)).not.toMatch(/skipped for another reason/)
    }
  })

  it('never uses an em dash, an en dash or an exclamation mark', () => {
    const sentences = allSentences()
    expect(sentences.length).toBeGreaterThan(200)
    for (const s of sentences) expect(s, s).not.toMatch(FORBIDDEN)
  })

  it('fills {tool} from the source, and never prints a raw id or a placeholder', () => {
    for (const s of allSentences()) {
      expect(s, s).not.toMatch(/\{|\}|undefined|null|simple_analytics|ga4\b/)
    }
    expect(importErrorMessage({ code: 'source_not_enabled' }, 'simple_analytics')?.text).toBe(
      "Imports from Simple Analytics aren't available yet.",
    )
  })

  it('says a code it does not know as the unexpected sentence, with the server code behind Details', () => {
    expect(importErrorMessage({ code: 'brand_new_code', detail: { server_code: 'brand_new_code' } }, 'plausible')).toEqual({
      text: 'Something unexpected came back from Pulse. Nothing more was saved. Try again.',
      details: 'brand_new_code',
    })
    expect(importErrorMessage({ code: 'unexpected_response', detail: { server_code: 'teapot' } }, 'plausible')).toEqual({
      text: 'Something unexpected came back from Pulse. Nothing more was saved. Try again.',
      details: 'teapot',
    })
  })

  it('puts the code behind Details for the client-bug codes, and nothing behind a sentence that says enough', () => {
    expect(importErrorMessage({ code: 'invalid_batch' }, 'plausible')?.details).toBe('invalid_batch')
    expect(importErrorMessage({ code: 'import_exists' }, 'plausible')?.details).toBeNull()
  })

  it('says nothing when the person stopped the import', () => {
    expect(importErrorMessage({ code: 'aborted' }, 'plausible')).toBeNull()
  })

  it('chooses the unexpected-archive sentence by source', () => {
    const detail = { reason: 'unexpected_archive' } as never
    expect(importErrorMessage({ code: 'wrong_file', detail }, 'fathom')?.text).toBe(
      "This is Fathom's dashboard download, which holds totals for the whole range. Use Custom Export with Daily grouping instead.",
    )
    expect(importErrorMessage({ code: 'wrong_file', detail }, 'simple_analytics')?.text).toBe(
      'This looks like a ZIP archive. Simple Analytics exports a single CSV file, so upload that file directly.',
    )
    expect(importErrorMessage({ code: 'wrong_file', detail }, 'umami')?.text).toBe(
      'This looks like a ZIP archive. Umami exports a single CSV file, so upload that file directly.',
    )
  })

  it('names the file and the columns a wrong file is missing', () => {
    expect(
      importErrorMessage(
        { code: 'wrong_file', detail: { reason: 'missing_columns', file: 'imported_pages.csv', columns: ['date', 'page'] } },
        'plausible',
      )?.text,
    ).toBe("This doesn't look like a Plausible export. imported_pages.csv is missing the date, page columns.")
  })

  it('says why a file had nothing left to import', () => {
    expect(
      importErrorMessage({ code: 'no_data_in_range', detail: { skipped: { pulse_measured: 4 } } }, 'plausible')?.text,
    ).toBe("There's nothing to import: every day in this file is already measured by Pulse.")
  })

  it('shows Matomo\'s own words only behind Details on a bad token', () => {
    const m = importErrorMessage(
      { code: 'matomo_bad_token', sourceMessage: 'Unable to authenticate with the provided token.' },
      'matomo',
    )
    expect(m?.text).toBe(
      "Pulse can't sign in with this token. Check that you copied it in full and that it's still active in Matomo.",
    )
    expect(m?.details).toBe('Unable to authenticate with the provided token.')
    expect(importErrorMessage({ code: 'matomo_bad_token' }, 'matomo')?.details).toBeNull()
  })

  it('tells a Matomo token that sees no site apart from a Google account with no property', () => {
    expect(importErrorMessage({ code: 'no_properties' }, 'matomo')?.text).toMatch(/can't see any Matomo sites/)
    expect(importErrorMessage({ code: 'no_properties' }, 'ga4')?.text).toBe(
      'This Google account has no Google Analytics 4 properties.',
    )
  })

  it('retries the same prepared upload only after a failure that left it intact', () => {
    for (const code of ['network', 'server_error', 'rate_limited', 'unauthorized']) expect(isRetryableUploadError(code)).toBe(true)
    for (const code of ['plan_mismatch', 'import_not_active', 'invalid_batch', 'aborted']) expect(isRetryableUploadError(code)).toBe(false)
  })
})

describe('a stopped upload', () => {
  const base = {
    cursor: { step: 13, part: 0 },
    steps_total: 38,
    progressed_at: '2026-09-26T10:00:00Z',
    started_at: '2026-09-26T09:00:00Z',
    created_at: '2026-09-26T09:00:00Z',
  }

  it('names the part it stopped in, the total and the day', () => {
    expect(stoppedUploadMessage(base, new Date('2026-09-27T12:00:00Z'))).toBe(
      'The upload stopped at part 14 of 38 on 26 Sep. Choose the same file and it carries on where it stopped. Days already imported stay until you delete them.',
    )
  })

  it('adds the year when the day was in another one', () => {
    expect(stoppedUploadMessage(base, new Date('2027-01-02T12:00:00Z'))).toMatch(/on 26 Sep 2026\./)
  })

  it('never counts past the last part', () => {
    expect(stoppedUploadMessage({ ...base, cursor: { step: 38, part: 0 } })).toMatch(/part 38 of 38/)
  })

  it('reads an abandoned status as the stopped sentence, and any other failure by its code', () => {
    expect(failedImportMessage({ ...base, error_code: 'upload_abandoned' }, 'plausible').text).toMatch(/^The upload stopped/)
    expect(failedImportMessage({ ...base, error_code: 'reconnect_required' }, 'matomo').text).toBe(
      'Matomo no longer accepts the connection. Connect again; the import continues where it stopped.',
    )
    expect(failedImportMessage({ ...base, error_code: null }, 'plausible').text).toMatch(/^Something unexpected/)
  })
})

describe('skipped rows', () => {
  it('adds browser and server counts reason by reason, largest first, zeros dropped', () => {
    const lines = skipLines([{ outside_history_window: 412, pulse_measured: 0 }, { collection_off: 20, outside_history_window: 3 }])
    expect(lines.map((l) => l.text)).toEqual([
      "415 rows dated before this site's history window",
      "20 rows for data this site doesn't collect",
    ])
  })

  it('shows the unreadable reasons as one line, with every sample behind it', () => {
    const lines = skipLines([{ bad_timestamp: 2, bad_number: 1 }], {
      bad_timestamp: [{ file: 'a.csv', line: 4 }],
      bad_number: [{ file: 'b.csv', line: 9 }],
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe("3 rows that couldn't be read")
    expect(lines[0].samples).toEqual([
      { file: 'a.csv', line: 4 },
      { file: 'b.csv', line: 9 },
    ])
  })

  it('counts a reason it does not know in words, never as its code', () => {
    expect(skipLines([{ some_future_reason: 5 }])[0].text).toBe('5 rows skipped for another reason')
  })

  it('writes one row in the singular', () => {
    expect(skipReasonPhrase('outside_history_window', 1)).toBe("1 row dated before this site's history window")
    expect(skipReasonPhrase('needs_place_names', 1)).toBe('1 region or city with no name Pulse knows')
  })
})
