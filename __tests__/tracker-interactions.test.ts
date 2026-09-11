import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * script.interactions.js — the optional companion that records clicks, copies
 * and form submits.
 *
 * 🔑 THESE ARE BEHAVIOURAL, NOT SOURCE-TEXT, ASSERTIONS. The core tracker's
 * tests grep its source, which is right for "does the endpoint URL still say
 * /api/v1/engagement" and useless for "is a person's email redacted out of a
 * button label". This file LOADS the script into jsdom, dispatches real events
 * and asserts on what it tried to send — because every rule in it is a claim
 * about data leaving a browser.
 *
 * The script is deliberately a consumer of the core's public API
 * (window.pulse.track / cleanPath), so the double under test is that API.
 */

const SRC = readFileSync(join(__dirname, '..', 'tracker/script.interactions.js'), 'utf8')

let track: ReturnType<typeof vi.fn>
/** Listeners the script registered, so each test can load it fresh. */
let attached: Array<[string, EventListenerOrEventListenerObject, unknown]> = []

/**
 * Load the script with a given set of attributes on its own <script> tag.
 *
 * `document.currentScript` is how the script reads its own opt-outs; jsdom
 * leaves it null when code is eval'd, which is also the real-world default-on
 * path, so both cases are exercised.
 */
function load(attrs: Record<string, string> = {}, withTag = true) {
  const tag = document.createElement('script')
  for (const [k, v] of Object.entries(attrs)) tag.setAttribute(k, v)
  Object.defineProperty(document, 'currentScript', { value: withTag ? tag : null, configurable: true })

  // Record what it attaches so afterEach can detach it — otherwise a second
  // load in the same file double-fires every handler and every count doubles.
  const real = document.addEventListener.bind(document)
  const spy = vi.spyOn(document, 'addEventListener').mockImplementation(((t: string, h: never, o: never) => {
    attached.push([t, h, o])
    return real(t, h, o)
  }) as typeof document.addEventListener)

  new Function(SRC)()
  spy.mockRestore()
  Object.defineProperty(document, 'currentScript', { value: null, configurable: true })
}

beforeEach(() => {
  track = vi.fn()
  ;(window as unknown as { pulse: unknown }).pulse = { track, cleanPath: () => '/the/page' }
  document.body.innerHTML = ''
})

afterEach(() => {
  for (const [t, h, o] of attached) document.removeEventListener(t, h, o as never)
  attached = []
  delete (window as unknown as { pulse?: unknown }).pulse
})

/** The props of the single call made, for the given event name. */
function propsOf(name: string): Record<string, string> {
  const call = track.mock.calls.find((c) => c[0] === name)
  expect(call, `expected a ${name} event; got ${JSON.stringify(track.mock.calls)}`).toBeTruthy()
  return call![1] as Record<string, string>
}

