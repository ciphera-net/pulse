'use client'

import { ArrowUpRightIcon, CheckIcon } from '@ciphera-net/facet'
import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { cdnUrl } from '@/lib/cdn'
import { MacWindow } from './system/MacWindow'
import { VisitorsSlideshow } from './mockups/visitors-slideshow'
import { CaptureSlideshow } from './mockups/capture-slideshow'

// Real retina captures of the LIVE ciphera.net dashboard (the public /demo
// share) — the same surface the hero shows. Fake hand-drawn dashboards are
// banned on this page: they contradicted the real capture one scroll above and
// told negative data stories (see the 05-08-2026 homepage audit). Recapture
// recipe: crop the share view at deviceScaleFactor 2 and upload via
// scripts/cdn-upload.sh; keep filenames dated so the edge cache never staling.
// Journeys — the same real card in its two real views (Columns and the Flow
// sankey), switching in the same slideshow device as the Visitors row.
function JourneysSlideshow() {
  return (
    <CaptureSlideshow
      width={2112}
      height={1184}
      alt="Pulse journeys for ciphera.net, live data"
      slides={[
        { key: 'columns', label: 'Columns', file: '/marketing/journeys-columns-sep-2x.png' },
        { key: 'flow', label: 'Flow', file: '/marketing/journeys-flow-sep-2x.png' },
      ]}
    />
  )
}

function PerformanceCapture() {
  return (
    <MacWindow>
      <Image
        src={cdnUrl('/marketing/performance-desktop-sep-2x.png')}
        alt="Pulse Performance for ciphera.net — desktop Lighthouse scores, page-load filmstrip and Core Web Vitals"
        width={2468}
        height={1586}
        unoptimized
        className="block w-full"
      />
    </MacWindow>
  )
}

function DashboardCapture() {
  // 7-day period, deep crop (tiles → chart → pages/referrers): taller than the
  // hero's 30-day capture and a different data window, so the two don't repeat.
  return (
    <MacWindow>
      <Image
        src={cdnUrl('/marketing/feature-dashboard-7d-sep-2x.png')}
        alt="The live Pulse dashboard for ciphera.net — a 7-day view of the visitor trend, top pages and referrers"
        width={2244}
        height={1652}
        unoptimized
        className="block w-full"
      />
    </MacWindow>
  )
}


interface FeatureRow {
  id: string
  label: string
  heading: string
  description: string
  features: string[]
  mockup: React.ReactNode
  proof?: { label: string; href: string }
  reverse?: boolean
}

// The five product stories. Each renders as a two-column row that alternates
// text/visual side by side (mono micro-label → display h3 → body → checklist),
// keeping the existing copy verbatim.
const ROWS: FeatureRow[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    heading: 'Your traffic, at a glance.',
    description:
      "Get a clear, real-time overview of your website's performance without the clutter of traditional analytics tools.",
    features: [
      'Live visitor count with real-time updates',
      'Hourly, daily, weekly, and monthly trends',
      'Referrer sources and UTM campaign tracking',
      'Country-level geographic breakdown',
    ],
    mockup: <DashboardCapture />,
  },
  {
    id: 'visitors',
    label: 'Visitors',
    heading: 'Everything you need to know about your visitors.',
    description:
      'Understand where your traffic comes from, what content resonates, and how visitors interact with your site — all without compromising their privacy.',
    features: [
      'Top pages ranked by views and unique visitors',
      'Referrer breakdown with source attribution',
      'Browser, OS, and device analytics',
      'Peak hours heatmap for optimal publishing',
    ],
    mockup: <VisitorsSlideshow />,
    reverse: true,
  },
  {
    id: 'journeys',
    label: 'Journeys',
    heading: 'See the paths visitors take.',
    description:
      'Follow real navigation flows step by step — where visitors enter, where they go next, and where they leave.',
    features: [
      'Step-by-step path columns from any entry point',
      'Drop-off between every step',
      'Filter by page, country, device, or referrer',
      'Configurable depth and path count',
      'Column and flow views',
    ],
    mockup: <JourneysSlideshow />,
  },
  {
    id: 'pagespeed',
    label: 'Performance',
    heading: 'Performance monitoring built in.',
    description:
      'Lighthouse scores and Core Web Vitals for your site, tracked daily — no separate tooling, no extra tab.',
    features: [
      'Daily Lighthouse checks, mobile and desktop',
      'Performance, accessibility, best-practices and SEO scores',
      'Core Web Vitals — LCP, CLS, TBT and more',
      'Page-load filmstrip timeline',
      'Score trend over time',
    ],
    mockup: <PerformanceCapture />,
    reverse: true,
  },
  {
    id: 'script',
    label: 'Script',
    heading: "One script tag. That's it.",
    description:
      'No npm packages, no build steps, no configuration files. Add a single line to your HTML and start collecting privacy-respecting analytics instantly.',
    features: [
      '2.6 KB gzipped — 55× lighter than Google Analytics',
      'Async loading with defer — never blocks rendering',
      'Works with any framework or static site',
    ],
    proof: { label: 'Installation guide', href: '/installation' },
    mockup: <ScriptMockup />,
  },
]

