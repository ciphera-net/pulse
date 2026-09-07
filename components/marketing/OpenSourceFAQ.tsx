'use client'

import { useState } from 'react'
import { PlusIcon, Switcher } from '@ciphera-net/facet'
import {
  opensourceFaqCategories,
  opensourceFaqData,
  type FAQItem,
} from '@/components/marketing/opensource-faq-data'

// The shared category-rail FAQ, mirrored from PricingFAQ/HomeFAQ so the
// /open-source page reads as the same system. Continuous 01–NN numbering.
//
// Parametrised (05-09-2026) so /startups can reuse the exact component with
// its own questions: the defaults are the open-source set, so that page is
// unchanged. `idPrefix` keeps the two pages' ARIA ids from colliding if both
// ever render in one document.
function buildGroups(categories: Record<string, string>, data: Record<string, FAQItem[]>) {
  let runningIndex = 0
  return Object.entries(categories).map(([key, label]) => ({
    key,
    label,
    items: (data[key] ?? []).map((item) => ({
      ...item,
      n: String(++runningIndex).padStart(2, '0'),
    })),
  }))
}

export default function OpenSourceFAQ({
  categories = opensourceFaqCategories,
  data = opensourceFaqData,
  idPrefix = 'opensource',
  ariaLabel = 'Open-source FAQ categories',
}: {
  categories?: Record<string, string>
  data?: Record<string, FAQItem[]>
  idPrefix?: string
  ariaLabel?: string
} = {}) {
  const GROUPS = buildGroups(categories, data)
  const [activeKey, setActiveKey] = useState(GROUPS[0].key)
  const [openId, setOpenId] = useState<string | null>(null)

  function selectGroup(key: string) {
    setActiveKey(key)
    setOpenId(null)
  }

  const activeIndex = GROUPS.findIndex((g) => g.key === activeKey)
  const group = GROUPS[activeIndex] ?? GROUPS[0]

  return (
    <div className="mt-10 grid items-start gap-8 lg:grid-cols-[200px_1fr]">
      {/* Category selector — horizontal on mobile, vertical rail on desktop */}
      <div className="min-w-0 overflow-x-auto scrollbar-hide pb-1 lg:overflow-visible">
        <Switcher
          size="sm"
          tone="solid"
          aria-label={ariaLabel}
          options={GROUPS.map((g) => ({
            value: g.key,
            label: (
              <span className="flex items-baseline gap-2">
                {g.label}
                <span className="tabular-nums text-muted-foreground">
                  {String(g.items.length).padStart(2, '0')}
                </span>
              </span>
            ),
          }))}
          value={activeKey}
          onChange={selectGroup}
        />
      </div>

      {/* Active category's rows — continuous global numbering preserved */}
      <div
        id={`${idPrefix}-faq-panel`}
        aria-label={group.label}
        className="border border-border"
      >
        {group.items.map((item) => {
          const isOpen = openId === item.n
          const answerId = `${idPrefix}-faq-answer-${item.n}`
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
