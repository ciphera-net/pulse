/**
 * @file Comparison registry — the data behind the `/vs/[slug]` cluster.
 *
 * One statically-generated template renders every "Pulse vs <competitor>" page
 * from an entry here, mirroring the `/integrations/[slug]` pattern.
 *
 * ! HONESTY RULES (hard):
 * !  - Every competitor fact must be verifiable. Pricing was checked against
 * !    each vendor's public pricing page on 2026-07-21; where a number is
 * !    volatile or tier-dependent we phrase it as "from …" with the tier and
 * !    always link out to their pricing so a reader can confirm the current
 * !    figure. Numbers we could not stand behind are omitted, not invented.
 * !  - Every entry MUST carry a `whenBetter` section — the honest case for
 * !    choosing the competitor. It is not optional marketing garnish; it is the
 * !    point. A comparison with no "when they win" is an advert, not a compare.
 * !  - No fabricated studies, quotes, or customer claims anywhere.
 *
 * Sources checked 2026-07-21: plausible.io/#pricing, usefathom.com/pricing,
 * umami.is/pricing, matomo.org, simpleanalytics.com; company jurisdictions from
 * each vendor's imprint / public register (Plausible Insights OÜ — Estonia;
 * InnoCraft Ltd — New Zealand; Simple Analytics B.V. — Netherlands; Conva
 * Ventures Inc. — Canada; Umami Software, Inc. — United States; Google LLC —
 * United States).
 */

export type CellTone = 'pos' | 'neg' | 'neutral'

export interface ComparisonCell {
  text: string
  tone: CellTone
}

export interface ComparisonRow {
  /** Row label, e.g. "Cookies". */
  label: string
  pulse: ComparisonCell
  them: ComparisonCell
}

export interface Comparison {
  /** URL slug — the `[slug]` in /vs/[slug]. */
  slug: string
  /** Full competitor name, e.g. "Google Analytics". */
  name: string
  /** What the competitor is, in one honest line. */
  tagline: string
  /** <meta name="description"> — unique per page. */
  metaDescription: string
  /** One-to-two sentence honest verdict shown under the table. */
  verdict: string
  /** The above-the-fold comparison table. */
  rows: ComparisonRow[]
  /** Contrast paragraph: where Pulse specifically differs from THIS tool. */
  pulseEdge: string
  /** The required honest "when the competitor is the better choice" block. */
  whenBetter: {
    heading: string
    body: string
    points: string[]
  }
}

/** Pulse's own column values — constant across every comparison. */
const PULSE = {
  pricing: { text: 'Free Hobby tier; paid plans — see pricing', tone: 'neutral' as const },
  cookies: { text: 'None', tone: 'pos' as const },
  banner: { text: 'Not needed', tone: 'pos' as const },
  openSource: { text: 'Frontend + client open (AGPL)', tone: 'pos' as const },
  residency: { text: 'Switzerland / EU', tone: 'pos' as const },
  jurisdiction: { text: 'Belgium (EU)', tone: 'pos' as const },
}

const ROW_ORDER = [
  'Starting price',
  'Cookies',
  'Consent banner (EU)',
  'Open source',
  'Data residency',
  'Company jurisdiction',
] as const

/** Assemble a full row set from Pulse's constants + the competitor's cells. */
function rows(them: {
  pricing: ComparisonCell
  cookies: ComparisonCell
  banner: ComparisonCell
  openSource: ComparisonCell
  residency: ComparisonCell
  jurisdiction: ComparisonCell
}): ComparisonRow[] {
  return [
    { label: ROW_ORDER[0], pulse: PULSE.pricing, them: them.pricing },
    { label: ROW_ORDER[1], pulse: PULSE.cookies, them: them.cookies },
    { label: ROW_ORDER[2], pulse: PULSE.banner, them: them.banner },
    { label: ROW_ORDER[3], pulse: PULSE.openSource, them: them.openSource },
    { label: ROW_ORDER[4], pulse: PULSE.residency, them: them.residency },
    { label: ROW_ORDER[5], pulse: PULSE.jurisdiction, them: them.jurisdiction },
  ]
}