describe('clicks', () => {
  it('records an activatable control by its label, tag and id', () => {
    load()
    document.body.innerHTML = '<button id="cta">  Get   started </button>'
    document.querySelector('button')!.click()
    expect(propsOf('pulse_click')).toEqual({
      text: 'Get started', // whitespace collapsed
      tag: 'button',
      id: 'cta',
      page_path: '/the/page',
    })
  })

  it('records a click on a child of the control, not the child itself', () => {
    load()
    document.body.innerHTML = '<button><span class="i">Save</span></button>'
    document.querySelector('span')!.click()
    expect(propsOf('pulse_click').tag).toBe('button')
  })

  it('records role=button, which is how most design systems ship a button', () => {
    load()
    document.body.innerHTML = '<div role="button">Open</div>'
    ;(document.querySelector('div[role]') as HTMLElement).click()
    expect(propsOf('pulse_click').text).toBe('Open')
  })

  it('prefers aria-label, which is the accessible name a screen reader gets', () => {
    load()
    document.body.innerHTML = '<button aria-label="Close dialog">×</button>'
    document.querySelector('button')!.click()
    expect(propsOf('pulse_click').text).toBe('Close dialog')
  })

  /**
   * 🔴 THE WELDED LABEL. `textContent` concatenates every descendant text node
   * with NO separator, so a card-shaped link records as one run-together word.
   *
   * This is the exact markup of a ciphera.net/blog card, and the exact string it
   * produced in production on 11-09-2026:
   *
   *     text: "Privacy7 min readPulse Is Free for Open-Source Projects and …"
   *
   * It was invisible while the trail rendered events as property chips and became
   * unmissable the moment round 7 started reading them as sentences.
   *
   * MUTATION CHECK: put `hit.textContent` back and this goes red with the welded
   * string. The two assertions are deliberate — the negative one alone would pass
   * against a label of "", and the positive one alone would pass against
   * textContent if the fixture happened to have spaces at its node boundaries.
   */
  it('joins a card link\u2019s parts with spaces instead of welding them', () => {
    load()
    document.body.innerHTML =
      '<a href="/blog/x"><span>Privacy</span><span>7 min read</span>' +
      '<h3>Pulse Is Free for Open-Source Projects</h3></a>'
    ;(document.querySelector('a') as HTMLElement).click()
    const text = propsOf('pulse_click').text
    expect(text).toBe('Privacy 7 min read Pulse Is Free for Open-Source Projects')
    expect(text).not.toContain('Privacy7')
  })

  it('leaves a label that was already one text node exactly as it was', () => {
    // The control shot. A fix that inserted separators everywhere would show up
    // here as "Save  changes" or a leading space.
    load()
    document.body.innerHTML = '<button>Save changes</button>'
    document.querySelector('button')!.click()
    expect(propsOf('pulse_click').text).toBe('Save changes')
  })

  it('still prefers aria-label over the joined text', () => {
    load()
    document.body.innerHTML = '<a aria-label="Read the post"><span>Privacy</span><span>7 min read</span></a>'
    ;(document.querySelector('a') as HTMLElement).click()
    expect(propsOf('pulse_click').text).toBe('Read the post')
  })

  it('ignores a click on page prose — that would be capturing content', () => {
    load()
    document.body.innerHTML = '<p>Just a paragraph of text</p>'
    ;(document.querySelector('p') as HTMLElement).click()
    expect(track).not.toHaveBeenCalled()
  })

  it('ignores an unlabelled control, which describes nothing', () => {
    load()
    document.body.innerHTML = '<button></button>'
    document.querySelector('button')!.click()
    expect(track).not.toHaveBeenCalled()
  })

  // 🔴 The privacy rules. Each of these is a distinct way page content could
  // otherwise reach the analytics store.
  it('redacts an email out of a label', () => {
    load()
    document.body.innerHTML = '<button>Email alice.smith@example.com</button>'
    document.querySelector('button')!.click()
    expect(propsOf('pulse_click').text).toBe('Email [email]')
  })

  it('redacts a long digit run — an order or card number', () => {
    load()
    document.body.innerHTML = '<button>Order 4242 4242 4242 4242</button>'
    document.querySelector('button')!.click()
    expect(propsOf('pulse_click').text).toBe('Order [number]')
  })

  it('caps a long label at 60 characters with an ellipsis', () => {
    load()
    const long = 'x'.repeat(200)
    document.body.innerHTML = `<button>${long}</button>`
    document.querySelector('button')!.click()
    const t = propsOf('pulse_click').text
    expect(t).toHaveLength(61) // 60 + the ellipsis
    expect(t.endsWith('…')).toBe(true)
  })

  it('records nothing under [data-pulse-ignore], at any depth', () => {
    load()
    document.body.innerHTML = '<div data-pulse-ignore><section><button>Rename Alice Smith</button></section></div>'
    document.querySelector('button')!.click()
    expect(track).not.toHaveBeenCalled()
  })

  /**
   * ⚠️ THE BUTTON MUST HAVE A LABEL for this test to mean anything. The first
   * version wrapped a bare `<input>` in a textless button, so it passed because
   * the label was empty — not because the input guard fired. Mutation-testing
   * found it: removing the guard left the test green. With "Save" present, the
   * guard is the only thing that can stop the event.
   */
  it('records nothing typed — a click inside an input or contenteditable', () => {
    load()
    document.body.innerHTML = '<button>Save <input value="secret"></button>'
    ;(document.querySelector('input') as HTMLElement).click()
    expect(track).not.toHaveBeenCalled()
  })

  it('records nothing from inside a contenteditable region', () => {
    load()
    document.body.innerHTML = '<div role="button">Publish <span contenteditable="true">draft text</span></div>'
    ;(document.querySelector('span') as HTMLElement).click()
    expect(track).not.toHaveBeenCalled()
  })

  /**
   * 🔑 The core script already records an outbound <a> as outbound_link or
   * file_download. Recording it here too would turn one click into two events
   * and inflate every click count on every site with external links.
   */
  it('leaves an OUTBOUND link to the core script, so one click is one event', () => {
    load()
    document.body.innerHTML = '<a href="https://stripe.com/pricing">Pricing</a>'
    ;(document.querySelector('a') as HTMLElement).click()
    expect(track).not.toHaveBeenCalled()
  })

  it('still records an INTERNAL link, which the core ignores', () => {
    load()
    document.body.innerHTML = `<a href="${location.origin}/docs">Docs</a>`
    ;(document.querySelector('a') as HTMLElement).click()
    expect(propsOf('pulse_click')).toMatchObject({ text: 'Docs', tag: 'a' })
  })
})

