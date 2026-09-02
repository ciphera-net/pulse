import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRightIcon } from '@ciphera-net/facet'
import { MacWindow } from '@/components/marketing/system/MacWindow'
import { HomeClosingCta } from '@/components/marketing/HomeClosingCta'
import { OpenSourceApplyForm } from '@/components/marketing/OpenSourceApplyForm'
import OpenSourceFAQ from '@/components/marketing/OpenSourceFAQ'
import { cdnUrl } from '@/lib/cdn'

// /open-source — the open-source plan (design approved 02-09-2026, round 8;
// docs/plans/02-09-2026-opensource-plan-design.md §4a). Anonymous on-page
// application by owner ruling; submissions land in Warden's review queue.
// The hero speaks the homepage's own sentence with the hand-drawn underline;
// the artifact is a REAL capture of a granted workspace's billing page
// (house rule: captures of the live product only, dated filename on the CDN).

const description =
  'Open-source projects and registered nonprofits run Pulse free — a real tier at €0 with five sites, 100k pageviews a month and every feature. In return, we get to say you use Pulse.'

export const metadata: Metadata = {
  title: 'The open-source plan',
  description,
  alternates: {
    canonical: '/open-source',
  },
  openGraph: {
    title: 'Analytics without the invoice',
    description,
    siteName: 'Pulse by Ciphera',
  },
}

const TERMS: { value: string; unit: string; label: string }[] = [
  { value: '€0', unit: '/mo', label: 'The price, permanently' },
  { value: '5', unit: 'sites', label: 'Docs, main site, three more' },
  { value: '100k', unit: 'pv/mo', label: 'Raisable per grant' },
  { value: '2', unit: 'years', label: 'Data retention' },
]


export default function OpenSourcePage() {
  return (
    <>
      {/* ── Hero — the homepage grammar: glyph-ember floor, hero-scale H1
          with the hand-drawn underline, CTAs, then the REAL billing page of
          a granted workspace docked and cropped at the fold (the full state
          is one application away). ── */}
      <section className="relative overflow-hidden border-b border-border">
        <Image
          src="https://cdn.ciphera.net/website/hero-glyph-ember.jpg"
          alt=""
          aria-hidden="true"
          fill
          priority
          unoptimized
          sizes="100vw"
          className="object-cover object-bottom opacity-40 [mask-image:radial-gradient(85%_65%_at_50%_100%,#000_25%,transparent_78%)]"
        />
        <div className="relative mx-auto max-w-5xl px-6 pt-20 text-center sm:pt-28">
          <h1 className="font-display text-[2.5rem] font-bold leading-[0.95] tracking-tight text-foreground sm:text-7xl lg:text-[5.5rem]">
            Analytics without
            <span className="block">
              the{' '}
              <span className="relative inline-block">
                invoice.
                <svg
                  aria-hidden="true"
                  className="absolute -bottom-2 left-0 h-3 w-full text-primary"
                  viewBox="0 0 200 12"
                  preserveAspectRatio="none"
                >
                  <path d="M0 9C50 3 150 3 200 9" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>
            </span>
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
            A real tier at €0 for OSI-licensed projects and registered
            nonprofits. In return, we get to say you use Pulse.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#apply"
              className="inline-flex items-center gap-2 rounded-none bg-brand-orange px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-orange/90 motion-reduce:transition-none"
            >
              Apply now
              <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
            </a>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2.5 rounded-none border border-border bg-card px-4 py-2.5 text-sm text-foreground transition-colors duration-150 ease-apple hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
            >
              How it compares
            </Link>
          </div>
        </div>
        <div className="relative mx-auto mt-14 w-full max-w-5xl px-6 sm:mt-16">
          <div className="max-h-[440px] overflow-hidden">
            <MacWindow docked>
              <Image
                src={cdnUrl('/marketing/opensource-billing-02-09-2026-2x.png')}
                alt="The Pulse billing page on the Open Source plan — active, €0 a month, nothing billed"
                width={2560}
                height={1520}
                unoptimized
                className="block w-full"
              />
            </MacWindow>
          </div>
        </div>
      </section>

      {/* ── The terms — a flat hairline ticker strip on the page ground
          (owner ruling: no card tiles). ── */}
      <section className="border-b border-border">
        <div className="px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="grid grid-cols-1 border-y border-border sm:grid-cols-2 lg:grid-cols-4">
              {TERMS.map((t, i) => (
                <div
                  key={t.label}
                  className={`${i > 0 ? 'sm:border-l sm:border-border ' : ''}px-6 py-6`}
                >
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-4xl font-semibold tabular-nums text-foreground">
                      {t.value}
                    </span>
                    <span className="text-sm text-muted-foreground">{t.unit}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Every feature on — funnels, journeys, uptime, performance, the
              API. No plan gates any.
            </p>
          </div>
        </div>
      </section>

      {/* ── 01 · FAQ — the shared category-rail pattern. ── */}
      <section className="border-b border-border">
        <div className="px-6 py-16 sm:py-20">
          <p className="text-xs text-muted-foreground">01 · FAQ</p>
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Questions, answered.
          </h2>
          <OpenSourceFAQ />
        </div>
      </section>

      {/* ── 02 · Apply — pitch left, the anonymous form right. ── */}
      <section className="border-b border-border" id="apply">
        <div className="px-6 py-16 sm:py-20">
          <div className="mx-auto grid max-w-5xl grid-cols-1 items-start gap-x-8 gap-y-1 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">02 · Apply</p>
              <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Two doors, and a third for edge cases.
              </h2>
              <ul className="mt-8 flex flex-col gap-3">
                {[
                  'Open-source projects under an OSI-approved license, with real users beyond the maintainer.',
                  'Registered nonprofits and NGOs — any country, any cause.',
                  'Something in between? Apply anyway. A human reads every application.',
                ].map((text) => (
                  <li key={text} className="flex items-start gap-2.5">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500"
                    />
                    <span className="text-sm text-foreground">{text}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 space-y-5 text-base leading-relaxed text-muted-foreground">
                <p>
                  Approval lands the plan on your workspace — sign up on the
                  free tier whenever you like, before or after applying. We
                  answer within a few days, and prefer email that comes from
                  your project&rsquo;s domain.
                </p>
              </div>
            </div>
            <div className="mt-8 sm:mt-0">
              <OpenSourceApplyForm />
              <p className="mt-4 text-xs text-muted-foreground">
                Rather write it yourself? hello@ciphera.net works too.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Closer — shared ember device (no border-b: footer's border-t owns the seam) */}
      <section>
        <HomeClosingCta eyebrow="Get started" secondaryHref="/demo" secondaryLabel="View live demo" />
      </section>
    </>
  )
}
