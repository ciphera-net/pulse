import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'

/**
 * The tracker script is the one file in this repo that runs on other people's
 * websites, and it fails silently by design — sendBeacon reports nothing, and the
 * fetch fallback swallows its own errors so a tracked page is never disturbed. That
 * makes a wrong endpoint invisible: no console error, no failed build, just an
 * engagement metric that stops arriving and a dashboard that still looks populated
 * because pageviews are unaffected.
 *
 * These assertions are cheap and they pin the thing that cost us the data.
 */

const ROOT = join(__dirname, '..')
const script = readFileSync(join(ROOT, 'tracker/script.js'), 'utf8')

/**
 * Comments are stripped before asserting on endpoints. The comment above the beacon
 * constant has to name the blocked path to explain why the constant exists, and an
 * assertion that forbade the string outright would force that explanation out of the
 * file — trading the reason for the rule. Only executable code is checked.
 *
 * Whole-line comments only: this file writes every comment on its own line as `// *`,
 * and a naive trailing-comment strip would eat the `//` in a URL literal.
 */
const code = script
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n')

describe('tracker script endpoints', () => {
  // * EasyPrivacy line 388 is the bare substring rule "/api/v1/metrics" — no domain
  // * anchor, no options — so it matches this URL on any host, including a customer's
  // * own domain behind the WordPress proxy. uBlock Origin ships EasyPrivacy by
  // * default and Brave Shields uses it, so the beacon is cancelled client-side for a
  // * large share of real visitors while the pageview lands normally.
  // * Analysis: Pulse/docs/audits/26-08-2026-psi-err-blocked-by-client-metrics.md
  it('does not post the engagement beacon to a filter-listed path', () => {
    expect(code).not.toContain('/api/v1/metrics')
  })

  it('posts the engagement beacon to /api/v1/engagement', () => {
    expect(code).toContain("var ENGAGEMENT_PATH = '/api/v1/engagement'")
    // * Every send site must go through the constant. A reintroduced literal would
    // * pass the assertion above while sending somewhere else.
    expect(code).toContain('apiUrl + ENGAGEMENT_PATH')
    // * v1.2.0: one beacon() function carries both transports (sendBeacon, keepalive
    // * fetch), so exactly two send sites remain and both go through the constant.
    expect(code.match(/apiUrl \+ ENGAGEMENT_PATH/g)).toHaveLength(2)
  })

  // * Two call sites: the pageview in trackPageview and the custom event in
  // * trackCustomEvent. The count is pinned because `toContain` passes while either
  // * one is intact — breaking exactly one endpoint is the realistic mistake, and it
  // * would take out goals and outbound-link tracking with nothing to show for it.
  it('still sends pageviews and custom events to /api/v1/events', () => {
    expect(code.match(/apiUrl \+ '\/api\/v1\/events'/g)).toHaveLength(2)
  })
})

describe('versioned script manifest', () => {
  // * public/script-versions.json is imported by ScriptSetupBlock at build time and is
  // * the only source for the SRI-pinned embed tag. Bumping SCRIPT_VERSION without
  // * re-running `npm run build:scripts` leaves the manifest describing the previous
  // * version, and the snippet UI would hand customers a stale pin.
  it('agrees with SCRIPT_VERSION in build-scripts.mjs', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'public/script-versions.json'), 'utf8'))
    const builder = readFileSync(join(ROOT, 'scripts/build-scripts.mjs'), 'utf8')

    const declared = builder.match(/const SCRIPT_VERSION = '([^']+)'/)?.[1]
    expect(declared, 'SCRIPT_VERSION not found in scripts/build-scripts.mjs').toBeTruthy()
    expect(manifest.version).toBe(declared)
    expect(manifest.files['script.js'].path).toBe(`/v${declared}/script.js`)
  })

  // * A pinned tag carries integrity="<sha384>"; if the hash is absent or malformed the
  // * browser refuses to execute the script at all, which costs that customer every
  // * metric rather than just the engagement beacon.
  it('carries a well-formed sha384 for the pinned artifact', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'public/script-versions.json'), 'utf8'))
    expect(manifest.files['script.js'].sha384).toMatch(/^sha384-[A-Za-z0-9+/]{64}={0,2}$/)
  })
})


/**
 * The SERVED artifact, as opposed to the source above.
 *
 * 🔴 Until 05-09-2026 these were the same file, and that was the bug. The deploy
 * uploaded the unminified source to js.ciphera.net/script.js (22,233 B raw /
 * 7,668 B gzipped) while scripts/build-scripts.mjs enforced its 3,072 B budget
 * against the minified VERSIONED sibling — an artifact a customer reaches only by
 * toggling SRI on, which defaults to false. A size budget existed, passed on every
 * build, and never once measured the bytes customers download; ~35 published
 * marketing claims drifted away from reality with nothing to catch them.
 *
 * public/script.js is now BUILT from tracker/script.js and committed, because the
 * deploy step is bare alpine with no node and uploads it verbatim.
 *
 * Analysis: Pulse/docs/plans/05-09-2026-script-size-claim-durability.md
 */
const built = readFileSync(join(ROOT, 'public/script.js'))
const debugCopy = readFileSync(join(ROOT, 'public/script.debug.js'), 'utf8')

// * Kept in step with GZIP_BUDGET in scripts/build-scripts.mjs. Duplicated on
// * purpose rather than imported: this number is PUBLISHED marketing copy
// * ("under 3 KB gzipped — the build fails if it exceeds it"), so raising it must
// * break two places and force somebody to go and look at the website.
const GZIP_CEILING = 3072

describe('the served tracking script', () => {
  it('is the minified build, not the readable source', () => {
    // A hand-edited public/script.js is the regression this exists to catch: it
    // would sail past every other assertion in this file, because they all read
    // tracker/script.js.
    expect(built.length).toBeLessThan(Buffer.byteLength(script, 'utf8'))
    expect(built.toString('utf8')).not.toContain('\n// *')
  })

  it('stays under the 3 KB gzipped ceiling the marketing copy publishes', () => {
    const gz = gzipSync(built, { level: 9 }).length
    // Reported either way: a passing test that prints the number is how the next
    // person updating the copy finds out what to write.
    expect(gz, `served script.js is ${gz} B gzipped (ceiling ${GZIP_CEILING} B)`)
      .toBeLessThanOrEqual(GZIP_CEILING)
  })

  it('publishes the readable source beside it, byte-for-byte', () => {
    // script.debug.js is what buys back debuggability on a customer's site. If it
    // ever drifts from the source it is worse than absent, because it would be a
    // plausible-looking script that is not what runs.
    expect(debugCopy).toBe(script)
  })
})
