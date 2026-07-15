'use client'

import { useRef, useState } from 'react'
import { PlusIcon } from '@ciphera-net/facet'
import { cn } from '@/lib/utils'
import { faqCategories, faqData } from '@/components/marketing/home-faq-data'

// Continuous 01–NN numbering across every category — the index aesthetic.
let runningIndex = 0
const GROUPS = Object.entries(faqCategories).map(([key, label]) => ({
  key,
  label,
  items: (faqData[key] ?? []).map((item) => ({
    ...item,
    n: String(++runningIndex).padStart(2, '0'),
  })),
}))

export function HomeFAQ() {
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
    <div className="mt-10 grid items-start gap-8 lg:grid-cols-[200px_1fr]">
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
              id={`home-faq-tab-${i}`}
              tabIndex={isActive ? 0 : -1}
              aria-selected={isActive}
              aria-controls={isActive ? 'home-faq-panel' : undefined}
              onClick={() => selectGroup(g.key)}
              onKeyDown={(e) => handleTabKeyDown(e, i)}
              className={cn(
                'flex items-baseline justify-between gap-3 py-1.5 text-left font-mono text-xs transition-colors duration-150 motion-reduce:transition-none',
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
        id="home-faq-panel"
        aria-labelledby={`home-faq-tab-${activeIndex}`}
        className="border border-border"
      >
        {group.items.map((item) => {
          const isOpen = openId === item.n
          const answerId = `home-faq-answer-${item.n}`
          return (
            <div key={item.n} className="border-b border-border last:border-b-0">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={answerId}
                onClick={() => setOpenId(isOpen ? null : item.n)}
                className="flex w-full items-center gap-5 px-5 py-4 text-left transition-colors duration-150 hover:bg-accent motion-reduce:transition-none"
              >
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
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
