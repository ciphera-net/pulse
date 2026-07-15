'use client'

/**
 * @file Installation guide.
 *
 * Docs-minimal shape kept (design §5.6): the H1 stays, all copy and snippets
 * unchanged. Rebuilt onto the marketing grammar — a mono eyebrow above the H1,
 * mono step labels per section (`01 · Add the snippet`, `02 · Custom events`),
 * and code blocks that keep the editor chrome but on `bg-card border
 * border-border` with mono filename tabs. Syntax-highlight colours map to tokens
 * (`text-primary` for attributes/identifiers per the T2 ScriptMockup, otherwise
 * `text-foreground` / `text-muted-foreground`).
 *
 * Traffic-light dots: rendered as `h-3 w-3 bg-muted` SQUARES, matching the T2
 * ScriptMockup precedent (`FeatureSections.tsx` ScriptMockup) so the two editor
 * chromes read identically. No framer; tokens only.
 */

import React from 'react'
import { MarketingSection } from '@/components/marketing/system/MarketingSection'

// Editor-chrome traffic dots as squares — the T2 ScriptMockup precedent.
function EditorDots() {
  return (
    <div className="flex gap-2">
      <div className="h-3 w-3 bg-muted" />
      <div className="h-3 w-3 bg-muted" />
      <div className="h-3 w-3 bg-muted" />
    </div>
  )
}

export default function InstallationPage() {
  return (
    <>
      {/* ── HERO ── */}
      <MarketingSection>
        <div className="max-w-2xl">
          <p className="font-mono text-xs text-muted-foreground">Pulse · Docs</p>
          <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
            Installation
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg">
            Get up and running with Pulse in seconds.
          </p>
        </div>
      </MarketingSection>

      {/* ── 01 · ADD THE SNIPPET ── */}
      <MarketingSection
        eyebrowNumber="01"
        eyebrowLabel="Add the snippet"
        heading="Add the snippet"
        dek="Just add this snippet to your <head> tag in your layout or index file."
      >
        <div className="mt-10 max-w-2xl border border-border bg-card">
          <div className="flex items-center border-b border-border px-4 py-3">
            <EditorDots />
            <span className="ml-4 font-mono text-xs text-muted-foreground">
              layout.tsx / index.html
            </span>
          </div>
          <pre className="overflow-x-auto p-6">
            <code className="font-mono text-sm text-muted-foreground">
              <span className="text-foreground">&lt;script</span>{' '}
              <span className="text-primary">defer</span>{' '}
              <span className="text-primary">data-domain</span>
              <span className="text-foreground">=</span>
              <span className="text-foreground">&quot;your-site.com&quot;</span>{' '}
              <span className="text-primary">src</span>
              <span className="text-foreground">=</span>
              <span className="text-foreground">&quot;https://pulse.ciphera.net/script.js&quot;</span>
              <span className="text-foreground">&gt;&lt;/script&gt;</span>
            </code>
          </pre>
          <div className="flex items-center gap-4 border-t border-border px-6 py-3 text-xs text-muted-foreground">
            <span>1.6 KB gzipped</span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 bg-green-500" />
              Non-blocking, async
            </span>
          </div>
        </div>
      </MarketingSection>

      {/* ── 02 · CUSTOM EVENTS ── */}
      <MarketingSection
        eyebrowNumber="02"
        eyebrowLabel="Custom events"
        heading="Custom events (goals)"
      >
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
          Track custom events (e.g. signup, purchase) with{' '}
          <code className="bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">
            pulse.track(&apos;event_name&apos;)
          </code>
          . Use letters, numbers, and underscores only. Define goals in your site Settings →
          Goals to see counts in the dashboard.
        </p>

        <div className="mt-8 max-w-2xl border border-border bg-card">
          <div className="flex items-center border-b border-border px-4 py-3">
            <EditorDots />
            <span className="ml-4 font-mono text-xs text-muted-foreground">
              e.g. button click handler
            </span>
          </div>
          <pre className="overflow-x-auto p-6">
            <code className="font-mono text-sm text-muted-foreground">
              <span className="text-primary">pulse</span>
              <span className="text-foreground">.</span>
              <span className="text-foreground">track</span>
              <span className="text-foreground">(</span>
              <span className="text-foreground">&apos;signup_click&apos;</span>
              <span className="text-foreground">);</span>
            </code>
          </pre>
        </div>
      </MarketingSection>
    </>
  )
}
