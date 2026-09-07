import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRightIcon } from '@ciphera-net/facet'
import { HomeClosingCta } from '@/components/marketing/HomeClosingCta'
import { OpenSourceApplyForm } from '@/components/marketing/OpenSourceApplyForm'
import OpenSourceFAQ from '@/components/marketing/OpenSourceFAQ'
import { startupsFaqCategories, startupsFaqData } from '@/components/marketing/startups-faq-data'
import { cdnUrl } from '@/lib/cdn'

// /startups — the startups plan (05-09-2026). A content variant of the
// approved /open-source page: same hero grammar, same terms strip, same
// category-rail FAQ, same anonymous form posting to the same intake with
// kind='startups'. Nothing visually new was introduced, which is why this
// shipped without its own options round.
//
// ⚠️ No MacWindow artifact here yet. /open-source docks a REAL capture of a
// granted workspace's billing page; a startups workspace has not been granted
// yet, so there is nothing honest to show. Add the capture once one exists —
// house rule: captures of the live product only, never a mock.

const description =
  'Early-stage startups run Pulse free for a year — a real tier at €0 with five sites, 100k pageviews a month and every feature. In return, we get to say you use Pulse.'

// Dedicated share card (owner pick 08-09-2026: the big-€0 composition, the
// twin of /open-source's; mocks archived in
// docs/data/08-09-2026-startups-og-card-mocks/). Dated filename — the CDN
// caches immutably, so a revision is a NEW path, never an overwrite.
//
// ⚠️ Next.js shallow-merges metadata per top-level field (see app/layout.tsx):
// declaring `openGraph` here replaces the root's block wholesale, so this page
// carried NO card of its own until now and inherited og-pulse.png. `twitter`
// must be re-declared in full for the same reason — a partial block would
// silently drop the root's site handle along with its image.
const OG_IMAGE = cdnUrl('/marketing/og-startups-08-09-2026.png')

export const metadata: Metadata = {
  title: 'The startups plan',
  description,
  alternates: {
    canonical: '/startups',
  },
  openGraph: {
    title: 'Analytics before the revenue',
    description,
    siteName: 'Pulse by Ciphera',
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: '€0 for startups — the Pulse startups plan',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@CipheraNET',
    title: 'Analytics before the revenue',
    description,
    images: [OG_IMAGE],
  },
}

const TERMS: { value: string; unit: string; label: string }[] = [
  { value: '€0', unit: '/mo', label: 'The price, for a year' },
  { value: '5', unit: 'sites', label: 'Marketing site, app, three more' },
  { value: '100k', unit: 'pv/mo', label: 'Raisable per grant' },
  { value: '2', unit: 'years', label: 'Data retention' },
]

export default function StartupsPage() {
  return (
    <>
      {/* ── Hero — the /open-source grammar: glyph-ember floor, hero-scale H1
          with the hand-drawn underline, CTAs. ── */}
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
        <div className="relative mx-auto max-w-5xl px-6 pb-20 pt-20 text-center sm:pb-28 sm:pt-28">
          <h1 className="font-display text-[2.5rem] font-bold leading-[0.95] tracking-tight text-foreground sm:text-7xl lg:text-[5.5rem]">
            Analytics before
            <span className="block">
              the{' '}
              <span className="relative inline-block">
                revenue.
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
            A real tier at €0 for a year, for startups under two years old
            with ten people or fewer. In return, we get to say you use Pulse.
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
      </section>

      {/* ── The terms — the flat hairline ticker strip. ── */}
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
              API. No plan gates any. After the year, we talk.
            </p>
          </div>
        </div>
      </section>

      {/* ── 01 · FAQ ── */}
      <section className="border-b border-border">
        <div className="px-6 py-16 sm:py-20">
          <p className="text-xs text-muted-foreground">01 · FAQ</p>
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Questions, answered.
          </h2>
          <OpenSourceFAQ
            categories={startupsFaqCategories}
            data={startupsFaqData}
            idPrefix="startups"
            ariaLabel="Startups FAQ categories"
          />
        </div>
      </section>

      {/* ── 02 · Apply — pitch left, the anonymous form right. ── */}
      <section className="border-b border-border" id="apply">
        <div className="px-6 py-16 sm:py-20">
          <div className="mx-auto grid max-w-5xl grid-cols-1 items-start gap-x-8 gap-y-1 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">02 · Apply</p>
              <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Three checks, and a door for edge cases.
              </h2>
              <ul className="mt-8 flex flex-col gap-3">
                {[
                  'Founded in the last two years.',
                  'Ten people or fewer, and not past a seed round.',
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
                  your company&rsquo;s domain.
                </p>
              </div>
            </div>
            <div className="mt-8 sm:mt-0">
              <OpenSourceApplyForm kind="startups" />
              <p className="mt-4 text-xs text-muted-foreground">
                Rather write it yourself? hello@ciphera.net works too.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <HomeClosingCta eyebrow="Get started" secondaryHref="/demo" secondaryLabel="View live demo" />
      </section>
    </>
  )
}
