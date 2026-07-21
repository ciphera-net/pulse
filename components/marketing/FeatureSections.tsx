'use client'

import { ArrowUpRightIcon, CheckIcon } from '@ciphera-net/facet'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { PulseMockup } from './mockups/pulse-mockup'
import { PulseFeaturesCarousel } from './mockups/pulse-features-carousel'
import { FunnelMockup } from './mockups/funnel-mockup'
import { EmailReportMockup } from './mockups/email-report-mockup'

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
    mockup: <PulseMockup />,
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
    mockup: <PulseFeaturesCarousel />,
    reverse: true,
  },
  {
    id: 'funnels',
    label: 'Funnels',
    heading: 'See where visitors drop off.',
    description:
      'Build custom conversion funnels to understand your user journey. Identify bottlenecks and optimize your conversion flow.',
    features: [
      'Multi-step funnels with conversion rates',
      'Drop-off analysis between each step',
      'Conversion trends over time',
      'Breakdown by device, country, or referrer',
      'Configurable conversion window (up to 90 days)',
    ],
    mockup: <FunnelMockup />,
  },
  {
    id: 'reports',
    label: 'Reports',
    heading: 'Reports delivered to your inbox.',
    description:
      "Get automated summaries of your site's performance without logging into a dashboard. Stay informed effortlessly.",
    features: [
      'Daily, weekly, or monthly email summaries',
      'Key metrics with period-over-period comparison',
      'Top pages, referrers, and country breakdown',
      'Webhook delivery for custom integrations',
      'Multiple recipients per report',
    ],
    mockup: <EmailReportMockup />,
    reverse: true,
  },
  {
    id: 'script',
    label: 'Script',
    heading: "One script tag. That's it.",
    description:
      'No npm packages, no build steps, no configuration files. Add a single line to your HTML and start collecting privacy-respecting analytics instantly.',
    features: [
      'Under 2KB gzipped — 20x smaller than Google Analytics',
      'Async loading with defer — never blocks rendering',
      'Works with any framework or static site',
    ],
    proof: { label: 'Installation guide', href: '/installation' },
    mockup: <ScriptMockup />,
  },
]

// Static code block with editor chrome — token-based, no framer, sharp corners.
function ScriptMockup() {
  return (
    <div className="w-full border border-border bg-card" aria-hidden="true">
      <div className="flex items-center border-b border-border px-4 py-3">
        <div className="flex gap-2">
          <div className="h-3 w-3 bg-muted" />
          <div className="h-3 w-3 bg-muted" />
          <div className="h-3 w-3 bg-muted" />
        </div>
        <span className="ml-4 font-mono text-xs text-muted-foreground">index.html</span>
      </div>
      <pre className="overflow-x-auto p-6">
        <code className="font-mono text-sm text-muted-foreground">
          <span className="text-muted-foreground">{'<!-- Add before </head> -->'}</span>{'\n'}
          <span className="text-foreground">{'<script'}</span>{'\n'}
          {'  '}<span className="text-primary">defer</span>{'\n'}
          {'  '}<span className="text-primary">data-domain</span>
          <span className="text-foreground">=</span>
          <span className="text-foreground">&quot;yoursite.com&quot;</span>{'\n'}
          {'  '}<span className="text-primary">src</span>
          <span className="text-foreground">=</span>
          <span className="text-foreground">&quot;https://pulse.ciphera.net/js/script.js&quot;</span>{'\n'}
          <span className="text-foreground">{'></script>'}</span>
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
          <h3 className="mt-4 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
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
