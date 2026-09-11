import { test, expect } from '@playwright/test'

/**
 * The companion script, verified END TO END against the bytes staging serves.
 *
 * 🔑 The unit tests load tracker/script.interactions.js from disk. This loads
 * the MINIFIED artifact over HTTP from pulse-staging, beside the real core
 * script, in a real browser — so it covers the two things the unit tests
 * structurally cannot: that esbuild's minification did not change behaviour,
 * and that the two tags cooperate through window.pulse rather than in theory.
 *
 * ⚠️ js.ciphera.net is the path customers use, but `cdn-scripts` only runs on
 * push to MAIN — so on staging the Next-served mirror is the only artifact
 * there is. That is what makes this verifiable before promotion.
 *
 * No request reaches Pulse: /api/v1/events is intercepted and inspected.
 */

const ORIGIN = process.env.INT_ORIGIN ?? 'https://qa-interactions.example.com'
const STAGING = process.env.SMOKE_BASE_URL ?? 'https://pulse-staging.ciphera.net'

const PAGE = `<!doctype html><html><head><title>Interaction capture</title>
<script defer data-domain="qa-interactions.example.com" data-api="${STAGING}" src="${STAGING}/script.js"></script>
<script defer src="${STAGING}/script.interactions.js"></script>
</head><body>
  <button id="cta">Get started</button>
  <button>Email alice.smith@example.com</button>
  <button>Order 4242 4242 4242 4242</button>
  <div data-pulse-ignore><button>Rename Alice Smith</button></div>
  <button>Typed <input id="typed" value="my recovery phrase"></button>
  <a id="ext" href="https://stripe.com/pricing">Pricing</a>
  <a id="int" href="/docs">Docs</a>
  <p id="prose">Just a paragraph nobody activated</p>
  <form id="contact" name="contactForm" onsubmit="return false"><input name="email" value="a@b.co"><button id="send">Send</button></form>
</body></html>`

type Ev = { name: string; props?: Record<string, string> }

test('the minified companion, served by staging, captures and redacts correctly', async ({ page }) => {
  const sent: Ev[] = []

  await page.route(`${ORIGIN}/`, (r) => r.fulfill({ contentType: 'text/html', body: PAGE }))
  // The outbound destination is stubbed: a real navigation to stripe.com would
  // leave the harness at the mercy of the internet.
  await page.route('https://stripe.com/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<title>stub</title>' }))
  await page.route('**/api/v1/events', async (r) => {
    try {
      sent.push(JSON.parse(r.request().postData() ?? '{}'))
    } catch { /* a malformed body is itself a finding; the assertions below catch it */ }
    await r.fulfill({ status: 202, body: '' })
  })

  // 🔴 THE CORE TRACKER REFUSES TO RUN UNDER AUTOMATION. script.js returns
  // immediately when navigator.webdriver is true (alongside DNT and
  // globalPrivacyControl), so without this override it never installs.
  //
  // ⚠️ AND THE COMPANION DOES *NOT* CHECK webdriver — only the core does. So the
  // failure mode is the dangerous one: the companion attaches its listeners,
  // finds window.pulse.track undefined, and silently sends nothing — making
  // every "this must send nothing" assertion below pass VACUOUSLY. The positive
  // control on the next line is the only thing that can tell the two apart, and
  // it is what turned this into a red run instead of a false green.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })

  await page.goto(`${ORIGIN}/`, { waitUntil: 'load' })
  // Both tags are `defer`, so they have run by `load`. Prove the core is there
  // rather than assume it — everything else depends on window.pulse existing.
  expect(await page.evaluate(() => typeof (window as never as { pulse?: { track?: unknown } }).pulse?.track))
    .toBe('function')

  const clicks = () => sent.filter((e) => e.name === 'pulse_click')

  // ── a labelled control ───────────────────────────────────────────────
  await page.click('#cta')
  await expect.poll(() => clicks().length).toBeGreaterThan(0)
  expect(clicks()[0].props).toMatchObject({ text: 'Get started', tag: 'button', id: 'cta' })

  // ── redaction, on the minified build ────────────────────────────────
  await page.click('text=Email alice.smith@example.com')
  await page.click('text=Order 4242 4242 4242 4242')
  await expect.poll(() => clicks().length).toBeGreaterThanOrEqual(3)
  const labels = clicks().map((c) => c.props?.text)
  expect(labels).toContain('Email [email]')
  expect(labels).toContain('Order [number]')
  // 🔴 The raw values must appear NOWHERE in anything sent.
  const all = JSON.stringify(sent)
  expect(all).not.toContain('alice.smith@example.com')
  expect(all).not.toContain('4242 4242')

  // ── the three refusals ──────────────────────────────────────────────
  const before = sent.length
  await page.click('text=Rename Alice Smith')            // [data-pulse-ignore]
  await page.click('#typed')                             // something typed
  await page.click('#prose')                             // page prose
  await page.waitForTimeout(700)
  expect(sent.length, 'an ignored, typed or prose click must send nothing').toBe(before)
  expect(JSON.stringify(sent)).not.toContain('Alice Smith')
  expect(JSON.stringify(sent)).not.toContain('recovery phrase')

  // ── a form submit carries structure only ────────────────────────────
  await page.click('#send')
  await expect.poll(() => sent.filter((e) => e.name === 'pulse_form_submit').length).toBeGreaterThan(0)
  const form = sent.find((e) => e.name === 'pulse_form_submit')!
  expect(form.props).toMatchObject({ form_id: 'contact', form_name: 'contactForm' })
  const formJson = JSON.stringify(form)
  for (const leaked of ['a@b.co', 'email']) {
    expect(formJson, `a form submit must not carry ${leaked}`).not.toContain(leaked)
  }

  // ── one click is one event ──────────────────────────────────────────
  // 🔴 LAST, deliberately: clicking a link NAVIGATES, which destroys the DOM
  // every assertion above needs. The first version of this test put it in the
  // middle and failed on a missing #send — the page had already left.
  await page.click('#ext')
  await page.waitForTimeout(700)
  const forExt = sent.filter((e) => JSON.stringify(e).includes('stripe.com'))
  expect(forExt.map((e) => e.name), 'an outbound link is the core’s event alone').toEqual(['outbound_link'])

  // eslint-disable-next-line no-console
  console.log('EVENTS SENT:', JSON.stringify(sent.map((e) => [e.name, e.props?.text ?? e.props?.form_id ?? '']), null, 0))
})
