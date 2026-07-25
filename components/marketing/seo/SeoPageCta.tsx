import { MarketingSection } from '@/components/marketing/system/MarketingSection'
import { SeoCtaButtons } from './SeoCtaButtons'

/**
 * Closing call-to-action slab shared by every SEO page. Quiet bordered card,
 * headline + supporting line + the demo/signup button pair. Copy is passed in
 * so each page can close in its own words without duplicating the layout.
 */
export function SeoPageCta({
  title = 'Try privacy-first analytics free',
  body = 'No cookies, no consent banner, no compromise. Start on the free Hobby tier, or explore the live demo on real traffic first — no signup required.',
}: {
  title?: string
  body?: string
}) {
  return (
    <MarketingSection>
      <div className="flex flex-col items-start justify-between gap-8 border border-border bg-card p-8 lg:flex-row lg:items-center lg:p-10">
        <div className="max-w-xl">
          <p className="font-mono text-xs text-muted-foreground">Get started</p>
          <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{body}</p>
          <p className="mt-6 font-mono text-xs text-muted-foreground">
            Cookie-free · GDPR compliant · EU company
          </p>
        </div>
        <SeoCtaButtons className="flex flex-col gap-3 sm:flex-row lg:flex-col" />
      </div>
    </MarketingSection>
  )
}
