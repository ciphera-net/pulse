import type { PageRule } from '@/lib/api/sites'

/** The server refuses more (pulse-backend `internal/api/sites.go`, "Too many page rules (max 50)"). */
export const MAX_RULES = 50

export const RULE_TYPE_OPTIONS: { value: PageRule['type']; label: string }[] = [
  { value: 'exclude', label: 'Leave out' },
  { value: 'group', label: 'Group' },
  { value: 'keep', label: 'Keep separate' },
]

export const PATTERN_PROBLEM = 'Start the address with /.'
export const LABEL_PROBLEM = 'Start it with /, like /orders/:id.'
export const TOO_MANY_RULES = `Use ${MAX_RULES} rules or fewer.`

// A learned parent's `template` is the PARENT in grouped form ("/sites/:id/visitors"), exactly as the backend stores
// it (pagerules.LearnedDynamicParent); ingest replaces only the one segment directly under it with ":id". So the row
// shows the grouped child path (template + "/:id"), and the rule "Keep separate" stages is that path's wildcard form
// (design doc §3.4: each :id segment replaced by *), "/sites/*/visitors/*". Deriving the pattern from the bare template
// wrote "/sites/*/visitors", which matches the parent page alone and pins none of its children.
export function learnedPathFor(template: string): string {
  return `${template.replace(/\/+$/, '')}/:id`
}

export function keepPatternFor(template: string): string {
  return learnedPathFor(template)
    .split('/')
    .map((seg) => (seg === ':id' ? '*' : seg))
    .join('/')
}

/**
 * The rules as they are saved: trimmed, and a label only on a group rule (the server reads a label nowhere else, and
 * a rule switched from Group to Leave out would otherwise carry its old label). The draft and the saved copy are
 * compared in this form, so a stale label is never an unsaved change on its own.
 */
export function cleanRules(rules: PageRule[]): PageRule[] {
  return rules.map((r) =>
    r.type === 'group'
      ? { type: r.type, pattern: r.pattern.trim(), label: (r.label ?? '').trim() }
      : { type: r.type, pattern: r.pattern.trim() },
  )
}

export interface RuleProblems {
  pattern: string | null
  label: string | null
}

/** The checks the server makes (`internal/api/sites.go`), so one unfinished rule never fails the whole save. */
export function ruleProblems(rule: PageRule): RuleProblems {
  return {
    pattern: rule.pattern.trim().startsWith('/') ? null : PATTERN_PROBLEM,
    label: rule.type !== 'group' || (rule.label ?? '').trim().startsWith('/') ? null : LABEL_PROBLEM,
  }
}

export function rulesHaveProblems(rules: PageRule[]): boolean {
  if (rules.length > MAX_RULES) return true
  return rules.some((r) => {
    const p = ruleProblems(r)
    return p.pattern !== null || p.label !== null
  })
}

/** The query parameters as saved: the field's comma-separated text, trimmed, empties dropped. */
export function parseParams(text: string): string[] {
  return text
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
}
