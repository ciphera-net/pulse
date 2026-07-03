import fs from 'fs'
import path from 'path'
import ReactMarkdown from 'react-markdown'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Changelog - Pulse',
  description: 'Release history and notable changes for Pulse, privacy-first web analytics.',
}

// * How many release sections (incl. Unreleased) render expanded; the rest
// * collapse behind a native <details> so the page stays a few screens tall
// * instead of ~29k px.
const EXPANDED_SECTIONS = 5

const PROSE_CLASSES = `prose prose-invert max-w-none
  prose-headings:font-semibold prose-headings:tracking-tight
  prose-a:text-brand-orange prose-a:no-underline hover:prose-a:underline
  prose-ul:my-4 prose-li:my-0.5`

/**
 * Reads CHANGELOG.md from the project root and renders it on the /changelog page.
 * Content is loaded at build time; redeploy to show new releases.
 */
export default function ChangelogPage() {
  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md')
  const raw = fs.readFileSync(changelogPath, 'utf-8')

  // * The page hero renders its own "Changelog" title — drop the markdown H1
  // * (and its intro paragraph lives in the hero copy too) to avoid the
  // * duplicate heading.
  // * Dates: headings use ISO `- YYYY-MM-DD`; display is DD/MM/YYYY app-wide.
  const content = raw
    .replace(/^# Changelog\s*\n/, '')
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3/$2/$1')

  // * Keep-a-changelog link definitions sit at the file tail; every rendered
  // * chunk needs them appended or its `[0.x.y]` reference links go dead.
  const linkDefs = (content.match(/^\[[^\]]+\]:\s+\S+$/gm) ?? []).join('\n')
  const body = content.replace(/^\[[^\]]+\]:\s+\S+$/gm, '').trimEnd()

  // * Split on version headings; index 0 is the preamble before the first `## `.
  const [preamble, ...sections] = body.split(/\n(?=## )/)
  const recent = sections.slice(0, EXPANDED_SECTIONS)
  const older = sections.slice(EXPANDED_SECTIONS)

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-2">
        Changelog
      </h1>
      <p className="text-neutral-400 mb-8 text-sm">
        Release history and notable changes. We use{' '}
        <a
          href="https://keepachangelog.com/en/1.1.0/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-orange hover:underline"
        >
          Keep a Changelog
        </a>{' '}
        and <strong>0.x.y</strong> versioning while in initial development.
      </p>
      <article className={PROSE_CLASSES}>
        <ReactMarkdown>{[preamble, ...recent, linkDefs].join('\n')}</ReactMarkdown>
      </article>
      {older.length > 0 && (
        <details className="mt-10 border-t border-neutral-800 pt-6">
          <summary className="cursor-pointer list-none text-sm font-medium text-neutral-400 hover:text-white transition-colors ease-apple [&::-webkit-details-marker]:hidden">
            Show {older.length} older release{older.length === 1 ? '' : 's'} ↓
          </summary>
          <article className={`${PROSE_CLASSES} mt-6`}>
            <ReactMarkdown>{[...older, linkDefs].join('\n')}</ReactMarkdown>
          </article>
        </details>
      )}
    </div>
  )
}
