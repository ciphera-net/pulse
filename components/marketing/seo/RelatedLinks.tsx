import Link from 'next/link'
import { ArrowRightIcon } from '@ciphera-net/facet'
import { MarketingSection } from '@/components/marketing/system/MarketingSection'

export interface RelatedLink {
  label: string
  description: string
  href: string
}

/**
 * A bordered grid of internal cross-links — the interlinking that ties the SEO
 * cluster (/vs, category pages, /integrations, tools) together. Reused across
 * every SEO page so the pattern stays consistent.
 */
export function RelatedLinks({
  links,
  eyebrow = 'Keep reading',
  heading = 'Related',
}: {
  links: RelatedLink[]
  eyebrow?: string
  heading?: string
}) {
  return (
    <MarketingSection eyebrowLabel={eyebrow} heading={heading}>
      <div className="mt-10 grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex flex-col bg-card p-6 transition-colors hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {link.label}
              <ArrowRightIcon
                aria-hidden="true"
                className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
              />
            </span>
            <span className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {link.description}
            </span>
          </Link>
        ))}
      </div>
    </MarketingSection>
  )
}