describe('copies', () => {
  /**
   * jsdom's Selection is partial, so it is stubbed — and the stub is kept to
   * EXACTLY the three members the script touches (isCollapsed, anchorNode, and
   * String(sel)), so it cannot hide a wrong call.
   */
  function select(text: string, node: Node | null) {
    ;(window as unknown as { getSelection: () => unknown }).getSelection = () => ({
      isCollapsed: text.length === 0,
      anchorNode: node,
      toString: () => text,
    })
  }

  it('records HOW MUCH was copied and from what, never the text', () => {
    load()
    document.body.innerHTML = '<p id="t">Plausible and Umami track the same thing</p>'
    const p = document.querySelector('p')!
    select('Plausible and Umami', p)
    document.dispatchEvent(new Event('copy'))
    const props = propsOf('pulse_copy')
    expect(props).toEqual({ chars: '19', source_tag: 'p', page_path: '/the/page' })
    // 🔴 The copied text must appear NOWHERE in the payload.
    expect(JSON.stringify(props)).not.toContain('Plausible')
  })

  it('records nothing for an empty or collapsed selection', () => {
    load()
    select('', document.body)
    document.dispatchEvent(new Event('copy'))
    expect(track).not.toHaveBeenCalled()
  })

  it('records nothing when the selection is under [data-pulse-ignore]', () => {
    load()
    document.body.innerHTML = '<div data-pulse-ignore><p>account number here</p></div>'
    select('account number here', document.querySelector('p'))
    document.dispatchEvent(new Event('copy'))
    expect(track).not.toHaveBeenCalled()
  })

  it('records nothing copied out of an input — that is something typed', () => {
    load()
    document.body.innerHTML = '<input value="my recovery phrase">'
    select('my recovery phrase', document.querySelector('input'))
    document.dispatchEvent(new Event('copy'))
    expect(track).not.toHaveBeenCalled()
  })
})

describe('form submits', () => {
  it('records the form STRUCTURE — never a field value or a field name', () => {
    load()
    document.body.innerHTML =
      '<form id="contact" name="contactForm"><input name="email" value="a@b.co"><input name="ssn" value="123"><button>Send</button></form>'
    const f = document.querySelector('form')!
    f.dispatchEvent(new Event('submit', { bubbles: true }))
    const props = propsOf('pulse_form_submit')
    expect(props).toEqual({ fields: '3', form_id: 'contact', form_name: 'contactForm', page_path: '/the/page' })
    const json = JSON.stringify(props)
    for (const leaked of ['a@b.co', 'ssn', 'email', '123']) {
      expect(json, `a form submit must not carry ${leaked}`).not.toContain(leaked)
    }
  })

  it('records a form with neither id nor name, without empty keys', () => {
    load()
    document.body.innerHTML = '<form><input><button>Go</button></form>'
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true }))
    expect(propsOf('pulse_form_submit')).toEqual({ fields: '2', page_path: '/the/page' })
  })

  it('honours [data-pulse-ignore] on the form and above it', () => {
    load()
    document.body.innerHTML = '<div data-pulse-ignore><form><input><button>Go</button></form></div>'
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true }))
    expect(track).not.toHaveBeenCalled()
  })
})

describe('opt-outs and safety', () => {
  it('each capture type can be switched off on its own tag', () => {
    load({ 'data-no-clicks': '' })
    document.body.innerHTML = '<button>Go</button><form><input></form>'
    document.querySelector('button')!.click()
    expect(track).not.toHaveBeenCalled()
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true }))
    expect(propsOf('pulse_form_submit')).toBeTruthy()
  })

  it('attaches nothing at all when every type is off', () => {
    load({ 'data-no-clicks': '', 'data-no-copy': '', 'data-no-forms': '' })
    expect(attached).toHaveLength(0)
  })

  /**
   * 🔴 The two tags may be in either order, and the core may never arrive
   * (blocked, 404, a site that opted out). Guarding at FIRE time rather than
   * load time is what makes that safe — and a thrown error inside a capture
   * handler would surface on a customer's site, which this must never do.
   */
  it('does not throw when the core script is absent', () => {
    delete (window as unknown as { pulse?: unknown }).pulse
    load()
    document.body.innerHTML = '<button>Go</button>'
    expect(() => document.querySelector('button')!.click()).not.toThrow()
  })

  it('does not throw when the core is present but exposes no track()', () => {
    ;(window as unknown as { pulse: unknown }).pulse = {}
    load()
    document.body.innerHTML = '<button>Go</button>'
    expect(() => document.querySelector('button')!.click()).not.toThrow()
  })
})