export const comparisons: Comparison[] = [
  {
    slug: 'google-analytics',
    name: 'Google Analytics',
    tagline:
      'Google Analytics 4 is the free, ubiquitous analytics product from Google — powerful, cookie-based, and wired into the wider Google advertising ecosystem.',
    metaDescription:
      'Pulse vs Google Analytics: a cookieless, GDPR-native alternative with no consent banner, EU jurisdiction and Swiss data residency. Honest, side-by-side comparison.',
    verdict:
      'Google Analytics 4 is free and deeply integrated with Google Ads. Pulse trades that ecosystem for cookieless tracking, no consent banner, an EU company and Swiss/EU data residency — the things that make GA hard to run cleanly in Europe.',
    rows: rows({
      pricing: { text: 'Free (GA4)', tone: 'neutral' },
      cookies: { text: 'Yes, by default', tone: 'neg' },
      banner: { text: 'Required in the EU', tone: 'neg' },
      openSource: { text: 'No — closed source', tone: 'neg' },
      residency: { text: 'Google infrastructure (global / US)', tone: 'neg' },
      jurisdiction: { text: 'United States (Google LLC)', tone: 'neg' },
    }),
    pulseEdge:
      'The practical difference is the consent banner. Google Analytics sets cookies and, in the EU, needs opt-in consent before it can run — so it only ever sees the visitors who accept. It is also operated by a US company on Google infrastructure, and EU data-protection authorities have found Google Analytics unlawful in several rulings over EU-to-US data transfers. Pulse sets no cookies, so it needs no banner and counts everyone; it is run by an EU company (Ciphera BV, Belgium) with data on Swiss/EU infrastructure, and its dashboard and tracking client are open (AGPL) with a public live demo you can inspect on real traffic.',
    whenBetter: {
      heading: 'When Google Analytics is the better choice',
      body: 'If your analytics exist to feed Google advertising, GA is hard to beat — and it is free.',
      points: [
        'You run Google Ads and want native audience, conversion and remarketing integration across the Google Marketing Platform.',
        'You need GA4’s deep event model, funnels and free BigQuery export for large-scale custom analysis.',
        'You are already invested in Google Tag Manager and the broader Google stack and consent management is handled for you.',
      ],
    },
  },
  {
    slug: 'plausible',
    name: 'Plausible',
    tagline:
      'Plausible is a mature, open-source, cookieless analytics tool from an EU company (Estonia) — the most established name in this category.',
    metaDescription:
      'Pulse vs Plausible: two cookieless, GDPR-friendly EU analytics tools compared honestly. Where Plausible leads, and where Pulse’s Belgian/Swiss stance differs.',
    verdict:
      'Plausible and Pulse are close peers — both cookieless, both banner-free, both open and EU-based. Plausible has the longer track record and can be self-hosted; Pulse’s distinct edge is a Belgian company with Swiss/EU residency and a public live demo on real traffic.',
    rows: rows({
      pricing: { text: 'From $9/mo (10k pageviews)', tone: 'neutral' },
      cookies: { text: 'None', tone: 'pos' },
      banner: { text: 'Not needed', tone: 'pos' },
      openSource: { text: 'Yes — self-hostable', tone: 'pos' },
      residency: { text: 'EU (Hetzner, Germany)', tone: 'pos' },
      jurisdiction: { text: 'EU (Estonia)', tone: 'pos' },
    }),
    pulseEdge:
      'This is the fairest fight on the list: Plausible pioneered cookieless, banner-free, open-source EU analytics and does it well. Pulse shares that entire foundation. Where they differ is jurisdiction and residency detail — Pulse is operated by Ciphera BV in Belgium with data on Swiss/EU infrastructure, and ships as part of a wider EU privacy platform — plus a public, no-login live demo running on our own real traffic. If you are choosing between two good tools, pick on product feel and the specifics of who holds your data.',
    whenBetter: {
      heading: 'When Plausible is the better choice',
      body: 'Plausible is an excellent product and, for many teams, the safer default.',
      points: [
        'You want the most established privacy-analytics brand, with the longest track record and the largest community and plugin ecosystem.',
        'You need to self-host the analytics engine on your own infrastructure — Plausible ships a supported self-hosted edition today.',
        'You prefer Plausible’s dashboard and feature set after trying both.',
      ],
    },
  },
  {
    slug: 'matomo',
    name: 'Matomo',
    tagline:
      'Matomo is the heavyweight open-source analytics platform — self-hostable, feature-rich (heatmaps, session recording, A/B testing) — from InnoCraft in New Zealand.',
    metaDescription:
      'Pulse vs Matomo: lightweight cookieless analytics with no banner versus Matomo’s self-hostable, feature-heavy platform. An honest comparison of the trade-offs.',
    verdict:
      'Matomo is the most feature-complete option and can run entirely on your own servers, but cookieless operation takes configuration and some setups still need a consent banner. Pulse is cookieless and banner-free out of the box, fully hosted, with EU jurisdiction and Swiss residency.',
    rows: rows({
      pricing: { text: 'Self-hosted: free · Cloud from ~€19/mo', tone: 'neutral' },
      cookies: { text: 'Configurable; cookies by default', tone: 'neutral' },
      banner: { text: 'Depends on configuration', tone: 'neutral' },
      openSource: { text: 'Yes — self-hostable', tone: 'pos' },
      residency: { text: 'Your servers, or EU Cloud', tone: 'pos' },
      jurisdiction: { text: 'New Zealand (InnoCraft)', tone: 'neutral' },
    }),
    pulseEdge:
      'Matomo can do far more than Pulse — heatmaps, session recordings, A/B tests, form and e-commerce analytics — and you can host every byte yourself. The trade-off is weight and setup: Matomo uses cookies by default, so running it cookieless (and skipping the consent banner) requires deliberate configuration, and its Cloud company sits in New Zealand. Pulse does one thing — privacy-first web analytics — with no cookies and no banner from the first pageview, nothing to host or maintain, and an EU company with Swiss/EU data residency.',
    whenBetter: {
      heading: 'When Matomo is the better choice',
      body: 'If you need depth or full self-hosting today, Matomo is the stronger tool.',
      points: [
        'You need to self-host and own 100% of the data on your own infrastructure right now.',
        'You want heatmaps, session recordings, A/B testing, funnels, form and e-commerce analytics in one platform.',
        'You have the resources to configure and maintain a heavier analytics stack, including its cookie/consent settings.',
      ],
    },
  },
  {
    slug: 'fathom',
    name: 'Fathom',
    tagline:
      'Fathom is a polished, closed-source cookieless analytics product from a Canadian company, with an optional EU data-isolation setting.',
    metaDescription:
      'Pulse vs Fathom: two simple, cookieless, banner-free analytics tools compared. Where Fathom leads and where Pulse’s open client and EU jurisdiction differ.',
    verdict:
      'Fathom and Pulse are both simple and cookieless with no consent banner. Fathom is a well-regarded closed-source product from a Canadian team with an EU-isolation option; Pulse is open (AGPL) with a public live demo, run by an EU company on Swiss/EU infrastructure.',
    rows: rows({
      pricing: { text: 'From $15/mo (100k pageviews)', tone: 'neutral' },
      cookies: { text: 'None', tone: 'pos' },
      banner: { text: 'Not needed', tone: 'pos' },
      openSource: { text: 'No — closed source', tone: 'neg' },
      residency: { text: 'EU isolation option', tone: 'neutral' },
      jurisdiction: { text: 'Canada (Conva Ventures)', tone: 'neutral' },
    }),
    pulseEdge:
      'Fathom nails the simple-and-cookieless brief, and its EU-isolation option keeps European traffic in Europe. Two things separate Pulse: Fathom is closed source, whereas Pulse’s dashboard and tracking client are open (AGPL) and there is a public, no-login live demo you can inspect; and Fathom is a Canadian company while Pulse is operated by an EU company (Belgium) with data on Swiss/EU infrastructure. If EU jurisdiction or verifiable open code matters to you, that is the deciding line.',
    whenBetter: {
      heading: 'When Fathom is the better choice',
      body: 'Fathom is a mature, well-supported product with a loyal following.',
      points: [
        'You want a proven, done-for-you closed-source tool from an established team and don’t need open code.',
        'Fathom’s dashboard, bot filtering or email reports fit how you work after trying both.',
        'Its EU-isolation option meets your residency needs and a Canadian jurisdiction is acceptable to you.',
      ],
    },
  },
  {
    slug: 'simple-analytics',
    name: 'Simple Analytics',
    tagline:
      'Simple Analytics is a clean, privacy-first analytics product from a Dutch company (Amsterdam) — cookieless, with its own insight and AI features.',
    metaDescription:
      'Pulse vs Simple Analytics: two EU, cookieless, banner-free analytics tools compared honestly. Where Simple Analytics leads and where Pulse’s open code differs.',
    verdict:
      'Simple Analytics and Pulse are both EU-based, cookieless and banner-free. Simple Analytics is a Dutch product with a minimalist feel; Pulse’s frontend and client are fully open (AGPL) with a public live demo, and data sits on Swiss/EU infrastructure under a Belgian company.',
    rows: rows({
      pricing: { text: 'From $19/mo (billed yearly)', tone: 'neutral' },
      cookies: { text: 'None', tone: 'pos' },
      banner: { text: 'Not needed', tone: 'pos' },
      openSource: { text: 'Scripts open; core closed, no self-host', tone: 'neutral' },
      residency: { text: 'EU (Netherlands)', tone: 'pos' },
      jurisdiction: { text: 'Netherlands (EU)', tone: 'pos' },
    }),
    pulseEdge:
      'Simple Analytics is a genuinely EU-native, cookieless tool — a Dutch company with a clean product and its own automated insight features. The main distinction is openness: Simple Analytics publishes its tracking scripts but keeps the core application closed with no self-hosted option, while Pulse’s dashboard and client are open (AGPL) and demonstrated on a public live dashboard. Both are strong EU choices; pick on product feel and how much verifiable, open code matters to you.',
    whenBetter: {
      heading: 'When Simple Analytics is the better choice',
      body: 'Simple Analytics is a lovely, focused product with an EU home.',
      points: [
        'You want a Dutch/EU company and a deliberately minimal, uncluttered dashboard.',
        'Its automated insights and AI features fit the way you review data.',
        'You don’t need open-source or self-hosting and prefer its specific take on simplicity.',
      ],
    },
  },
  {
    slug: 'umami',
    name: 'Umami',
    tagline:
      'Umami is a free, open-source (MIT) analytics tool you can self-host at no cost, with a hosted Cloud (including a free Hobby tier) run by a US company.',
    metaDescription:
      'Pulse vs Umami: free open-source self-hosted analytics versus a fully-managed EU service. An honest comparison of cost, hosting and jurisdiction.',
    verdict:
      'Umami is the budget champion — genuinely free to self-host, with a free cloud Hobby tier. The trade-offs are that you run and maintain it yourself, and Umami’s Cloud company is US-based. Pulse is a fully-managed EU service with Swiss/EU residency and no server to operate.',
    rows: rows({
      pricing: { text: 'Self-hosted: free · Cloud: free Hobby, Pro $20/mo', tone: 'pos' },
      cookies: { text: 'None', tone: 'pos' },
      banner: { text: 'Not needed', tone: 'pos' },
      openSource: { text: 'Yes — MIT, self-hostable', tone: 'pos' },
      residency: { text: 'Your servers; Cloud US-primary (EU option)', tone: 'neutral' },
      jurisdiction: { text: 'United States (Umami Software)', tone: 'neutral' },
    }),
    pulseEdge:
      'If cost is the deciding factor, Umami is very hard to beat — the software is MIT-licensed and free to self-host, and the cloud Hobby tier is free too. What you take on is operations: a database and app to run, update and secure yourself; and Umami Cloud is operated by a US company on US-primary infrastructure (an EU region is available). Pulse is the opposite trade — a fully-managed service with nothing to host, an EU company (Belgium) and Swiss/EU data residency — for teams who would rather not run infrastructure.',
    whenBetter: {
      heading: 'When Umami is the better choice',
      body: 'When the budget is zero and you’re happy to self-host, Umami wins outright.',
      points: [
        'You want a genuinely free, open-source (MIT) analytics tool you can self-host at no cost.',
        'The free cloud Hobby tier covers a small site and you don’t need managed EU residency.',
        'You have the ops capacity to run, update and secure the stack yourself.',
      ],
    },
  },
]

export function getComparison(slug: string): Comparison | undefined {
  return comparisons.find((c) => c.slug === slug)
}

/**
 * Competitor logo on the shared CDN (the same assets the ciphera.net comparison
 * blog posts use). Filenames match the comparison slug. Referenced as an
 * absolute cross-property URL — cdn.ciphera.net is allowlisted in next.config
 * remotePatterns and the CSP img-src; never copied into public/.
 */
export const COMPARISON_LOGO_BASE = 'https://cdn.ciphera.net/website/blog/tools'

export function comparisonLogoUrl(slug: string): string {
  return `${COMPARISON_LOGO_BASE}/${slug}.png`
}

/** Slugs in the order they should surface in nav / footer / cross-links. */
export const comparisonSlugs = comparisons.map((c) => c.slug)
