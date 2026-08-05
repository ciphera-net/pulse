import Link from 'next/link'
import { ArrowRightIcon, Button } from '@ciphera-net/facet'
import { integrations, type Integration } from '@/lib/integrations'

// * Hosted documentation *services* that live in the ssg category — they are
// * places a site is published, not frameworks a stack is built on. Showing
// * them under "works with your stack" would be padding the number.
const NOT_FRAMEWORKS = new Set(['gitbook', 'readthedocs', 'readme'])

const FRAMEWORKS = integrations.filter(
  (i) =>
    (i.category === 'framework' || i.category === 'backend' || i.category === 'ssg') &&
    !NOT_FRAMEWORKS.has(i.id),
)

/** Exported so the section dek in MarketingHome can cite live counts. */
export const FRAMEWORK_COUNT = FRAMEWORKS.length
export const INTEGRATION_COUNT = integrations.length

// * Round-robin into three rows so each row mixes JS frameworks, backends and
// * generators instead of clustering by category (registry order is grouped).
const ROWS: Integration[][] = [[], [], []]
FRAMEWORKS.forEach((f, i) => ROWS[i % 3].push(f))

const ROW_ANIMATIONS = ['animate-marquee-a', 'animate-marquee-b', 'animate-marquee-c'] as const

function Pill({ integration }: { integration: Integration }) {
  return (
    <span className="flex shrink-0 items-center gap-2.5 rounded-none border border-border bg-card px-4 py-2.5 [&_svg]:h-5 [&_svg]:w-5">
      {integration.icon}
      <span className="whitespace-nowrap text-sm font-medium text-foreground">
        {integration.name}
      </span>
    </span>
  )
}

function Row({ items, animation }: { items: Integration[]; animation: string }) {
  // Four copies + -50% translate = seamless loop; see marqueeDrift in
  // globals.css. The trailing pr-3 matches gap-3 so the content is EXACTLY
  // periodic — without it the wrap point would jump by half a gap each cycle.
  const copies = [...items, ...items, ...items, ...items]
  return (
    <div className={`flex w-max gap-3 pr-3 will-change-transform ${animation}`}>
      {copies.map((integration, i) => (
        <Pill key={`${integration.id}-${i}`} integration={integration} />
      ))}
    </div>
  )
}

/**
 * The framework strip — three slow counter-drifting rows of framework pills,
 * Railway's device translated into the Facet vocabulary: sharp hairline
 * `bg-card` pills on dark, sans labels, official simple-icons artwork straight
 * from the integration registry (single source of truth — a new framework
 * added there appears here on the next build).
 *
 * Purely decorative by design: the rows are aria-hidden and the pills are not
 * links (moving focus targets are a WCAG 2.2.2 trap); the one real control is
 * the "See all integrations" link below, and screen readers get the framework
 * list as a static sentence. A pure server component — the motion is CSS-only,
 * so the SSR'd homepage ships no extra JS for this.
 */
export function FrameworkMarquee() {
  return (
    <div className="mt-12">
      <p className="sr-only">
        Pulse has dedicated install guides for {FRAMEWORKS.map((f) => f.name).join(', ')}.
      </p>

      {/* -mx-6 escapes the MarketingSection gutter: the band runs edge to
          edge and the mask fades the pills out before the viewport edge. */}
      <div
        aria-hidden="true"
        className="-mx-6 space-y-3 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]"
      >
        {ROWS.map((row, i) => (
          <Row key={i} items={row} animation={ROW_ANIMATIONS[i]} />
        ))}
      </div>

      <div className="mt-10">
        <Button asChild variant="outline" size="lg">
          <Link href="/integrations">
            See all {INTEGRATION_COUNT} integrations
            <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  )
}
