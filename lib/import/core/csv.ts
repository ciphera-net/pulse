// ─── A streaming RFC 4180 parser, written for fixed export schemas ─────────
//
// Why not a library: every source's columns are fixed and known, so the
// generality of a general-purpose CSV package buys nothing here, and a narrow
// parser is a smaller thing to audit in a file that reads untrusted input.
// What it does handle, because real exports use all of it (§3.12b M2-n):
//
//   - quoted fields, with "" as an escaped quote;
//   - line breaks INSIDE a quoted field (CRLF, LF or CR), kept verbatim;
//   - CRLF, LF or a lone CR as the record separator;
//   - a UTF-8 byte-order mark before the header;
//   - input arriving in arbitrary chunks, split anywhere — inside a field,
//     between the two quotes of an escaped quote, between a CR and its LF.
//
// 🔴 TEXT DECODING IS STATEFUL, ONE DECODER PER FILE. A chunk boundary can fall
// in the middle of a multi-byte UTF-8 character; decoding each chunk on its own
// turns that character into garbage (or, with `fatal`, into an error) and the
// corruption is invisible to every RFC test. `Utf8Stream` holds one TextDecoder
// for the whole entry and decodes with `{ stream: true }`, which carries the
// partial character over to the next chunk. The fuzz test splits a character on
// the exact boundary.
//
// Malformed input is a named error, not a guess: an unterminated quote would
// otherwise swallow every row after it into one field, which is a silent loss.

import { ImportError, wrongFile } from '../errors'

const COMMA = 44
const QUOTE = 34
const LF = 10
const CR = 13
const BOM = 0xfeff

const enum State {
  /** At the start of a field (after a comma, a record separator, or the start of input). */
  FieldStart,
  Unquoted,
  Quoted,
  /** Saw a quote inside a quoted field: either the first half of "" or the closing quote. */
  QuoteInQuoted,
  /** Saw a CR that ended a record; a following LF belongs to it. */
  AfterCr,
}

/** Receives each record's fields and the 1-based physical line the record starts on. */
export type CsvRowHandler = (fields: string[], line: number) => void

export class CsvParser {
  private state = State.FieldStart
  private field = ''
  private fields: string[] = []
  /** The physical line the parser is on (1-based). */
  private line = 1
  /** The line the current record started on. */
  private recordLine = 1
  /** Whether any character of the current record has been consumed. */
  private inRecord = false
  /** A CR inside a quoted field whose line was counted, so a following LF must not be. */
  private crInQuoted = false
  private atStart = true

  constructor(
    private readonly onRow: CsvRowHandler,
    private readonly file: string,
  ) {}

  push(text: string): void {
    let i = 0
    const n = text.length
    if (this.atStart && n > 0) {
      this.atStart = false
      if (text.charCodeAt(0) === BOM) i = 1
    }
    while (i < n) {
      switch (this.state) {
        case State.AfterCr: {
          if (text.charCodeAt(i) === LF) i++
          this.state = State.FieldStart
          break
        }
        case State.FieldStart: {
          if (!this.inRecord) {
            this.inRecord = true
            this.recordLine = this.line
          }
          if (text.charCodeAt(i) === QUOTE) {
            this.state = State.Quoted
            i++
          } else {
            this.state = State.Unquoted
          }
          break
        }
        case State.Unquoted: {
          let j = i
          let c = 0
          while (j < n) {
            c = text.charCodeAt(j)
            if (c === COMMA || c === LF || c === CR) break
            if (c === QUOTE) {
              throw this.malformed('a quote inside an unquoted field')
            }
            j++
          }
          if (j > i) this.field += text.slice(i, j)
          if (j === n) {
            i = n
            break
          }
          this.endField()
          if (c === COMMA) {
            this.state = State.FieldStart
          } else {
            this.endRecord()
            this.line++
            this.state = c === CR ? State.AfterCr : State.FieldStart
          }
          i = j + 1
          break
        }
        case State.Quoted: {
          const q = text.indexOf('"', i)
          const end = q === -1 ? n : q
          if (end > i) {
            this.countBreaks(text, i, end)
            this.field += text.slice(i, end)
          }
          if (q === -1) {
            i = n
          } else {
            this.state = State.QuoteInQuoted
            this.crInQuoted = false
            i = q + 1
          }
          break
        }
        case State.QuoteInQuoted: {
          const c = text.charCodeAt(i)
          if (c === QUOTE) {
            this.field += '"'
            this.state = State.Quoted
            i++
          } else if (c === COMMA) {
            this.endField()
            this.state = State.FieldStart
            i++
          } else if (c === LF || c === CR) {
            this.endField()
            this.endRecord()
            this.line++
            this.state = c === CR ? State.AfterCr : State.FieldStart
            i++
          } else {
            throw this.malformed('text after a closing quote')
          }
          break
        }
      }
    }
  }

