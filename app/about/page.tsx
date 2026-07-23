'use client'

/**
 * @file About / "Why Pulse?" page.
 *
 * Lightest-touch rebuild onto the marketing section grammar: numbered slabs on
 * the shared rail, comparison tables restyled onto hairline/token treatment
 * (sentiment cell colours kept exactly — green = win, red = loss, neutral =
 * plain), the Plausible callout kept verbatim as a bordered aside. No framer,
 * no scroll-gating: everything is visible at first paint. Tokens only.
 */

import { CheckCircleIcon, XIcon } from '@ciphera-net/facet'
import { MarketingSection } from '@/components/marketing/system/MarketingSection'

// Boolean cells render ✓/✗ and assume true = good. Where the raw boolean would
// invert sentiment (e.g. "Cookie Banner Required" — false is the win), use
// { text, good } so the colour follows the meaning, not the boolean.
type FeatureValue = boolean | string | { text: string; good: boolean }

interface Competitor {
  name: string
  isPulse: boolean
  features: Record<string, FeatureValue>
}

const FEATURE_ROWS = [
  'Cookie Banner Required',
  'GDPR Compliant',
  'Script Size',
  'Data Ownership',
  'User Privacy',
  'UI Simplicity',
] as const

function ComparisonTable({ title, competitors }: { title: string; competitors: Competitor[] }) {
  return (
    <div>
      <h3 className="mb-5 text-lg font-semibold text-foreground">{title}</h3>
      <div className="overflow-x-auto border border-border bg-card">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="p-4 text-xs uppercase tracking-[0.08em] text-muted-foreground sm:p-6">
                Feature
              </th>
              {competitors.map((comp) => (
                <th
                  key={comp.name}
                  className={`p-4 text-sm font-semibold sm:p-6 ${
                    comp.isPulse ? 'text-primary' : 'text-foreground'
                  }`}
                >
                  {comp.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURE_ROWS.map((feature) => (
              <tr
                key={feature}
                className="border-b border-border last:border-b-0 transition-colors duration-150 hover:bg-accent motion-reduce:transition-none"
              >
                <td className="p-4 text-sm font-medium text-foreground sm:p-6">{feature}</td>
                {competitors.map((comp) => {
                  const val = comp.features[feature]
                  return (
                    <td key={comp.name} className="p-4 text-sm sm:p-6">
                      {typeof val === 'object' ? (
                        <span className={`font-medium ${val.good ? 'text-green-500' : 'text-red-500'}`}>
                          {val.text}
                        </span>
                      ) : val === true ? (
                        <CheckCircleIcon aria-hidden="true" className="h-5 w-5 text-green-500" />
                      ) : val === false ? (
                        <XIcon aria-hidden="true" className="h-5 w-5 text-red-500" />
                      ) : (
                        <span className={comp.isPulse ? 'font-medium text-green-500' : 'text-muted-foreground'}>
                          {val}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const PULSE_FEATURES: Record<string, FeatureValue> = {
  'Cookie Banner Required': { text: 'None', good: true },
  'GDPR Compliant': true,
  'Script Size': '< 1 KB',
  'Data Ownership': 'Yours',
  'User Privacy': '100% Anonymous',
  'UI Simplicity': 'Simple',
}

export default function AboutPage() {
  return (
    <>
      {/* ── HERO ── */}
      <MarketingSection>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Pulse · Why Pulse</p>
          <h1 className="mx-auto mt-6 max-w-2xl font-display text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
            Why Pulse?
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            We built Pulse because we were tired of complex, invasive analytics tools. Here is
            how we stack up against the giants.
          </p>
        </div>
      </MarketingSection>

      {/* ── 01 · COMPARED ── */}
      <MarketingSection
        eyebrowNumber="01"
        eyebrowLabel="Compared"
        heading="How we stack up."
        dek="The same privacy-first stance, laid out feature by feature against the tools you already know."
      >
        <div className="mt-12 flex flex-col gap-12">
          <ComparisonTable
            title="Pulse vs. Google Analytics"
            competitors={[
              { name: 'Pulse', isPulse: true, features: PULSE_FEATURES },
              {
                name: 'Google Analytics 4',
                isPulse: false,
                features: {
                  'Cookie Banner Required': { text: 'Required', good: false },
                  'GDPR Compliant': 'Complex',
                  'Script Size': '45 KB+',
                  'Data Ownership': "Google's",
                  'User Privacy': 'Invasive',
                  'UI Simplicity': 'Complex',
                },
              },
            ]}
          />
          <ComparisonTable
            title="Pulse vs. Plausible"
            competitors={[
              { name: 'Pulse', isPulse: true, features: PULSE_FEATURES },
              {
                name: 'Plausible',
                isPulse: false,
                features: {
                  'Cookie Banner Required': { text: 'None', good: true },
                  'GDPR Compliant': true,
                  'Script Size': '< 1 KB',
                  'Data Ownership': 'Yours',
                  'User Privacy': '100% Anonymous',
                  'UI Simplicity': 'Simple',
                },
              },
            ]}
          />
        </div>
      </MarketingSection>

      {/* ── 02 · PHILOSOPHY ── */}
      <MarketingSection
        eyebrowNumber="02"
        eyebrowLabel="Philosophy"
        heading="Only the metrics that matter."
      >
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Most analytics tools are overkill. They track everything, slow down your site, and
          require annoying cookie banners. Pulse is different. We focus on the metrics that
          actually matter — visitors, pageviews, and sources — while respecting user privacy.
        </p>

        {/* Plausible callout — kept verbatim, framed as a bordered aside */}
        <aside className="mt-10 max-w-2xl border border-border bg-card p-6">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
            On Plausible
          </p>
          <p className="mt-4 text-sm font-semibold text-foreground">What about Plausible?</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            We love Plausible! They paved the way for privacy-friendly analytics. Pulse offers a
            similar philosophy but with a focus on even deeper integration with the Ciphera
            ecosystem and more flexible pricing for developers.
          </p>
        </aside>
      </MarketingSection>
    </>
  )
}
