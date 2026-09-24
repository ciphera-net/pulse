/**
 * The light-theme guard (PULSE-31, design §4.4 revision E1). A RATCHET.
 *
 * The themed ramps (styles/themeRamp.ts) make every `neutral-*`, `white` and
 * status-hue class follow the theme. What they CANNOT reach is a colour written
 * as a literal — `#262626`, `rgba(255,255,255,.1)`, `bg-[#050505]` — or a
 * Tailwind colour family that is not themed (`gray-*`, `slate-*`, `pink-*`, …).
 * Each of those renders the same in light and dark, which on a light page is
 * usually a dark smear or invisible text, and nothing else would notice.
 *
 * Per file, the count of such literals may FALL but never RISE. A brand or
 * status colour that is genuinely theme-independent (brand orange, a status
 * green in a chart) is allowed by raising that file's number in the baseline, in
 * the same PR, where a reviewer sees it. Regenerate after a deliberate change:
 *   UPDATE_THEME_BASELINE=1 npx vitest run styles/__tests__/theme-guard.test.ts
 *
 * Comments are stripped first: prose must never count, in either direction.
 * Excluded: tests, lib/integrations.tsx (third-party brand colours), and
 * components/marketing/** (marketing stays dark by design, D1).
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { THEMED_HUES } from '../themeRamp'

const ROOT = path.join(__dirname, '..', '..')
const BASELINE = path.join(__dirname, 'theme-guard.baseline.json')
const SCAN = ['app', 'components', 'lib']
const SKIP_DIR = new Set(['node_modules', '.next', '.worktrees', '__tests__'])
const SKIP_FILE = [/^lib\/integrations\.tsx$/, /^components\/marketing\//, /\.test\.tsx?$/]

const TAILWIND_FAMILIES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald',
  'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
]
const UNTHEMED = TAILWIND_FAMILIES.filter((f) => f !== 'neutral' && !(THEMED_HUES as readonly string[]).includes(f))

const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*\d/g
const UNTHEMED_CLASS = new RegExp(`(?<![\\w-])(?:[a-z-]+:)*(?:text|bg|border|fill|stroke|ring|from|to|via|divide|outline|decoration|placeholder|shadow)-(?:${UNTHEMED.join('|')})-\\d{2,3}\\b`, 'g')

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1')
}

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
}

function measure(): Record<string, number> {
  const files: string[] = []
  for (const d of SCAN) walk(path.join(ROOT, d), files)
  const counts: Record<string, number> = {}
  for (const full of files) {
    const rel = path.relative(ROOT, full).split(path.sep).join('/')
    if (SKIP_FILE.some((re) => re.test(rel))) continue
    const code = stripComments(readFileSync(full, 'utf8'))
    const n = (code.match(LITERAL)?.length ?? 0) + (code.match(UNTHEMED_CLASS)?.length ?? 0)
    if (n > 0) counts[rel] = n
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
}

describe('theme guard (ratchet)', () => {
  const now = measure()

  if (process.env.UPDATE_THEME_BASELINE === '1') {
    writeFileSync(BASELINE, JSON.stringify(now, null, 2) + '\n')
  }
  const base: Record<string, number> = JSON.parse(readFileSync(BASELINE, 'utf8'))

  it('no file gains a hardcoded colour or an unthemed colour class', () => {
    const grew = Object.entries(now)
      .filter(([f, n]) => n > (base[f] ?? 0))
      .map(([f, n]) => `${f}: ${base[f] ?? 0} -> ${n}`)
    expect(grew, 'colour literals the light theme cannot reach — use a themed class or a CSS variable').toEqual([])
  })

  it('the scanner still finds what it is looking for (control)', () => {
    const probe = stripComments(`const a = '#262626'; // '#ffffff' in a comment\n<div className="bg-slate-800 text-red-400 bg-[#050505]" />`)
    expect(probe.match(LITERAL)).toEqual(['#262626', '#050505'])
    expect(probe.match(UNTHEMED_CLASS)).toEqual(['bg-slate-800'])
  })
})
