import Link from 'next/link'
import { ArrowRightIcon, Button } from '@ciphera-net/facet'
import { VerdictTable } from '@/components/marketing/seo/VerdictTable'
import { comparisons, comparisonLogoUrl, getComparison } from '@/lib/comparisons'

/**
 * §02 Compare — the /vs pages' VerdictTable, on the homepage, fed by the same
 * registry (single source of truth: rows, tones, verdict copy and logos all
 * come from lib/comparisons). Google Analytics is the headline comparison —
 * it's the tool people are leaving — with the other competitors as a chip rail
 * linking to their full /vs pages. Replaced the old hand-built check/X cards,
 * which were a generic us-vs-them device disconnected from the real
 * comparison data (05/06-08 homepage audit).
 */

const ga = getComparison('google-analytics')!
const others = comparisons.filter((c) => c.slug !== 'google-analytics')

export default function ComparisonCards() {
  return (
    <div>
      <VerdictTable
        competitor={ga.name}
        competitorLogo={comparisonLogoUrl(ga.slug)}
        rows={ga.rows}
      />

      {/* The honest verdict — same copy the /vs page opens with. */}
      <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">{ga.verdict}</p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" size="lg">
          <Link href="/vs/google-analytics">
            Full comparison
            <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>

        {/* The rest of the field — hairline chips into their /vs pages. */}
        {others.map((c) => (
          <Link
            key={c.slug}
            href={`/vs/${c.slug}`}
            className="inline-flex items-center gap-2 rounded-none border border-border bg-card px-3.5 py-2.5 text-sm text-muted-foreground transition-colors duration-150 ease-apple hover:bg-neutral-900 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={comparisonLogoUrl(c.slug)}
              alt=""
              width={16}
              height={16}
              className="h-4 w-4 object-contain"
              loading="lazy"
            />
            vs {c.name}
          </Link>
        ))}
      </div>
    </div>
  )
}
