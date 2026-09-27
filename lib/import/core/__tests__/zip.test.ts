// @vitest-environment node
//
// The zip-bomb guard, gate 5 (§3.12b): entry count, per-entry bytes, total
// bytes and the whole-archive ratio, each against a synthetic bomb.
//
// 🔴 The load-bearing cases are the LIARS: archives whose local headers
// declare a size smaller than what the entry inflates to, or (a data
// descriptor, how streaming zippers write) declare nothing at all. A guard
// that reads the declared size passes both. The mutation these kill is any
// guard that counts `originalSize`/`size` instead of the bytes `ondata`
// actually delivered.

import { deflateSync, gzipSync, strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { ImportError } from '../../errors'
import { ARCHIVE_LIMITS, detectInputKind, readGzip, readPlain, readZip, type ArchiveLimits, type EntrySink } from '../zip'

const MiB = 1024 * 1024

function blob(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart])
}

/** Collects every entry's bytes as text. */
function collector() {
  const files: Record<string, string> = {}
  const ends: string[] = []
  return {
    files,
    ends,
    entry(name: string): EntrySink {
      const decoder = new TextDecoder()
      files[name] = ''
      return {
        chunk: (b) => {
          files[name] += decoder.decode(b, { stream: true })
        },
        end: () => {
          files[name] += decoder.decode()
          ends.push(name)
        },
      }
    },
  }
}

async function failure(p: Promise<unknown>): Promise<ImportError> {
  try {
    await p
  } catch (e) {
    if (e instanceof ImportError) return e
    throw new Error(`expected an ImportError, got ${String(e)}`)
  }
  throw new Error('expected the read to fail')
}

const limits = (over: Partial<ArchiveLimits>): ArchiveLimits => ({ ...ARCHIVE_LIMITS, ...over })

// ─── Hand-built archives ──────────────────────────────────────────────────

interface RawEntry {
  name: string
  /** The uncompressed content. */
  content: Uint8Array
  method?: 0 | 8 | 12
  /** What the local header claims the uncompressed size is. */
  declaredSize?: number
  /** Write sizes as 0 and a data descriptor after the data (general-purpose bit 3). */
  dataDescriptor?: boolean
}

function u16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff]
}
function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
}

/** Local headers + data (+ descriptors). fflate's streaming reader needs nothing else. */
function rawZip(entries: RawEntry[]): Uint8Array {
  const out: number[] = []
  for (const e of entries) {
    const method = e.method ?? 8
    const data = method === 8 ? deflateSync(e.content) : e.content
    const name = strToU8(e.name)
    const dd = e.dataDescriptor === true
    const csize = dd ? 0 : data.length
    const usize = dd ? 0 : (e.declaredSize ?? e.content.length)
    out.push(...u32(0x04034b50), ...u16(20), ...u16(dd ? 8 : 0), ...u16(method), ...u16(0), ...u16(0))
    out.push(...u32(0), ...u32(csize), ...u32(usize), ...u16(name.length), ...u16(0))
    out.push(...name)
    for (const b of data) out.push(b)
    if (dd) out.push(...u32(0x08074b50), ...u32(0), ...u32(data.length), ...u32(e.declaredSize ?? e.content.length))
  }
  return new Uint8Array(out)
}

const zeros = (n: number) => new Uint8Array(n)

/** Bytes deflate cannot shrink, so a cut lands inside the entry's data. */
function noise(n: number): Uint8Array {
  const out = new Uint8Array(n)
  let x = 2463534242
  for (let i = 0; i < n; i++) {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    out[i] = x & 0xff
  }
  return out
}

describe('readZip: reading', () => {
  it('streams every entry, in order, into its sink', async () => {
    const zip = zipSync({ 'a.csv': strToU8('x,y\n1,2\n'), 'dir/b.csv': strToU8('über\n') })
    const c = collector()
    const { entries } = await readZip(blob(zip), (n) => c.entry(n))
    expect(entries).toBe(2)
    expect(c.files).toEqual({ 'a.csv': 'x,y\n1,2\n', 'dir/b.csv': 'über\n' })
    expect(c.ends).toEqual(['a.csv', 'dir/b.csv'])
  })

  it('reads a data-descriptor entry, which declares no size at all', async () => {
    const c = collector()
    await readZip(blob(rawZip([{ name: 'a.csv', content: strToU8('hello,world\n'), dataDescriptor: true }])), (n) =>
      c.entry(n),
    )
    expect(c.files['a.csv']).toBe('hello,world\n')
  })

  it('leaves an entry the caller declines unread, and does not count it against the caps', async () => {
    // A 50 MiB bomb the caller never opens, next to a small file it does.
    const zip = rawZip([
      { name: 'skip.bin', content: zeros(50 * MiB) },
      { name: 'keep.csv', content: strToU8('a,b\n') },
    ])
    const c = collector()
    await readZip(blob(zip), (n) => (n === 'keep.csv' ? c.entry(n) : null), {
      limits: limits({ maxEntryBytes: 1024, maxTotalBytes: 1024 }),
    })
    expect(c.files).toEqual({ 'keep.csv': 'a,b\n' })
  })

  it('reports progress in bytes of the file read', async () => {
    const zip = zipSync({ 'a.csv': strToU8('x\n'.repeat(1000)) })
    const seen: [number, number][] = []
    await readZip(blob(zip), (n) => collector().entry(n), { onProgress: (r, t) => seen.push([r, t]) })
    expect(seen.at(-1)).toEqual([zip.length, zip.length])
  })
})

