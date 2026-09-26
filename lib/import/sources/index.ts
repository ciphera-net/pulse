// The parsers, by source id. Only the worker imports this (it pulls in the zip
// and CSV code); the main thread reads source-meta.ts instead.

import type { ImportSource } from '../source-meta'
import { plausibleSource } from './plausible'
import type { SourceParser } from './source'

export const SOURCE_PARSERS: Readonly<Record<ImportSource, SourceParser>> = {
  plausible: plausibleSource,
}