// The install snippet in the estate's plain code-block grammar — filename bar,
// quiet line numbers, brand-orange for attribute names and nothing else. No
// invented editor chrome (tabs, copy chips, status cells): restraint IS the
// quality here. The URL is the canonical loader (js.ciphera.net; the /js/
// variant 307s) and the size is measured, not claimed. This number has been
// wrong three times: the block once said 1.6 KB while the script shipped 5.2
// (curl, 06-08-2026), then 5 KB while it shipped 7.5 (04-09-2026). Since
// 05-09-2026 the deploy ships the MINIFIED build and CI fails over 3 KB
// gzipped, so the ceiling is enforced rather than asserted.
const SCRIPT_LINES: [string, React.ReactNode][] = [
  ['1', <span key="1" className="text-neutral-500">{'<!-- Add before </head> -->'}</span>],
  ['2', <span key="2" className="text-foreground">{'<script'}</span>],
  ['3', <span key="3">{'  '}<span className="text-primary">defer</span></span>],
  [
    '4',
    <span key="4">
      {'  '}
      <span className="text-primary">data-domain</span>
      <span className="text-foreground">=&quot;yoursite.com&quot;</span>
    </span>,
  ],
  [
    '5',
    <span key="5">
      {'  '}
      <span className="text-primary">src</span>
      <span className="text-foreground">=&quot;https://js.ciphera.net/script.js&quot;</span>
    </span>,
  ],
  ['6', <span key="6" className="text-foreground">{'></script>'}</span>],
]

function ScriptMockup() {
  return (
    <div className="w-full" aria-hidden="true">
      <MacWindow>
        <div className="bg-card">
          <div className="flex items-center border-b border-border px-4 py-2.5">
            <span className="font-mono text-xs text-muted-foreground">index.html</span>
          </div>

          <pre className="overflow-x-auto py-5 pr-6 whitespace-pre-wrap [overflow-wrap:anywhere] md:whitespace-pre md:[overflow-wrap:normal]">
            <code className="font-mono text-sm leading-7">
              {SCRIPT_LINES.map(([no, content]) => (
                <span key={no} className="flex">
                  <span className="w-12 shrink-0 select-none pr-4 text-right text-xs leading-7 tabular-nums text-neutral-600">
                    {no}
                  </span>
                  <span className="whitespace-pre">{content}</span>
                </span>
              ))}
            </code>
          </pre>

          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 bg-green-500" />
              Script detected on ciphera.net
            </span>
            <span className="tabular-nums">2.6 KB gzipped</span>
          </div>
        </div>
      </MacWindow>
    </div>
  )
}

function FeatureRowBlock({ id, label, heading, description, features, mockup, proof, reverse }: FeatureRow) {
  return (
    <div id={id} className="scroll-mt-28">
      {/* min-w-0 on both columns — otherwise the code <pre>'s intrinsic width
          wins over the viewport and the page scrolls sideways on mobile. */}
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16 [&>*]:min-w-0">
        {/* Text side */}
        <div className={cn(reverse && 'lg:order-last')}>
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </p>
          <h3 className="mt-4 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {heading}
          </h3>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            {description}
          </p>
          <ul className="mt-6 space-y-3">
            {features.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-relaxed text-foreground/90">
                <CheckIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          {proof && (
            <Link
              href={proof.href}
              className="mt-6 inline-flex items-center gap-1 text-xs text-primary transition-colors duration-150 hover:text-primary/80 motion-reduce:transition-none"
            >
              {proof.label}
              <ArrowUpRightIcon aria-hidden="true" className="h-3 w-3" />
            </Link>
          )}
        </div>

        {/* Visual side */}
        <div className={cn('flex items-center justify-center', reverse && 'lg:order-first')}>
          {mockup}
        </div>
      </div>
    </div>
  )
}

export default function FeatureSections() {
  return (
    <div className="space-y-20 sm:space-y-24">
      {ROWS.map((row) => (
        <FeatureRowBlock key={row.id} {...row} />
      ))}
    </div>
  )
}
