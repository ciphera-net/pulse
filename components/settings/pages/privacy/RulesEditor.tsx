'use client'

import * as React from 'react'
import { Button, Input, Select } from '@ciphera-net/facet'
import { ArrowDown, ArrowUp, Trash } from '@phosphor-icons/react'
import type { PageRule } from '@/lib/api/sites'
import { MAX_RULES, RULE_TYPE_OPTIONS, TOO_MANY_RULES, ruleProblems } from './rules'

// One column template for the header and every rule, so the columns line up: each row is its own grid, and an `auto`
// column would size to each row's content. The last column fits the three icon buttons (3 x 32 px + 2 x 4 px gaps).
const COLUMNS = 'md:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)_6.5rem]'

/**
 * The rules, editable in place (copy deck §7.6: a table named Rules, with Rule · Addresses · Show as). Rows stack below
 * `md`, so a phone never scrolls sideways. A rule's problems show once it holds something wrong, or for every rule once
 * a save was tried (`showAll`): an empty rule just added is not an error yet.
 */
export function RulesEditor({
  rules,
  showAll,
  onChange,
  onMove,
  onRemove,
}: {
  rules: PageRule[]
  showAll: boolean
  onChange: (index: number, updates: Partial<PageRule>) => void
  onMove: (index: number, direction: -1 | 1) => void
  onRemove: (index: number) => void
}) {
  const leavesOut = rules.some((r) => r.type === 'exclude')
  return (
    <div data-privacy-rules="">
      <div role="table" aria-label="Rules" className="w-full text-sm">
        <div role="rowgroup">
          <div role="row" className={`hidden gap-3 pb-2 text-xs text-muted-foreground md:grid ${COLUMNS}`}>
            <span role="columnheader">Rule</span>
            <span role="columnheader">Addresses</span>
            <span role="columnheader">Show as</span>
            <span role="columnheader" aria-label="Actions" />
          </div>
        </div>
        <div role="rowgroup" className="divide-y divide-border md:border-t md:border-border">
          {rules.map((rule, index) => {
            const n = index + 1
            const problems = ruleProblems(rule)
            const patternProblem = problems.pattern && (showAll || rule.pattern.trim() !== '') ? problems.pattern : undefined
            const labelProblem = problems.label && (showAll || (rule.label ?? '').trim() !== '') ? problems.label : undefined
            return (
              <div key={index} role="row" data-privacy-rule={index} className={`grid grid-cols-1 gap-3 py-3 md:items-start ${COLUMNS}`}>
                <div role="cell">
                  <Select
                    value={rule.type}
                    onChange={(v) => onChange(index, { type: v as PageRule['type'] })}
                    options={RULE_TYPE_OPTIONS}
                    aria-label={`Rule ${n}`}
                  />
                </div>
                <div role="cell">
                  <Input
                    type="text"
                    value={rule.pattern}
                    onChange={(e) => onChange(index, { pattern: e.target.value })}
                    placeholder="/admin/*"
                    className="font-mono"
                    aria-label={`Rule ${n} addresses`}
                    data-privacy-rule-pattern={index}
                    error={patternProblem}
                  />
                </div>
                <div role="cell" className={rule.type === 'group' ? undefined : 'hidden md:block'}>
                  {rule.type === 'group' ? (
                    <Input
                      type="text"
                      value={rule.label ?? ''}
                      onChange={(e) => onChange(index, { label: e.target.value })}
                      placeholder="/sites/:id"
                      className="font-mono"
                      aria-label={`Rule ${n} shown as`}
                      error={labelProblem}
                    />
                  ) : null}
                </div>
                {/* The last glyph on the section's right edge (R24): a ghost icon button's glyph sits 8 px inside it. */}
                <div role="cell" className="-mr-2 flex items-center justify-end gap-1 md:pt-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onMove(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move rule ${n} up`}
                  >
                    <ArrowUp weight="bold" className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onMove(index, 1)}
                    disabled={index === rules.length - 1}
                    aria-label={`Move rule ${n} down`}
                  >
                    <ArrowDown weight="bold" className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => onRemove(index)}
                    aria-label={`Remove rule ${n}`}
                  >
                    <Trash weight="bold" className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="space-y-1 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">
          <code className="font-mono">*</code> stands for one part of an address, <code className="font-mono">**</code> for one or more.
        </p>
        {leavesOut && (
          <p className="text-xs text-muted-foreground">
            Visits to these pages stop counting, and past visits to them are hidden. Removing the rule brings back only the visits from before it.
          </p>
        )}
        {rules.length > MAX_RULES && (
          <p role="alert" tabIndex={-1} data-privacy-rules-too-many="" className="text-xs font-medium text-destructive focus:outline-none">
            {TOO_MANY_RULES}
          </p>
        )}
      </div>
    </div>
  )
}