describe('readZip: the four guards', () => {
  it('uses the spec caps: 64 entries, 512 MiB per entry, 1 GiB in all, 200:1', () => {
    expect(ARCHIVE_LIMITS).toEqual({ maxEntries: 64, maxEntryBytes: 512 * MiB, maxTotalBytes: 1024 * MiB, maxRatio: 200 })
  })

  it('refuses the 65th entry', async () => {
    const files: Record<string, Uint8Array> = {}
    for (let i = 0; i < 65; i++) files[`f${i}.csv`] = strToU8('a\n')
    const e = await failure(readZip(blob(zipSync(files)), () => null))
    expect(e.code).toBe('zip_too_many_entries')
    expect(e.detail).toMatchObject({ limit: 64, observed: 65 })
  })

  it('accepts exactly 64 entries', async () => {
    const files: Record<string, Uint8Array> = {}
    for (let i = 0; i < 64; i++) files[`f${i}.csv`] = strToU8('a\n')
    await expect(readZip(blob(zipSync(files)), () => null)).resolves.toEqual({ entries: 64 })
  })

  it('stops an entry that inflates past the per-entry cap', async () => {
    const e = await failure(
      readZip(blob(rawZip([{ name: 'big.csv', content: zeros(4 * MiB) }])), (n) => collector().entry(n), {
        limits: limits({ maxEntryBytes: 1 * MiB, maxRatio: 1e9 }),
      }),
    )
    expect(e.code).toBe('zip_too_large')
    expect(e.detail.guard).toBe('entry_bytes')
    expect(e.detail.file).toBe('big.csv')
  })

  it('stops the archive when the entries together pass the total cap', async () => {
    const zip = rawZip([
      { name: 'a.csv', content: zeros(3 * MiB) },
      { name: 'b.csv', content: zeros(3 * MiB) },
    ])
    const e = await failure(
      readZip(blob(zip), (n) => collector().entry(n), {
        limits: limits({ maxEntryBytes: 4 * MiB, maxTotalBytes: 5 * MiB, maxRatio: 1e9 }),
      }),
    )
    expect(e.code).toBe('zip_too_large')
    expect(e.detail.guard).toBe('total_bytes')
    expect(e.detail.file).toBe('b.csv')
  })

  it('stops a small file that unpacks past 200 times its own size, at the DEFAULT caps', async () => {
    // ~20 KiB of deflate that inflates to 20 MiB: a real bomb shape, ~1000:1.
    const zip = rawZip([{ name: 'bomb.csv', content: zeros(20 * MiB) }])
    expect(zip.length).toBeLessThan(40 * 1024)
    const e = await failure(readZip(blob(zip), (n) => collector().entry(n)))
    expect(e.code).toBe('zip_too_large')
    expect(e.detail.guard).toBe('ratio')
    expect(e.detail.limit).toBe(200 * zip.length)
  })

  // 🔴 The liars.
  it('counts the bytes that come out, not the size the header declares', async () => {
    const zip = rawZip([{ name: 'liar.csv', content: zeros(4 * MiB), declaredSize: 10 }])
    const e = await failure(
      readZip(blob(zip), (n) => collector().entry(n), { limits: limits({ maxEntryBytes: 1 * MiB, maxRatio: 1e9 }) }),
    )
    expect(e.code).toBe('zip_too_large')
    expect(e.detail.guard).toBe('entry_bytes')
    expect(e.detail.observed).toBeGreaterThan(1 * MiB)
  })

  it('counts the bytes of a data-descriptor entry, whose header declares nothing', async () => {
    const zip = rawZip([{ name: 'streamed.csv', content: zeros(4 * MiB), dataDescriptor: true, declaredSize: 10 }])
    const e = await failure(
      readZip(blob(zip), (n) => collector().entry(n), { limits: limits({ maxEntryBytes: 1 * MiB, maxRatio: 1e9 }) }),
    )
    expect(e.code).toBe('zip_too_large')
    expect(e.detail.guard).toBe('entry_bytes')
  })

  it('counts a STORED (uncompressed) entry the same way', async () => {
    const zip = rawZip([{ name: 'stored.csv', content: zeros(2 * MiB), method: 0, declaredSize: 1 }])
    const e = await failure(
      readZip(blob(zip), (n) => collector().entry(n), { limits: limits({ maxEntryBytes: 1 * MiB }) }),
    )
    expect(e.detail.guard).toBe('entry_bytes')
  })

  it('never hands a sink more than about 17 MiB in one chunk, however compressible the input', async () => {
    let largest = 0
    const zip = rawZip([{ name: 'z.csv', content: zeros(64 * MiB) }])
    await readZip(
      blob(zip),
      () => ({
        chunk: (b) => {
          largest = Math.max(largest, b.length)
        },
        end: () => {},
      }),
      { limits: limits({ maxRatio: 1e9 }) },
    )
    expect(largest).toBeLessThanOrEqual(17 * MiB)
  })
})

