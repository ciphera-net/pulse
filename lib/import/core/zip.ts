// ─── Reading an export file: ZIP, gzip or plain, behind a bomb guard ───────
//
// D9 moved the zip-bomb guard from the server into the customer's browser
// (§3.12a): the tab that unpacks the export is the one a bomb would take down.
// Four caps, all from §3.12b M2-n:
//
//   - at most 64 entries in an archive;
//   - at most 512 MiB decompressed per entry;
//   - at most 1 GiB decompressed across all entries;
//   - at most 200 bytes decompressed per byte of the File (the whole-archive
//     ratio; fflate's streaming API cannot attribute compressed bytes to an
//     entry, so a per-entry ratio would be a number it does not have).
//
// 🔴 THE CAPS COUNT BYTES THAT ACTUALLY CAME OUT OF THE DECOMPRESSOR — every
// chunk delivered through an entry's `ondata` — NEVER THE SIZE THE ENTRY
// DECLARES. The declared size is written by whoever made the archive, and an
// entry with a data descriptor (general-purpose bit 3, how streaming zippers
// write) declares nothing at all until after its data. A guard that trusts
// the header is a guard the archive controls.
//
// 🔴 `unzipSync` is never used: it inflates every entry into memory before any
// check could run. Everything here is streamed, and the File is pushed into
// the decompressor in small slices so that one push can never inflate into
// more than about 16 MiB (deflate's ceiling is ~1032:1) before a guard sees it.
//
// A plain `.gz` (one CSV, compressed) goes through the platform's
// DecompressionStream('gzip') behind the same byte guards; an uncompressed file
// is passed through as one entry, behind the entry and total caps (M7-b).

import { Unzip, UnzipInflate, type UnzipFile } from 'fflate'
import { ImportError, wrongFile, type ZipGuard } from '../errors'

const MiB = 1024 * 1024

export interface ArchiveLimits {
  maxEntries: number
  maxEntryBytes: number
  maxTotalBytes: number
  maxRatio: number
}

export const ARCHIVE_LIMITS: Readonly<ArchiveLimits> = {
  maxEntries: 64,
  maxEntryBytes: 512 * MiB,
  maxTotalBytes: 1024 * MiB,
  maxRatio: 200,
}

/** How much of the File is pushed into the decompressor at a time. */
const PUSH_SLICE = 16 * 1024

export type InputKind = 'zip' | 'gzip' | 'plain'

/** Receives one entry's decompressed bytes, in order, then its end. */
export interface EntrySink {
  chunk(bytes: Uint8Array): void
  end(): void
}

export interface ReadOptions {
  limits?: ArchiveLimits
  /** Bytes of the File read so far, for a progress bar. */
  onProgress?: (bytesRead: number, bytesTotal: number) => void
}

/** Sniffs the first bytes: a ZIP local header, a gzip member, or anything else. */
export async function detectInputKind(file: Blob): Promise<InputKind> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) return 'zip'
  if (head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b) return 'gzip'
  return 'plain'
}

/**
 * Counts decompressed bytes against the four caps. One instance per File.
 * Exported so the tests can drive it directly; readers own their instance.
 */
export class DecompressionBudget {
  private total = 0
  private readonly ratioCap: number

  constructor(
    private readonly limits: ArchiveLimits,
    fileSize: number,
  ) {
    this.ratioCap = limits.maxRatio * Math.max(fileSize, 1)
  }

  /** Records `n` more bytes delivered for an entry that has now produced `entryTotal` in all. */
  add(entry: string, entryTotal: number, n: number): void {
    this.total += n
    if (entryTotal > this.limits.maxEntryBytes) {
      throw tooLarge('entry_bytes', entry, this.limits.maxEntryBytes, entryTotal,
        `${entry} unpacks to more than ${Math.round(this.limits.maxEntryBytes / MiB)} MiB`)
    }
    if (this.total > this.limits.maxTotalBytes) {
      throw tooLarge('total_bytes', entry, this.limits.maxTotalBytes, this.total,
        `its files unpack to more than ${Math.round(this.limits.maxTotalBytes / MiB)} MiB`)
    }
    if (this.total > this.ratioCap) {
      throw tooLarge('ratio', entry, this.ratioCap, this.total,
        `it unpacks to more than ${this.limits.maxRatio} times its own size`)
    }
  }
}

function tooLarge(guard: ZipGuard, file: string, limit: number, observed: number, what: string): ImportError {
  return new ImportError('zip_too_large', `This file is too large to read safely: ${what}.`, {
    detail: { guard, file, limit, observed },
  })
}

/**
 * Streams a ZIP. `entry(name)` is called for every entry in archive order and
 * returns the sink to read it into, or null to leave it unread (an unread
 * entry is never decompressed, so it cannot count against the byte caps).
 */
