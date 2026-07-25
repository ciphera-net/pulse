import { MarketingSection } from '@/components/marketing/system/MarketingSection'
import { SeoCtaButtons } from './SeoCtaButtons'

/**
 * Shared hero for the category landing pages: mono eyebrow, an H1 carrying the
 * page's target keyword, a lede, and the demo/signup CTA pair. One component so
 * the five category angles stay visually consistent while each supplies its own
 * words.
 */
export function SeoHero({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string
  title: string
  lede: React.ReactNode
}) {
  return (
    <MarketingSection>
      <div className="max-w-2xl">
        <p className="font-mono text-xs text-muted-foreground">{eyebrow}</p>
        <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
          {title}
        </h1>
        <p className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg">{lede}</p>
        <div className="mt-8">
          <SeoCtaButtons />
        </div>
      </div>
    </MarketingSection>
  )
}