describe('readZip: damaged and foreign archives', () => {
  it('names an archive cut off inside an entry\'s data', async () => {
    const zip = rawZip([{ name: 'a.csv', content: noise(64 * 1024) }])
    const e = await failure(readZip(blob(zip.subarray(0, Math.floor(zip.length / 2))), (n) => collector().entry(n)))
    expect(e.code).toBe('wrong_file')
    expect(e.detail.reason).toBe('truncated_archive')
  })

  it('names an archive cut off inside its first header', async () => {
    const zip = rawZip([{ name: 'a.csv', content: noise(1024) }])
    const e = await failure(readZip(blob(zip.subarray(0, 20)), (n) => collector().entry(n)))
    expect(e.code).toBe('wrong_file')
    expect(e.detail.reason).toBe('truncated_archive')
  })

  it('names bytes that are not an archive at all', async () => {
    const e = await failure(readZip(blob(strToU8('date,visitors\n')), (n) => collector().entry(n)))
    expect(e.code).toBe('wrong_file')
    expect(e.detail.reason).toBe('not_an_archive')
  })

  it('names an entry compressed with a method it cannot read', async () => {
    const e = await failure(readZip(blob(rawZip([{ name: 'a.csv', content: strToU8('abc'), method: 12 }])), (n) => collector().entry(n)))
    expect(e.code).toBe('wrong_file')
    expect(e.detail.reason).toBe('unsupported_compression')
  })

  it('names deflate data that does not inflate', async () => {
    const zip = rawZip([{ name: 'a.csv', content: strToU8('abc'.repeat(100)) }])
    const header = 30 + 'a.csv'.length
    const broken = zip.slice()
    broken[header] = 0xff // an invalid block type in the first byte of the stream
    broken[header + 1] = 0xff
    const e = await failure(readZip(blob(broken), (n) => collector().entry(n)))
    expect(e.code).toBe('wrong_file')
    expect(['unreadable_archive', 'truncated_archive']).toContain(e.detail.reason)
  })

  it('keeps an error its own sink raised exactly as it was thrown', async () => {
    const zip = zipSync({ 'a.csv': strToU8('abc') })
    const own = new ImportError('unsupported_encoding', 'from the sink')
    const e = await failure(
      readZip(blob(zip), () => ({
        chunk: () => {
          throw own
        },
        end: () => {},
      })),
    )
    expect(e).toBe(own)
  })

  it('reports a bug in its own caller as a bug, never as the customer having the wrong file', async () => {
    const zip = zipSync({ 'a.csv': strToU8('abc') })
    await expect(
      readZip(blob(zip), () => ({
        chunk: () => {
          throw new TypeError('a real bug')
        },
        end: () => {},
      })),
    ).rejects.toThrow(TypeError)
  })
})

describe('gzip and plain input', () => {
  it('detects a ZIP, a gzip member and anything else', async () => {
    expect(await detectInputKind(blob(zipSync({ 'a.csv': strToU8('a') })))).toBe('zip')
    expect(await detectInputKind(blob(gzipSync(strToU8('a,b\n'))))).toBe('gzip')
    expect(await detectInputKind(blob(strToU8('a,b\n')))).toBe('plain')
    expect(await detectInputKind(blob(new Uint8Array(0)))).toBe('plain')
  })

  it('streams a .gz through DecompressionStream into one entry', async () => {
    const c = collector()
    await readGzip(blob(gzipSync(strToU8('date,visitors\n2026-03-01,4\n'))), 'events.csv', c.entry('events.csv'))
    expect(c.files['events.csv']).toBe('date,visitors\n2026-03-01,4\n')
    expect(c.ends).toEqual(['events.csv'])
  })

  it('holds a .gz to the same byte guards', async () => {
    const gz = gzipSync(zeros(20 * MiB))
    const e = await failure(readGzip(blob(gz), 'bomb.csv', collector().entry('bomb.csv')))
    expect(e.code).toBe('zip_too_large')
    expect(e.detail.guard).toBe('ratio')
  })

  it('names a damaged .gz', async () => {
    const gz = gzipSync(strToU8('a,b\n'.repeat(100)))
    const e = await failure(readGzip(blob(gz.subarray(0, gz.length - 12)), 'x.csv', collector().entry('x.csv')))
    expect(e.code).toBe('wrong_file')
  })

  it('passes a plain file through as it is', async () => {
    const c = collector()
    await readPlain(blob(strToU8('a,b\n1,2\n')), c.entry('x.csv'))
    expect(c.files['x.csv']).toBe('a,b\n1,2\n')
  })
})
