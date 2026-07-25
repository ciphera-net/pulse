'use client'

/**
 * @file FAQ page.
 *
 * Rebuilt onto the marketing section grammar (design §5.5): a semantic <h1>
 * with a mono eyebrow, the website FAQ pattern wholesale — a left category rail
 * (General / Setup / Privacy & Compliance / Technical with zero-padded counts,
 * roving tabindex, wrap-on-mobile), continuous 01–NN numbering across every
 * group, and a bordered grid-rows accordion with `motion-reduce`. The old
 * category-pill filter (PulseFAQ / FAQ.tsx) dies here; "Still have questions?"
 * becomes a quiet bordered CTA row with facet Buttons. Framer retired — content
 * is visible at first paint. Tokens only.
 *
 * Data source: `home-faq-data.ts` — /faq and the home FAQ render the identical
 * 20-question set, so the Q&A stays in one place (no separate faq-page-data).
 */

import Link from 'next/link'
import { useRef, useState } from 'react'
import { ArrowRightIcon, Button, MailIcon, PlusIcon } from '@ciphera-net/facet'
import { cn } from '@/lib/utils'
import { MarketingSection } from '@/components/marketing/system/MarketingSection'
import { faqCategories, faqData } from '@/components/marketing/home-faq-data'

// * JSON-LD FAQ Schema for rich snippets (curated subset — SEO markup, not
// display copy; the visible list is the full home-faq-data set below).
const schemaFaqs = [
  { question: 'Is Pulse GDPR compliant?', answer: "Yes, Pulse is GDPR compliant by design. We don't use cookies, don't collect personal data, and process all data anonymously." },
  { question: 'Do I need a cookie consent banner?', answer: "No, you don't need a cookie consent banner. Pulse doesn't use cookies, so it's exempt from cookie consent requirements under GDPR." },
  { question: 'How does Pulse track visitors?', answer: 'We use a lightweight JavaScript snippet that sends anonymous pageview events. No cookies, no cross-session identifiers (we use sessionStorage only to group events within a single visit), and no cross-site tracking.' },
  { question: 'What data does Pulse collect?', answer: 'We collect anonymous pageview data including page path, referrer, device type, browser, and country (derived from IP at request time; the IP itself is not stored). No personal information is collected.' },
  { question: 'How accurate is the data?', answer: "Our data is highly accurate. We exclude bot traffic and data center visits. Since we don't use cookies, we count unique sessions rather than unique users." },
  { question: 'Can I export my data?', answer: "Yes, you can access all your analytics data through the dashboard. We're working on export functionality for bulk data downloads." },
]

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: schemaFaqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
}

// Continuous 01–NN numbering across every category — the index aesthetic,
// matching HomeFAQ so the two surfaces read as one system.
let runningIndex = 0
const GROUPS = Object.entries(faqCategories).map(([key, label]) => ({
  key,
  label,
  items: (faqData[key] ?? []).map((item) => ({
    ...item,
    n: String(++runningIndex).padStart(2, '0'),
  })),
}))

function FaqRail() {
  const [activeKey, setActiveKey] = useState(GROUPS[0].key)
  const [openId, setOpenId] = useState<string | null>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  function selectGroup(key: string) {
    setActiveKey(key)
    setOpenId(null)
  }

  // Roving tabindex: arrow keys move both selection and focus along the rail.
  function handleTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = GROUPS.length - 1
    let next: number | null = null
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = index === last ? 0 : index + 1
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = index === 0 ? last : index - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    if (next === null) return
    e.preventDefault()
    selectGroup(GROUPS[next].key)
    tabRefs.current[next]?.focus()
  }

  const activeIndex = GROUPS.findIndex((g) => g.key === activeKey)
  const group = GROUPS[activeIndex] ?? GROUPS[0]

  return (
    <div className="mt-12 grid items-start gap-8 lg:grid-cols-[200px_1fr]">
      {/* Category selector — horizontal on mobile, vertical rail on desktop */}
      <div
        role="tablist"
        aria-label="FAQ categories"
        aria-orientation="vertical"
        className="flex flex-wrap gap-x-6 gap-y-2 lg:flex-col lg:gap-y-1"
      >
        {GROUPS.map((g, i) => {
          const isActive = g.key === activeKey
          return (
            <button
              key={g.key}
              ref={(el) => {
                tabRefs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`faq-tab-${i}`}
              tabIndex={isActive ? 0 : -1}
              aria-selected={isActive}
              aria-controls={isActive ? 'faq-panel' : undefined}
              onClick={() => selectGroup(g.key)}
              onKeyDown={(e) => handleTabKeyDown(e, i)}
              className={cn(
                'flex items-baseline justify-between gap-3 py-1.5 text-left text-xs transition-colors duration-150 motion-reduce:transition-none',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {g.label}
              <span className="tabular-nums text-muted-foreground">
                {String(g.items.length).padStart(2, '0')}
              </span>
            </button>
          )
        })}
      </div>

      {/* Active category's rows — continuous global numbering preserved */}
      <div
        role="tabpanel"
        id="faq-panel"
        aria-labelledby={`faq-tab-${activeIndex}`}
        className="border border-border"
      >
        {group.items.map((item) => {
          const isOpen = openId === item.n
          const answerId = `faq-answer-${item.n}`
          return (
            <div key={item.n} className="border-b border-border last:border-b-0">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={answerId}
                onClick={() => setOpenId(isOpen ? null : item.n)}
                className="flex w-full items-center gap-5 px-5 py-4 text-left transition-colors duration-150 hover:bg-accent motion-reduce:transition-none"
              >
                <span className="text-xs tabular-nums text-muted-foreground">
                  {item.n}
                </span>
                <span className="flex-1 text-sm font-medium text-foreground">{item.question}</span>
                <PlusIcon
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none"
                  style={{ transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}
                />
              </button>

              <div
                id={answerId}
                className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
                style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden">
                  <p className="px-5 pb-5 pl-[60px] text-sm leading-relaxed text-muted-foreground">
                    {item.answer}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function FAQPage() {
  return (
    <>
      {/* * JSON-LD FAQ Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      {/* ── HERO + RAIL ── */}
      <MarketingSection>
        <div className="max-w-2xl">
          <p className="text-xs text-muted-foreground">Pulse · Support</p>
          <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
            Frequently asked questions
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg">
            Everything you need to know about Pulse — privacy, setup, compliance, and how it
            actually works under the hood.
          </p>
        </div>

        <FaqRail />
      </MarketingSection>

      {/* ── STILL HAVE QUESTIONS — quiet bordered CTA row ── */}
      <MarketingSection>
        <div className="flex flex-col items-start justify-between gap-6 border border-border bg-card p-8 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs text-muted-foreground">Still have questions?</p>
            <p className="mt-3 text-lg font-semibold text-foreground">
              We&apos;re happy to help.
            </p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Reach out and a real person will get back to you — no bots, no ticket carousel.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <a href="mailto:support@ciphera.net">
                <MailIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                Contact us
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/installation">
                Read the docs
                <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </MarketingSection>
    </>
  )
}
