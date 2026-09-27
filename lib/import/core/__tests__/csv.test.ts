// @vitest-environment node
//
// The streaming CSV parser, gate 5 (§3.12b): the RFC 4180 cases real exports
// use, a fuzz that re-parses random CSV fed in random chunks, and the case the
// RFC tests cannot see — a multi-byte UTF-8 character split exactly on a chunk
// boundary, which only a STATEFUL decoder survives.
//
// Mutations these kill: decoding each chunk on its own (the split-character
// tests go red); dropping the BOM strip; counting CRLF as two lines; losing a
// field's tail when a chunk ends inside it.

import { describe, expect, it } from 'vitest'
import { ImportError } from '../../errors'
import { CsvByteParser, CsvParser, Utf8Stream } from '../csv'

type Rec = { fields: string[]; line: number }

function parseText(text: string, chunks?: number[]): Rec[] {
  const out: Rec[] = []
  const p = new CsvParser((fields, line) => out.push({ fields, line }), 't.csv')
  if (!chunks) p.push(text)
  else {
    let at = 0
    for (const n of chunks) {
      p.push(text.slice(at, at + n))
      at += n
    }
    p.push(text.slice(at))
  }
  p.end()
  return out
}

function parseBytes(bytes: Uint8Array, cuts: number[]): Rec[] {
  const out: Rec[] = []
  const p = new CsvByteParser((fields, line) => out.push({ fields, line }), 't.csv')
  let at = 0
  for (const cut of [...cuts, bytes.length]) {
    p.push(bytes.subarray(at, cut))
    at = cut
  }
  p.end()
  return out
}

const utf8 = (s: string) => new TextEncoder().encode(s)

describe('CsvParser: RFC 4180', () => {
  it('reads a header and rows, LF-terminated', () => {
    expect(parseText('a,b\n1,2\n3,4\n')).toEqual([
      { fields: ['a', 'b'], line: 1 },
      { fields: ['1', '2'], line: 2 },
      { fields: ['3', '4'], line: 3 },
    ])
  })

  it('reads CRLF and a lone CR as one record separator each', () => {
    expect(parseText('a,b\r\n1,2\r3,4')).toEqual([
      { fields: ['a', 'b'], line: 1 },
      { fields: ['1', '2'], line: 2 },
      { fields: ['3', '4'], line: 3 },
    ])
  })

  it('keeps the last record when the input has no final line break', () => {
    expect(parseText('a,b\n1,2')).toEqual([
      { fields: ['a', 'b'], line: 1 },
      { fields: ['1', '2'], line: 2 },
    ])
  })

  it('reads quoted fields with commas, escaped quotes and embedded line breaks', () => {
    const recs = parseText('a,b\n"x, y","say ""hi"""\n"line1\r\nline2",z\nnext,row\n')
    expect(recs).toEqual([
      { fields: ['a', 'b'], line: 1 },
      { fields: ['x, y', 'say "hi"'], line: 2 },
      { fields: ['line1\r\nline2', 'z'], line: 3 },
      // The embedded CRLF moved the physical line on by exactly one.
      { fields: ['next', 'row'], line: 5 },
    ])
  })

  it('reads empty fields, quoted and unquoted, including a trailing one', () => {
    expect(parseText('a,,""\n,b,\n')).toEqual([
      { fields: ['a', '', ''], line: 1 },
      { fields: ['', 'b', ''], line: 2 },
    ])
  })

  it('skips blank lines without shifting the line numbers of the records around them', () => {
    expect(parseText('a,b\n\n1,2\r\n\r\n3,4\n')).toEqual([
      { fields: ['a', 'b'], line: 1 },
      { fields: ['1', '2'], line: 3 },
      { fields: ['3', '4'], line: 5 },
    ])
  })

  it('drops a leading BOM, given as text', () => {
    expect(parseText('﻿date,visitors\n')[0].fields).toEqual(['date', 'visitors'])
  })

  it('drops a leading UTF-8 BOM, given as bytes', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('date,visitors\n1,2\n')])
    expect(parseBytes(bytes, [1, 2]).map((r) => r.fields)).toEqual([
      ['date', 'visitors'],
      ['1', '2'],
    ])
  })

  it.each([
    ['an unterminated quote', 'a,b\n"open,2\n3,4\n'],
    ['a quote inside an unquoted field', 'a,b\nab"c,2\n'],
    ['text after a closing quote', 'a,b\n"x"y,2\n'],
  ])('refuses %s as malformed, naming the line', (_what, text) => {
    let error: unknown
    try {
      parseText(text)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(ImportError)
    expect((error as ImportError).code).toBe('wrong_file')
    expect((error as ImportError).detail.reason).toBe('malformed_csv')
    expect((error as ImportError).detail.line).toBeGreaterThanOrEqual(2)
  })
})

