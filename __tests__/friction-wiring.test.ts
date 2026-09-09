import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Wiring guards for three friction findings whose claims live in code SHAPE
 * rather than in behaviour a unit test can reach without standing up the whole
 * marketing shell or the AuthProvider (08-09-2026).
 *
 * Source-text with comments stripped — stripping matters, because the files'
 * own comments quote the forbidden pattern in order to explain it.
 */
const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

function stripComments(src: string): string {
  // 🔴 LINE COMMENTS FIRST, THEN BLOCKS — the order is load-bearing. A line
  // comment can contain `/*` in ordinary prose (context.tsx has
  // "// * /settings/* is EXEMPT"), and stripping blocks first treats that as
  // an opening delimiter: it swallowed 113 lines, including the very code
  // these assertions are about, and the guard then failed on a file that was
  // correct. Removing whole-line comments before looking for blocks makes that
  // impossible.
  const withoutLines = src
    .split('\n')
    .map((line) => line.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/.*$/, ''))
    .join('\n')
  return withoutLines.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

// ---------------------------------------------------------------------------
// #2 — a control labelled "try" or "get started" opens SIGNUP.
//
// It opened the OPAQUE sign-in form, which greets a first-timer with "Welcome
// back" and asks for a password they never set; the only way forward was a
// "Create Ciphera ID" link at the bottom. The header nav always split these
// two correctly, which is why it went unnoticed.
// ---------------------------------------------------------------------------
describe('every get-started CTA opens signup, not sign-in', () => {
  const surfaces: Array<[string, string]> = [
    ['components/marketing/HeroCtas.tsx', 'the homepage hero'],
    ['components/marketing/HomeClosingCta.tsx', 'the closing CTA (homepage, /pricing, /vs)'],
    ['app/features/page.tsx', 'the features page closer'],
  ]

  for (const [path, what] of surfaces) {
    it(`${what} calls initiateSignupFlow`, () => {
      const src = stripComments(read(path))
      expect(src, `${path} must send a first-timer to signup`).toMatch(/initiateSignupFlow\(\)/)
      expect(src, `${path} must not send a first-timer to the sign-in form`)
        .not.toMatch(/initiateOAuthFlow\(\)/)
    })
  }

  it('both pricing CTAs do too, and the paid one keeps its stored plan', () => {
    const src = stripComments(read('components/PricingSection.tsx'))
    expect(src).not.toMatch(/initiateOAuthFlow\(\)/)
    expect((src.match(/initiateSignupFlow\(\)/g) ?? []).length).toBe(2)
    // The plan the visitor picked must still survive the round trip. It is
    // stored through lib/auth/return-target now (the slot gained a lifetime,
    // audit §4n) — the guard follows the writer, not the key's spelling.
    expect(src).toMatch(/rememberReturnTarget\(/)
  })

  it('the header still offers a real sign-in — this is not a blanket swap', () => {
    const src = stripComments(read('components/marketing/Header.tsx'))
    expect(src).toMatch(/initiateOAuthFlow\(\)/)
    expect(src).toMatch(/initiateSignupFlow\(\)/)
  })
})

// ---------------------------------------------------------------------------
// #13 — accepting an invite must not be interrupted by your OWN unfinished
// workspace. The zero-orgs branch has always exempted /join; the has-orgs
// branch did not, so somebody with an abandoned workspace who clicked a
// colleague's invite was bounced into their own wizard and accepted nothing.
// ---------------------------------------------------------------------------
describe('the onboarding wall exempts /join in BOTH branches', () => {
  const src = stripComments(read('lib/auth/context.tsx'))

  it('exempts it where the account already has a workspace', () => {
    const idx = src.indexOf('isSubjectToOnboardingWall(userRole)')
    expect(idx, 'the has-orgs wall must exist').toBeGreaterThan(-1)
    const condition = src.slice(idx, idx + 400)
    expect(condition).toMatch(/!pathname\?\.startsWith\('\/join'\)/)
  })

  it('and still exempts it where it has none', () => {
    expect((src.match(/startsWith\('\/join'\)/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// #15 — the dashboard's install buttons stay in the app.
//
// They left for /installation, a MARKETING page whose snippet is written with
// `data-domain="your-site.com"` — so the one thing the person needed, their
// own snippet, was the one thing not on the page they were sent to.
// ---------------------------------------------------------------------------
describe('install CTAs point at the real snippet', () => {
  // ⚠️ SIX, not the five this batch started with. TopReferrers was deleted on
  // main while this branch was open (#607, "Sources is one card again") and
  // Sources took its place; Outbound is new in the same change and arrived
  // carrying the same /installation link. A list like this goes stale the
  // moment a card is renamed — hence the sweep below, which is the real guard.
  const panels = [
    'components/dashboard/Sources.tsx',
    'components/dashboard/Outbound.tsx',
    'components/dashboard/TechSpecs.tsx',
    'components/dashboard/Locations.tsx',
    'components/dashboard/ContentStats.tsx',
    'components/dashboard/ScrollDepthBars.tsx',
  ]

  for (const path of panels) {
    it(`${path.split('/').pop()} sends you to your own site's settings`, () => {
      const src = stripComments(read(path))
      expect(src).toMatch(/href: '\/settings\/site\/general'/)
      expect(src, 'the marketing page shows data-domain="your-site.com"')
        .not.toMatch(/href: '\/installation'/)
      // 🔴 And it must say WHICH site, or the settings page opens on whichever
      // one happened to be remembered last — the same key InstallBanner writes.
      expect(src).toMatch(/pulse_active_site/)
    })
  }

  it('NO dashboard panel anywhere still points an install button at /installation', () => {
    // The list above names what exists today; this catches the next card
    // somebody adds — or renames — with the marketing link copied in.
    const dir = join(ROOT, 'components/dashboard')
    const stale: string[] = []
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.tsx')) continue
      const src = stripComments(readFileSync(join(dir, name), 'utf8'))
      if (/label: 'Install tracking script'[\s\S]{0,80}href: '\/installation'/.test(src)) {
        stale.push(name)
      }
    }
    expect(stale, 'these send you to a marketing page whose snippet says your-site.com').toEqual([])
  })

  it("the goals panel keeps a docs link, because that is what its copy is about", () => {
    // Its label is "Read the docs" over copy about pulse.track('event').
    // /settings/site/general shows the snippet and says nothing about events.
    const src = stripComments(read('components/dashboard/GoalStats.tsx'))
    expect(src).toMatch(/help\.ciphera\.net\/docs\/pulse\/custom-events/)
    expect(src).not.toMatch(/href: '\/installation'/)
  })
})
