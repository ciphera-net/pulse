import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

// ─────────────────────────────────────────────────────────────────────────────
// A MENU'S ROWS REACH ITS EDGES.
//
// In a dropdown the row under the pointer is painted across its whole box. Where
// the list that holds the rows had padding of its own, the first and the last
// row left a strip of the menu's ground between their highlight and the menu's
// edge: 8 px over "Today" in the date menu, and a strip on every side of the
// site picker's "Add new site" (measured on production, 15-11-2026). Twelve
// lists had it, each with a padding it chose for itself.
//
// The rule has one home: the element that holds a menu's rows carries
// `data-menu-list`, and holds no padding and no gap of its own. A divider
// between two rows has no margin either. Whatever in a menu is not a row (a
// search field, a heading, a note) brings its own room.
//
// This reads the SOURCE, the idiom of frame-wiring.test.ts: the rule is about
// classes on eleven components, most of which need the whole app around them to
// render, and a class is exactly what a re-padded list would add.
//
// The mutations these tests kill: `py-2` (or any padding or gap) back on a marked
// list; a mark removed; the dividers' margins back in the date menu or the select.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd()
const MARK = 'data-menu-list=""'

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue
    const rel = join(dir, name)
    if (statSync(join(ROOT, rel)).isDirectory()) sources(rel, out)
    else if (rel.endsWith('.tsx')) out.push(rel)
  }
  return out
}

/** The JSX opening tag around the character at `at`: from its `<` to its closing `>`, braces balanced. */
function openingTag(text: string, at: number): string {
  let depth = 0
  let start = at
  for (; start >= 0; start--) {
    const c = text[start]
    if (c === '}') depth++
    else if (c === '{') depth--
    else if (c === '<' && depth === 0 && /[A-Za-z]/.test(text[start + 1] ?? '')) break
  }
  depth = 0
  let end = at
  for (; end < text.length; end++) {
    const c = text[end]
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0) break
  }
  return text.slice(start, end + 1)
}

/** Every class written in a tag: the words inside its quotes and template strings, placeholders left out. */
function classesOf(tag: string): string[] {
  const out: string[] = []
  for (const m of tag.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)) {
    const body = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, ' ')
    out.push(...body.split(/\s+/).filter(Boolean))
  }
  return out
}

/** A padding or a gap the list would put between a row and its edge, or between two rows. */
function holdsRoom(token: string): boolean {
  // A class aimed at something INSIDE the list (`[&_[cmdk-group-heading]]:pt-4`) is that thing's own room.
  if (token.includes('[&')) return false
  const utility = token.slice(token.lastIndexOf(':') + 1)
  return /^(p|py|pt|pb|space-y|gap|gap-y)-(?!0$)/.test(utility)
}

interface Marked { file: string; tag: string }
const marked: Marked[] = []
for (const file of [...sources('components'), ...sources('app')]) {
  const text = readFileSync(join(ROOT, file), 'utf8')
  for (let at = text.indexOf(MARK); at !== -1; at = text.indexOf(MARK, at + MARK.length)) {
    marked.push({ file, tag: openingTag(text, at) })
  }
}

describe("a menu's rows reach its edges", () => {
  it('finds every menu list the app has', () => {
    // Twelve lists in eleven files (the site picker has two: its sites, and the row under them). A list that
    // loses its mark leaves the rule; a new menu's list takes it.
    expect(marked.map((m) => m.file).sort()).toEqual([
      'components/dashboard/DashboardShell.tsx',
      'components/dashboard/DashboardShell.tsx',
      'components/dashboard/TabMenu.tsx',
      'components/dashboard/filter/DimensionStage.tsx',
      'components/dashboard/filter/OperatorChip.tsx',
      'components/funnels/FunnelModal.tsx',
      'components/onboarding/OnboardingChip.tsx',
      'components/search/NewQueriesChip.tsx',
      'components/ui/DateRangePicker.tsx',
      'components/ui/command.tsx',
      'components/ui/select.tsx',
      'components/whats-new/WhatsNewButton.tsx',
    ])
  })

  it('reads a real tag, with its classes, for each of them', () => {
    // A scanner that returned nothing would agree with any rule.
    for (const { file, tag } of marked) {
      expect(tag.startsWith('<'), file).toBe(true)
      expect(tag.endsWith('>'), file).toBe(true)
      expect(tag, file).toContain(MARK)
    }
    const operator = marked.find((m) => m.file.endsWith('OperatorChip.tsx'))
    expect(classesOf(operator?.tag ?? '')).toEqual(expect.arrayContaining(['min-w-[180px]', 'bg-popover', 'border', 'shadow-lg']))
    // And it does call a padded list padded.
    expect(classesOf('<div data-menu-list="" className="max-h-72 overflow-y-auto p-1.5">').filter(holdsRoom)).toEqual(['p-1.5'])
    expect(classesOf('<div data-menu-list="" className={`flex flex-col py-2 ${x}`}>').filter(holdsRoom)).toEqual(['py-2'])
    expect(classesOf('<div data-menu-list="" className="p-3 space-y-1 sm:pt-2">').filter(holdsRoom)).toEqual(['p-3', 'space-y-1', 'sm:pt-2'])
  })

  it('holds no padding and no gap on any of them', () => {
    const found = marked.flatMap(({ file, tag }) => classesOf(tag).filter(holdsRoom).map((token) => `${file}: ${token}`))
    expect(found).toEqual([])
  })

  it('puts no margin on a divider between two rows', () => {
    const dates = readFileSync(join(ROOT, 'components/ui/DateRangePicker.tsx'), 'utf8')
    // A section's wrapper is its hairline and nothing else, three times: between sections, over "Custom range…",
    // and over the note (whose own padding is the note's, not a row's).
    expect(dates).toContain("className={i > 0 ? 'border-t border-border' : undefined}")
    expect(dates).toContain('<div className="border-t border-border">')
    expect(dates).not.toMatch(/mt-1\.5 border-t|border-t border-border pt-1\.5/)
    const select = readFileSync(join(ROOT, 'components/ui/select.tsx'), 'utf8')
    expect(select).toContain('className="border-t border-border" role="separator"')
    const palette = readFileSync(join(ROOT, 'components/ui/command.tsx'), 'utf8')
    // The palette's hairline runs its width (it was pulled 4 px past a padded group on both sides).
    expect(palette).toContain('className={cn("h-px bg-white/[0.06]", className)}')
  })

  it("runs the site picker's last row across the picker", () => {
    const shell = readFileSync(join(ROOT, 'components/dashboard/DashboardShell.tsx'), 'utf8')
    const row = shell.slice(shell.indexOf('href="/sites/new"'), shell.indexOf('Add new site'))
    // Its own padding is the row's (the highlight is the row's whole box), as a site's row over it.
    expect(row).toContain('px-4 py-2.5')
    expect(row).toContain('hover:bg-white/[0.06]')
  })
})