describe('Utf8Stream: one stateful decoder per file', () => {
  it('survives a two-, three- and four-byte character split on EVERY possible boundary', () => {
    for (const ch of ['é', '€', '中', '😀']) {
      const text = `x,${ch}\n`
      const bytes = utf8(text)
      for (let cut = 1; cut < bytes.length; cut++) {
        expect(parseBytes(bytes, [cut]).map((r) => r.fields), `${ch} cut at ${cut}`).toEqual([['x', ch]])
      }
    }
  })

  it('survives every byte arriving on its own', () => {
    const text = 'page,visitors\n"/über/中文/😀",3\n'
    const bytes = utf8(text)
    const cuts = Array.from({ length: bytes.length - 1 }, (_, i) => i + 1)
    expect(parseBytes(bytes, cuts).map((r) => r.fields)).toEqual([
      ['page', 'visitors'],
      ['/über/中文/😀', '3'],
    ])
  })

  it('names bytes that are not UTF-8 as unsupported_encoding', () => {
    const s = new Utf8Stream('t.csv')
    expect(() => s.push(new Uint8Array([0x61, 0xff, 0x62]))).toThrow(
      expect.objectContaining({ code: 'unsupported_encoding' }),
    )
  })

  it('names a UTF-16 export as unsupported_encoding', () => {
    const utf16 = new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0x2c, 0x00, 0x62, 0x00])
    expect(() => parseBytes(utf16, [])).toThrow(expect.objectContaining({ code: 'unsupported_encoding' }))
  })

  it('names a character cut off by the end of the file as unsupported_encoding', () => {
    const bytes = utf8('a,€')
    expect(() => parseBytes(bytes.subarray(0, bytes.length - 1), [])).toThrow(
      expect.objectContaining({ code: 'unsupported_encoding' }),
    )
  })
})

// ─── Fuzz ────────────────────────────────────────────────────────────────

/** A small deterministic PRNG so a failure reproduces from its seed. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ALPHABET = ['a', 'b', 'Z', '0', '9', ' ', '/', '-', ',', '"', '\n', '\r', '\r\n', 'é', '€', '中', '😀', '\t']

function randomCsv(rand: () => number): { text: string; records: Rec[] } {
  const records: Rec[] = []
  const width = 2 + Math.floor(rand() * 4)
  const count = 1 + Math.floor(rand() * 12)
  let text = rand() < 0.2 ? '﻿' : ''
  let line = 1
  for (let r = 0; r < count; r++) {
    const fields: string[] = []
    const cells: string[] = []
    for (let c = 0; c < width; c++) {
      let v = ''
      const len = Math.floor(rand() * 7)
      for (let k = 0; k < len; k++) v += ALPHABET[Math.floor(rand() * ALPHABET.length)]
      fields.push(v)
      const mustQuote = /[",\r\n]/.test(v)
      cells.push(mustQuote || rand() < 0.2 ? `"${v.replace(/"/g, '""')}"` : v)
    }
    records.push({ fields, line })
    const body = cells.join(',')
    text += body
    // Physical lines inside quoted fields: CRLF counts once.
    line += (body.match(/\r\n|\r|\n/g) ?? []).length
    const last = r === count - 1
    if (!last || rand() < 0.7) {
      text += rand() < 0.5 ? '\r\n' : '\n'
      line++
    }
  }
  return { text, records }
}

describe('CsvByteParser: fuzz', () => {
  it('parses 2,000 random documents fed in random byte chunks exactly as written', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const rand = rng(seed)
      const { text, records } = randomCsv(rand)
      const bytes = utf8(text)
      const cuts: number[] = []
      let at = 0
      while (at < bytes.length) {
        at += 1 + Math.floor(rand() * 9)
        if (at < bytes.length) cuts.push(at)
      }
      expect(parseBytes(bytes, cuts), `seed ${seed}`).toEqual(records)
    }
  })

  it('gives the same records whether the text arrives whole or one character at a time', () => {
    for (let seed = 5000; seed < 5200; seed++) {
      const { text } = randomCsv(rng(seed))
      const whole = parseText(text)
      const oneByOne = parseText(text, Array.from({ length: text.length }, () => 1))
      expect(oneByOne, `seed ${seed}`).toEqual(whole)
    }
  })
})