export async function readZip(
  file: Blob,
  entry: (name: string) => EntrySink | null,
  options: ReadOptions = {},
): Promise<{ entries: number }> {
  const limits = options.limits ?? ARCHIVE_LIMITS
  const budget = new DecompressionBudget(limits, file.size)
  let entries = 0
  // The first failure wins, and it is kept exactly as it was thrown. fflate's
  // inflater catches an exception thrown from `ondata` and calls `ondata` again
  // with it as `err`; without this the second call would decide what the
  // caller sees. Only errors fflate raises about the archive itself are
  // translated into `wrong_file` — an exception from our own code is not the
  // customer's file being wrong, and must not be reported as if it were.
  let failure: unknown = null
  const open = new Set<string>()

  const unzip = new Unzip((f: UnzipFile) => {
    if (failure) throw failure
    try {
      entries++
      if (entries > limits.maxEntries) {
        throw new ImportError(
          'zip_too_many_entries',
          `This archive has more than ${limits.maxEntries} files in it, which no export has.`,
          { detail: { limit: limits.maxEntries, observed: entries } },
        )
      }
      const sink = entry(f.name)
      if (!sink) return
      if (f.compression !== 0 && f.compression !== 8) {
        throw wrongFile('unsupported_compression', `${f.name} is compressed with a method this reader does not support.`, {
          file: f.name,
        })
      }
      const name = f.name
      let produced = 0
      open.add(name)
      f.ondata = (err, data, final) => {
        if (failure) throw failure
        if (err) {
          failure = asReadError(err, name)
          throw failure
        }
        try {
          if (data && data.length > 0) {
            produced += data.length
            budget.add(name, produced, data.length)
            sink.chunk(data)
          }
          if (final) {
            open.delete(name)
            sink.end()
          }
        } catch (e) {
          failure = e
          throw e
        }
      }
      f.start()
    } catch (e) {
      failure = failure ?? e
      throw failure
    }
  })
  unzip.register(UnzipInflate)

  const reader = file.stream().getReader()
  let read = 0
  const head: number[] = []
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      for (let k = 0; head.length < 4 && k < value.length; k++) head.push(value[k])
      read += value.length
      for (let off = 0; off < value.length; off += PUSH_SLICE) {
        unzip.push(value.subarray(off, Math.min(off + PUSH_SLICE, value.length)), false)
      }
      options.onProgress?.(read, file.size)
    }
    unzip.push(new Uint8Array(0), true)
  } catch (e) {
    await reader.cancel().catch(() => {})
    throw failure ?? asReadError(e, null)
  }
  if (failure) throw failure
  if (open.size > 0) {
    throw wrongFile('truncated_archive', 'The archive ends before all of its files do. Download the export again.', {
      files: [...open],
    })
  }
  if (entries === 0) {
    // A ZIP signature with no complete entry after it is a download cut short,
    // not a different kind of file.
    const signed = head.length === 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04
    throw signed
      ? wrongFile('truncated_archive', 'The archive ends before its first file does. Download the export again.')
      : wrongFile('not_an_archive', 'This file is not a ZIP archive with files in it.')
  }
  return { entries }
}

/** Streams a single gzip member into `sink` through DecompressionStream('gzip'). */
export async function readGzip(file: Blob, name: string, sink: EntrySink, options: ReadOptions = {}): Promise<void> {
  const limits = options.limits ?? ARCHIVE_LIMITS
  const budget = new DecompressionBudget(limits, file.size)
  let read = 0
  const counted = file.stream().pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        read += chunk.length
        options.onProgress?.(read, file.size)
        controller.enqueue(chunk)
      },
    }),
  )
  const reader = counted
    .pipeThrough(new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>)
    .getReader()
  let produced = 0
  for (;;) {
    let next: ReadableStreamReadResult<Uint8Array>
    try {
      next = await reader.read()
    } catch (e) {
      throw asReadError(e, name)
    }
    if (next.done) break
    try {
      produced += next.value.length
      budget.add(name, produced, next.value.length)
      sink.chunk(next.value)
    } catch (e) {
      await reader.cancel().catch(() => {})
      throw e
    }
  }
  sink.end()
}

/**
 * Streams an uncompressed file into `sink` as it is, behind the same byte caps
 * a ZIP entry gets (M7-b): a plain file never had a budget, and a plain upload
 * is the one input no decompressor bounds.
 *
 * `budget` is optional. Omitted, the file gets a fresh budget of its own, sized
 * from its own size, so a single plain file needs nothing more. A source that
 * reads SEVERAL plain files (Fathom's seven) builds ONE budget sized from the
 * SUM of their sizes and passes it into every call, so `maxTotalBytes` bounds
 * the whole upload rather than whichever file happens to be read last, and a
 * failure names the file whose bytes crossed the cap. The ratio guard is a
 * structural no-op here (a plain read never produces more bytes than the file
 * holds), and needs no special case.
 */
export async function readPlain(
  file: Blob,
  name: string,
  sink: EntrySink,
  options: ReadOptions = {},
  budget: DecompressionBudget = new DecompressionBudget(options.limits ?? ARCHIVE_LIMITS, file.size),
): Promise<void> {
  const reader = file.stream().getReader()
  let read = 0
  for (;;) {
    let next: ReadableStreamReadResult<Uint8Array>
    try {
      next = await reader.read()
    } catch (e) {
      throw asReadError(e, name)
    }
    if (next.done) break
    read += next.value.length
    try {
      budget.add(name, read, next.value.length)
      sink.chunk(next.value)
    } catch (e) {
      await reader.cancel().catch(() => {})
      throw e
    }
    options.onProgress?.(read, file.size)
  }
  sink.end()
}

/**
 * Translates an error fflate or the platform raised about the FILE into a named
 * one. fflate's errors carry a numeric `code`: 0 is "unexpected EOF" inside a
 * deflate stream, 13 is Unzip ending while an entry still had bytes to come,
 * and 14 an unknown compression method.
 */
function asReadError(e: unknown, file: string | null): unknown {
  if (e instanceof ImportError) return e
  const message = e instanceof Error ? e.message : String(e)
  const code = typeof (e as { code?: unknown })?.code === 'number' ? (e as { code: number }).code : null
  const detail = file ? { file } : {}
  if (code === 0 || code === 13 || /unexpected EOF/i.test(message)) {
    return wrongFile('truncated_archive', 'The file ends before its data does. Download the export again.', detail)
  }
  if (code === 14 || /compression/i.test(message)) {
    return wrongFile('unsupported_compression', 'The file is compressed with a method this reader does not support.', detail)
  }
  return wrongFile('unreadable_archive', 'The file could not be decompressed. It may be damaged; download the export again.', detail)
}