  /** Flush the last record. A quote left open at the end of the input is malformed. */
  end(): void {
    if (this.state === State.Quoted) throw this.malformed('a quoted field that never closes')
    if (this.state === State.QuoteInQuoted || this.state === State.Unquoted) {
      this.endField()
      this.endRecord()
    } else if (this.state === State.FieldStart && this.inRecord) {
      // "a,b," at the very end of the input: the record's last field is empty.
      this.endField()
      this.endRecord()
    }
  }

  private countBreaks(text: string, from: number, to: number): void {
    for (let k = from; k < to; k++) {
      const c = text.charCodeAt(k)
      if (c === LF) {
        if (!this.crInQuoted) this.line++
        this.crInQuoted = false
      } else if (c === CR) {
        this.line++
        this.crInQuoted = true
      } else {
        this.crInQuoted = false
      }
    }
  }

  private endField(): void {
    this.fields.push(this.field)
    this.field = ''
  }

  private endRecord(): void {
    const fields = this.fields
    this.fields = []
    this.inRecord = false
    // A blank line is not a record. (Every schema this parses has several
    // columns, so a lone empty field can never be real data.)
    if (fields.length === 1 && fields[0] === '') return
    this.onRow(fields, this.recordLine)
  }

  private malformed(what: string): ImportError {
    return wrongFile('malformed_csv', `${this.file} is not valid CSV: ${what} on line ${this.line}.`, {
      file: this.file,
      line: this.line,
    })
  }
}

/**
 * One stateful UTF-8 decoder for one file. `fatal` makes bytes that are not
 * UTF-8 (a UTF-16 export, a Latin-1 re-save) a named error instead of a stream
 * of replacement characters; the default `ignoreBOM: false` drops a UTF-8 BOM.
 */
export class Utf8Stream {
  private readonly decoder = new TextDecoder('utf-8', { fatal: true })

  constructor(private readonly file: string) {}

  push(bytes: Uint8Array): string {
    try {
      return this.decoder.decode(bytes, { stream: true })
    } catch (cause) {
      throw this.unsupported(cause)
    }
  }

  end(): string {
    try {
      return this.decoder.decode()
    } catch (cause) {
      throw this.unsupported(cause)
    }
  }

  private unsupported(cause: unknown): ImportError {
    return new ImportError('unsupported_encoding', `${this.file} is not UTF-8 text.`, {
      detail: { file: this.file },
      cause,
    })
  }
}

/** Bytes in, records out: a decoder and a parser bound to one file. */
export class CsvByteParser {
  private readonly text: Utf8Stream
  private readonly csv: CsvParser

  constructor(onRow: CsvRowHandler, file: string) {
    this.text = new Utf8Stream(file)
    this.csv = new CsvParser(onRow, file)
  }

  push(bytes: Uint8Array): void {
    const s = this.text.push(bytes)
    if (s) this.csv.push(s)
  }

  end(): void {
    const s = this.text.end()
    if (s) this.csv.push(s)
    this.csv.end()
  }
}
