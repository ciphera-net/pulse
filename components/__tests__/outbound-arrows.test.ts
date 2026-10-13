import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// PUL-22 (13-10-2026): every outbound-link arrow turns orange (`brand-ink`,
// Facet's token for orange text and icons) while hovered. A SOURCE SCAN, so a
// new outbound arrow cannot ship with a grey hover without failing here: every
// `target="_blank"` anchor whose body draws an arrow glyph must carry a
// `hover:text-brand-ink` or `group-hover:text-brand-ink`.

const ROOT = path.resolve(__dirname, '../..')
const ARROW = /\b(ArrowSquareOut|ArrowUpRight|ArrowUpRightIcon|ExternalLinkIcon)\b/

// Allowed exceptions, each with its reason.
const EXEMPT: Record<string, string> = {
  // A FILLED primary button: its fill is the brand orange itself, so an orange
  // arrow on it would vanish. The arrow keeps the button's dark foreground.
  'components/sites/ScriptSetupBlock.tsx': 'arrow on an orange-filled button',
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') out.push(...sourceFiles(rel)) }
    else if (/\.tsx$/.test(e.name)) out.push(rel)
  }
  return out
}

/** Every <a …>…</a> (or <Link …>…</Link>) block that opens a new tab. */
function outboundAnchors(src: string): string[] {
  const out: string[] = []
  const re = /<(a|Link)\b[\s\S]*?<\/\1>/g
  for (const m of src.matchAll(re)) if (/target="_blank"/.test(m[0])) out.push(m[0])
  return out
}

describe('outbound-link arrows turn orange on hover (PUL-22)', () => {
  const files = [...sourceFiles('components'), ...sourceFiles('app')]

  it('finds the arrows it is meant to guard (a positive control)', () => {
    const withArrows = files.filter((f) => outboundAnchors(fs.readFileSync(path.join(ROOT, f), 'utf8')).some((a) => ARROW.test(a)))
    // Referrers, Content, the footer, the growth report, the install snippet CTA.
    for (const f of ['components/dashboard/Sources.tsx', 'components/dashboard/ContentStats.tsx', 'components/Footer.tsx', 'components/settings/export/GrowthReportFlow.tsx', 'components/sites/ScriptSetupBlock.tsx']) {
      expect(withArrows).toContain(f)
    }
  })

  it('every arrow in an outbound link carries a brand-ink hover', () => {
    const offenders: string[] = []
    for (const f of files) {
      if (EXEMPT[f]) continue
      for (const a of outboundAnchors(fs.readFileSync(path.join(ROOT, f), 'utf8'))) {
        if (!ARROW.test(a)) continue
        if (!/(?:^|\s|")(?:group-)?hover:text-brand-ink\b/.test(a)) offenders.push(`${f}: ${a.split('\n')[0].trim().slice(0, 80)}`)
      }
    }
    expect(offenders, offenders.join(' · ')).toEqual([])
  })

  it('an arrow coloured by group-hover sits in an anchor that declares `group`', () => {
    // Otherwise the nearest `group` is some ancestor (a dashboard row is one),
    // and the arrow would turn orange when that ancestor is hovered instead.
    const missing: string[] = []
    for (const f of files) {
      for (const a of outboundAnchors(fs.readFileSync(path.join(ROOT, f), 'utf8'))) {
        if (!ARROW.test(a) || !/group-hover:text-brand-ink/.test(a)) continue
        const openTag = a.slice(0, a.indexOf('>') + 1)
        if (!/className=[{"`'][^>]*\bgroup\b/.test(openTag)) missing.push(f)
      }
    }
    expect(missing).toEqual([])
  })
})
