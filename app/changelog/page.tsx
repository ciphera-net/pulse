import fs from 'fs'
import path from 'path'
import ReactMarkdown from 'react-markdown'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Changelog - Pulse',
  description: 'Release history and notable changes for Pulse, privacy-first web analytics.',
}

/**
 * Reads CHANGELOG.md from the project root and renders it on the /changelog page.
 * Content is loaded at build time; redeploy to show new releases.
 */
export default function ChangelogPage() {
  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md')
  const content = fs.readFileSync(changelogPath, 'utf-8')

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 dark:text-white mb-2">
        Changelog
      </h1>
      <p className="text-neutral-600 dark:text-neutral-400 mb-8 text-sm">
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
      <article
        className="prose prose-neutral dark:prose-invert max-w-none
          prose-headings:font-semibold prose-headings:tracking-tight
          prose-a:text-brand-orange prose-a:no-underline hover:prose-a:underline
          prose-ul:my-4 prose-li:my-0.5"
      >
        <ReactMarkdown>{content}</ReactMarkdown>
      </article>
    </div>
  )
}
