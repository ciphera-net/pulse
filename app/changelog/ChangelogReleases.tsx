'use client'

/**
 * @file Client accordion for the changelog release archive (design §5.8).
 *
 * Each release is a bordered section block — mono version + date, `font-display`
 * heading — with the body on the grid-rows accordion (`gridTemplateRows`
 * `0fr`→`1fr`, `motion-reduce:transition-none`). The newest release (and
 * "Unreleased" when present) start expanded; every older release starts
 * collapsed to its heading and expands on click.
 *
 * Deep links: each release keeps a STABLE id derived from its version token
 * (e.g. `0.15.0-alpha` → `#release-0-15-0-alpha`, `Unreleased` → `#release-unreleased`).
 * On mount — and on subsequent hashchange — a collapsed release whose id matches
 * the URL hash auto-expands and scrolls into view, so a shared anchor always
 * lands on open content.
 *
 * Content stays markdown-sourced: the server parses CHANGELOG.md into per-release
 * chunks and hands the body markdown down; only the frame is rebuilt here.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { PlusIcon } from '@ciphera-net/facet'

export interface Release {
  /** Stable anchor id, e.g. `release-0-15-0-alpha`. */
  id: string
  /** Display version token, e.g. `0.15.0-alpha` or `Unreleased`. */
  version: string
  /** Date label (already formatted DD/MM/YYYY, or free-text as authored). */
  date: string | null
  /** Whether this release starts expanded (newest + Unreleased). */
  expanded: boolean
  /** The release body as markdown (categories + list items), link defs appended. */
  body: string
}

// * Prose recipe for a release body: mono micro-labels for the ### category
// * headings (Added / Improved / Fixed …), orange only on links, tokens throughout.
const PROSE_CLASSES = `prose prose-invert max-w-none
  prose-headings:font-mono prose-headings:text-xs prose-headings:font-normal
  prose-headings:uppercase prose-headings:tracking-[0.08em]
  prose-headings:text-muted-foreground prose-headings:mt-6 prose-headings:mb-3
  prose-p:text-muted-foreground prose-li:text-muted-foreground
  prose-strong:text-foreground
  prose-a:text-primary prose-a:no-underline hover:prose-a:underline
  prose-ul:my-3 prose-li:my-1`

function ReleaseBlock({ release }: { release: Release }) {
  const [open, setOpen] = useState(release.expanded)
  const ref = useRef<HTMLDivElement>(null)

  // Deep-link: if the URL hash targets this release, force it open and scroll to
  // it. Runs on mount and whenever the hash changes.
  useEffect(() => {
    function syncFromHash() {
      if (typeof window === 'undefined') return
      const hash = window.location.hash.replace(/^#/, '')
      if (hash && hash === release.id) {
        setOpen(true)
        ref.current?.scrollIntoView({ block: 'start' })
      }
    }
    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [release.id])

  const bodyId = `${release.id}-body`

  return (
    <section ref={ref} id={release.id} className="scroll-mt-24 border-b border-border last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-5 py-6 text-left transition-colors duration-150 hover:bg-accent motion-reduce:transition-none"
      >
        <div className="flex-1">
          <p className="font-mono text-xs text-muted-foreground">
            {release.version}
            {release.date && <> · {release.date}</>}
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {release.version}
          </h2>
        </div>
        <PlusIcon
          aria-hidden="true"
          className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none"
          style={{ transform: open ? 'rotate(45deg)' : 'rotate(0deg)' }}
        />
      </button>

      <div
        id={bodyId}
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <article className={`${PROSE_CLASSES} pb-8`}>
            <ReactMarkdown>{release.body}</ReactMarkdown>
          </article>
        </div>
      </div>
    </section>
  )
}

export function ChangelogReleases({ releases }: { releases: Release[] }) {
  // Stable render — the list is fixed at build time; memo avoids re-keying churn.
  const blocks = useMemo(
    () => releases.map((r) => <ReleaseBlock key={r.id} release={r} />),
    [releases],
  )
  return <div className="mt-12 border-t border-border">{blocks}</div>
}
