import { HomeClosingCta } from '@/components/marketing/HomeClosingCta'

/**
 * Closing call-to-action shared by every SEO page (/vs, category, tools).
 * One closer DESIGN across the estate — this is the homepage's ember-bloom
 * closer (owner decision 06-08-2026); only the copy is per-page. Title/body
 * are passed through so each page still closes in its own words. Plain
 * <section> wrapper: the closer carries no border-b — the footer's border-t
 * owns the seam, same as on the homepage and /pricing.
 */
export function SeoPageCta({
  title = 'Try privacy-first analytics free',
  body = 'One script under 3 KB, no cookies to configure, no consent banner to build. Start on the free Hobby tier, or explore the live demo on real traffic first — no signup required.',
}: {
  title?: string
  body?: string
}) {
  return (
    <section>
      <HomeClosingCta
        eyebrow="Get started"
        heading={title}
        dek={body}
        secondaryHref="/demo"
        secondaryLabel="View live demo"
      />
    </section>
  )
}
