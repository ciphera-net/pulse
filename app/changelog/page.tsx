import fs from 'fs'
import path from 'path'
import ReactMarkdown from 'react-markdown'
import type { Metadata } from 'next'
import { MarketingSection } from '@/components/marketing/system/MarketingSection'
import { ChangelogReleases, type Release } from './ChangelogReleases'

export const metadata: Metadata = {
  title: 'Changelog - Pulse',
  description: 'Release history and notable changes for Pulse, privacy-first web analytics.',
}

// * How many release sections (incl. Unreleased) render expanded; every other
// * version collapses to its heading so the page stays a few screens tall.
const EXPANDED_SECTIONS = 2

// Preamble prose (the intro paragraph above the first release) — muted body,
// orange only on links.
const PREAMBLE_PROSE = `prose prose-invert max-w-none
  prose-p:text-muted-foreground prose-p:leading-relaxed
  prose-strong:text-foreground
  prose-a:text-primary prose-a:no-underline hover:prose-a:underline`

// * A stable anchor id from a version token: `0.15.0-alpha` → `release-0-15-0-alpha`,
// * `Unreleased` → `release-unreleased`. There was no prior id scheme on this page
// * (plain ReactMarkdown, no rehype-slug), so deep links were previously dead —
// * this is the introduced scheme, recorded in the batch notes.
function releaseId(version: string): string {
  const slug = version
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `release-${slug}`
}

// * Parse `## [Unreleased]` or `## [0.15.0-alpha] - 2026-03-13` into version + date.
function parseHeading(line: string): { version: string; date: string | null } {
  const stripped = line.replace(/^##\s+/, '').trim()
  // `[version] - date` or `[version]`
  const match = stripped.match(/^\[([^\]]+)\](?:\s*-\s*(.+))?$/)
  if (match) {
    return { version: match[1].trim(), date: match[2]?.trim() ?? null }
  }
  return { version: stripped.replace(/[[\]]/g, ''), date: null }
}

/**
 * Reads CHANGELOG.md from the project root and renders it on the /changelog page.
 * Content is loaded at build time; redeploy to show new releases.
 */
export default function ChangelogPage() {
  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md')
  const raw = fs.readFileSync(changelogPath, 'utf-8')

  // * Drop the markdown H1 (the page renders its own <h1>); convert ISO dates
  // * `YYYY-MM-DD` → app-wide DD/MM/YYYY.
  const content = raw
    .replace(/^# Changelog\s*\n/, '')
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3/$2/$1')

  // * Keep-a-changelog link definitions sit at the file tail; each rendered
  // * chunk needs them appended or its `[0.x.y]` reference links go dead.
  const linkDefs = (content.match(/^\[[^\]]+\]:\s+\S+$/gm) ?? []).join('\n')
  const bodyText = content.replace(/^\[[^\]]+\]:\s+\S+$/gm, '').trimEnd()

  // * Split on version headings; index 0 is the preamble before the first `## `.
  const [preamble, ...sections] = bodyText.split(/\n(?=## )/)

  const releases: Release[] = sections.map((section, i) => {
    const newline = section.indexOf('\n')
    const headingLine = newline === -1 ? section : section.slice(0, newline)
    const body = newline === -1 ? '' : section.slice(newline + 1)
    const { version, date } = parseHeading(headingLine)
    return {
      id: releaseId(version),
      version,
      date,
      expanded: i < EXPANDED_SECTIONS,
      // Link defs appended so reference-style `[x.y.z]` links resolve.
      body: [body.trim(), linkDefs].filter(Boolean).join('\n\n'),
    }
  })

  return (
    <MarketingSection>
      <div className="max-w-2xl">
        <p className="text-xs text-muted-foreground">Pulse · Changelog</p>
        <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
          Changelog
        </h1>
        <div className={`${PREAMBLE_PROSE} mt-6`}>
          <ReactMarkdown>{preamble.trim()}</ReactMarkdown>
        </div>
      </div>

      <ChangelogReleases releases={releases} />
    </MarketingSection>
  )
}
