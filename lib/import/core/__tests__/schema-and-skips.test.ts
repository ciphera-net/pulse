// @vitest-environment node
//
// The strict header check (§3.12 rule 3) and the skip ledger (§3.12: counted,
// never silent, never content).

import { describe, expect, it } from 'vitest'
import { ImportError } from '../../errors'
import { checkHeader, requireFiles } from '../schema'
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

  it('names the files an archive is missing, labelled for the customer', () => {
    const e = thrown(() => requireFiles(new Set(['a']), ['a', 'b', 'c'], (f) => `${f}.csv`))
    expect(e.code).toBe('wrong_file')
    expect(e.detail).toEqual({ reason: 'missing_file', files: ['b.csv', 'c.csv'] })
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

  it('holds a sample as a file and a line, and nothing read from the line', () => {
    const s = new SkipLedger()
    s.add('bad_number', { file: 'a.csv', line: 3 })
    expect(Object.keys(s.toSamples().bad_number[0]).sort()).toEqual(['file', 'line'])
  })
})
