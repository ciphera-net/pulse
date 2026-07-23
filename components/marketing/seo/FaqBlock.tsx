import { MarketingSection } from '@/components/marketing/system/MarketingSection'

export interface FaqItem {
  question: string
  answer: string
}

/**
 * Server-rendered FAQ block for the SEO cluster. Answers are visible in the DOM
 * at first paint (crawlers read the copy, not just the schema) and the matching
 * FAQPage JSON-LD is emitted alongside for rich results. Continuous numbering
 * mirrors the /faq index aesthetic.
 */
export function FaqBlock({
  items,
  eyebrow = 'FAQ',
  heading = 'Frequently asked questions',
}: {
  items: FaqItem[]
  eyebrow?: string
  heading?: string
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }

  return (
    <MarketingSection eyebrowLabel={eyebrow} heading={heading}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <div className="mt-10 border border-border">
        {items.map((item, i) => (
          <div key={item.question} className="border-b border-border last:border-b-0">
            <div className="flex gap-5 px-5 py-6">
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{item.question}</h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </MarketingSection>
  )
}
