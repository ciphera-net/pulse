// @vitest-environment node
//
// The strict header check (§3.12 rule 3) and the skip ledger (§3.12: counted,
// never silent, never content).

import { describe, expect, it } from 'vitest'
import { ImportError, wrongFile } from '../../errors'
import { MAX_UPLOAD_FILES, checkHeader, checkUploadCount, requireExactlyOneFile, requireFiles } from '../schema'
import { MAX_UPLOAD_FILES as FROM_ZIP } from '../zip'
import { MAX_SAMPLES_PER_REASON, SkipLedger } from '../skipped'

const schema = { file: 'imported_x.csv', required: ['date', 'visitors'], known: ['date', 'visitors', 'bounces'] }

function thrown(fn: () => unknown): ImportError {
  try {
    fn()
  } catch (e) {
    if (e instanceof ImportError) return e
    throw e
  }
  throw new Error('expected a throw')
}

describe('checkHeader', () => {
  it('returns each column\'s index, in whatever order the file has them', () => {
    expect(checkHeader(schema, ['visitors', 'bounces', 'date'])).toEqual({ visitors: 0, bounces: 1, date: 2 })
  })

  it('accepts a known column that is not read being absent', () => {
    expect(checkHeader(schema, ['date', 'visitors'])).toEqual({ date: 0, visitors: 1 })
  })

  it('names missing, unexpected and duplicated columns', () => {
    expect(thrown(() => checkHeader(schema, ['date'])).detail).toEqual({
      reason: 'missing_columns',
      file: 'imported_x.csv',
      columns: ['visitors'],
    })
    expect(thrown(() => checkHeader(schema, ['date', 'visitors', 'Visitors'])).detail).toMatchObject({
      reason: 'unexpected_columns',
      columns: ['Visitors'],
    })
    expect(thrown(() => checkHeader(schema, ['date', 'visitors', 'date'])).detail).toMatchObject({
      reason: 'duplicate_columns',
      columns: ['date'],
    })
  })

  it('carries the unexpected_archive reason (M7-p), the ONE reason every plain-file source reuses (M9-c, §3.12c amendment 2)', () => {
    const e = wrongFile('unexpected_archive', 'This looks like a ZIP archive.', { file: 'export.zip' })
    expect(e.code).toBe('wrong_file')
    expect(e.detail).toEqual({ reason: 'unexpected_archive', file: 'export.zip' })
  })

  it('names the files an archive is missing, labelled for the customer', () => {
    const e = thrown(() => requireFiles(new Set(['a']), ['a', 'b', 'c'], (f) => `${f}.csv`))
    expect(e.code).toBe('wrong_file')
    expect(e.detail).toEqual({ reason: 'missing_file', files: ['b.csv', 'c.csv'] })
  })
})

describe('requireFiles', () => {
  it('keeps the archive\'s own sentence by default, and names another container when asked', () => {
    expect(thrown(() => requireFiles(new Set(), ['visitors'])).message).toBe('The archive is missing visitors.')
    expect(thrown(() => requireFiles(new Set(), ['totals'], (f) => f, 'This upload')).message).toBe(
      'This upload is missing totals.',
    )
  })
})

// M7-a: an import is a list of files; these are the count's checks.
describe('the file count', () => {
  it('is capped at 16, one definition, readable beside the archive limits too', () => {
    expect(MAX_UPLOAD_FILES).toBe(16)
    expect(FROM_ZIP).toBe(MAX_UPLOAD_FILES)
  })

  it('refuses no file as missing_file and more than the cap as too_many_files, and passes 1 to 16', () => {
    expect(thrown(() => checkUploadCount(0)).detail).toEqual({ reason: 'missing_file' })
    const over = thrown(() => checkUploadCount(MAX_UPLOAD_FILES + 1))
    expect(over.code).toBe('too_many_files')
    expect(over.detail).toEqual({ limit: 16, observed: 17 })
    expect(over.message).toBe('You can upload at most 16 files at once. Choose only the files this export produced.')
    for (const n of [1, 7, MAX_UPLOAD_FILES]) expect(() => checkUploadCount(n)).not.toThrow()
  })

  it('requireExactlyOneFile returns the one file, and refuses none or several', () => {
    expect(requireExactlyOneFile(['a'])).toBe('a')
    expect(thrown(() => requireExactlyOneFile([])).detail).toEqual({ reason: 'missing_file' })
    const two = thrown(() => requireExactlyOneFile(['a', 'b']))
    expect(two.code).toBe('wrong_file')
    expect(two.detail).toEqual({ reason: 'duplicate_file', limit: 1, observed: 2 })
    expect(two.message).toBe('Choose one file: this export is a single file.')
    expect(thrown(() => requireExactlyOneFile(['a', 'b', 'c'], 'Choose one.')).message).toBe('Choose one.')
  })
})

describe('SkipLedger', () => {
  it('counts every skip but keeps at most five samples per reason', () => {
    const s = new SkipLedger()
    for (let line = 2; line < 20; line++) s.add('bad_timestamp', { file: 'a.csv', line })
    s.add('missing_field', { file: 'b.csv', line: 7 })
    s.add('missing_field', null, 3)
    expect(s.toCounts()).toEqual({ bad_timestamp: 18, missing_field: 4 })
    expect(s.toSamples().bad_timestamp).toHaveLength(MAX_SAMPLES_PER_REASON)
    expect(s.toSamples().bad_timestamp[0]).toEqual({ file: 'a.csv', line: 2 })
    expect(s.toSamples().missing_field).toEqual([{ file: 'b.csv', line: 7 }])
    expect(s.total()).toBe(22)
  })

  it('serialises its counts with sorted keys, so the create request is deterministic', () => {
    const a = new SkipLedger()
    a.add('pulse_measured', null)
    a.add('bad_number', null)
    const b = new SkipLedger()
    b.add('bad_number', null)
    b.add('pulse_measured', null)
    expect(JSON.stringify(a.toCounts())).toBe(JSON.stringify(b.toCounts()))
    expect(Object.keys(a.toCounts())).toEqual(['bad_number', 'pulse_measured'])
  })

  it('counts a breakdown row outside the site-totals range under its own reason (M7-g)', () => {
    const s = new SkipLedger()
    s.add('outside_totals_range', { file: 'pages.csv', line: 7 })
    s.add('outside_totals_range', { file: 'referrers.csv', line: 6 })
    expect(s.toCounts()).toEqual({ outside_totals_range: 2 })
    expect(s.toSamples().outside_totals_range).toEqual([
      { file: 'pages.csv', line: 7 },
      { file: 'referrers.csv', line: 6 },
    ])
  })

  it('counts a row naming a different property under its own reason (M9-j)', () => {
    const s = new SkipLedger()
    s.add('hostname_mismatch', { file: 'export.csv', line: 3 })
    s.add('hostname_mismatch', { file: 'export.csv', line: 5 })
    expect(s.toCounts()).toEqual({ hostname_mismatch: 2 })
    expect(s.toSamples().hostname_mismatch).toEqual([
      { file: 'export.csv', line: 3 },
      { file: 'export.csv', line: 5 },
    ])
  })

  it('holds a sample as a file and a line, and nothing read from the line', () => {
    const s = new SkipLedger()
    s.add('bad_number', { file: 'a.csv', line: 3 })
    expect(Object.keys(s.toSamples().bad_number[0]).sort()).toEqual(['file', 'line'])
  })
})
