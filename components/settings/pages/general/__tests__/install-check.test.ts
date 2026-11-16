import { describe, expect, it } from 'vitest'
import type { InstallCheckState, InstallCheckStep } from '@/lib/api/install-check'
import { checkView } from '../install-check'

const NOW = Date.parse('2026-11-16T12:00:30Z')
const done = (steps: InstallCheckStep[], passed = false): InstallCheckState => ({
  status: 'done',
  started_at: '2026-11-16T12:00:00Z',
  finished_at: '2026-11-16T12:00:05Z',
  passed,
  steps,
})
const skip = (key: InstallCheckStep['key']): InstallCheckStep => ({ key, state: 'skipped' })

describe('checkView', () => {
  it('shows nothing before any check', () => {
    expect(checkView(undefined, 'example.com', NOW)).toBeNull()
    expect(checkView({ status: 'none' }, 'example.com', NOW)).toBeNull()
  })

  it('lists the four steps while it runs', () => {
    const v = checkView({ status: 'running' }, 'example.com', NOW)!
    expect(v.head).toBe('Opening example.com in a test browser. This takes about 20 seconds.')
    expect(v.lines.map((l) => [l.label, l.tone, l.caption])).toEqual([
      ['Your homepage opens', 'waiting', 'Checking…'],
      ['The script is on the page', 'waiting', 'Checking…'],
      ['The script loads', 'waiting', 'Checking…'],
      ['A visit reaches Pulse', 'waiting', 'Checking…'],
    ])
  })

  it('says a pass in four lines, with the time it was checked', () => {
    const v = checkView(
      done(
        [
          { key: 'page', state: 'pass', status: 200, ms: 412 },
          { key: 'tag', state: 'pass' },
          { key: 'script', state: 'pass' },
          { key: 'visit', state: 'pass' },
        ],
        true,
      ),
      'example.com',
      NOW,
    )!
    expect(v.head).toBe("Checked just now. Test visits aren't counted.")
    expect(v.lines.map((l) => l.caption)).toEqual([
      'https://example.com answered in 0.4 s.',
      'Set up for example.com.',
      'It downloaded and started.',
      "The test visit isn't counted.",
    ])
    expect(v.lines.every((l) => l.tone === 'pass' && l.fix === null)).toBe(true)
    expect(v.openScript).toBe(false)
  })

  it('names a tag manager or a script served from the site itself', () => {
    const tag = (via: 'config' | 'other') =>
      checkView(done([{ key: 'page', state: 'pass' }, { key: 'tag', state: 'pass', via }]), 'example.com', NOW)!.lines[1].caption
    expect(tag('config')).toBe('Added through a tag manager.')
    expect(tag('other')).toBe("Served from your site's own address.")
  })

  it('points a policy block at the directives and opens the script', () => {
    const v = checkView(
      done([{ key: 'page', state: 'pass' }, { key: 'tag', state: 'pass' }, { key: 'script', state: 'fail', cause: 'blocked_csp' }, skip('visit')]),
      'example.com',
      NOW,
    )!
    expect(v.lines[2]).toMatchObject({ tone: 'fail', fix: 'csp', caption: "Your site's Content Security Policy blocks js.ciphera.net. Add the two directives below to it." })
    expect(v.lines[3]).toMatchObject({ tone: 'waiting', caption: 'Not checked', fix: null })
    expect(v.openScript).toBe(true)
  })

  it('has a sentence for every cause', () => {
    const cases: [InstallCheckStep, string][] = [
      [{ key: 'page', state: 'fail', cause: 'unreachable', reason: 'net::ERR_NAME_NOT_RESOLVED' }, "Your homepage didn't answer. Check that https://example.com opens in a browser. The browser said net::ERR_NAME_NOT_RESOLVED."],
      [{ key: 'page', state: 'fail', cause: 'http_status', status: 503 }, 'Your homepage answered with error 503.'],
      [{ key: 'tag', state: 'fail', cause: 'missing' }, "Pulse found no script on your homepage. Add the script below. A script that loads only after a cookie banner is accepted can't be seen by this check."],
      [{ key: 'tag', state: 'fail', cause: 'wrong_domain', found: 'other.com' }, 'The script is set up for other.com. Change its data-domain to example.com.'],
      [{ key: 'script', state: 'fail', cause: 'blocked', reason: 'mixed-content' }, 'The browser refused the script. The browser said mixed-content.'],
      [{ key: 'script', state: 'fail', cause: 'failed', reason: 'net::ERR_CONNECTION_RESET' }, "The script didn't download. The browser said net::ERR_CONNECTION_RESET. Try again in a minute."],
      [{ key: 'script', state: 'fail', cause: 'http_status', status: 404 }, "The script's address answered with error 404."],
      [{ key: 'script', state: 'fail', cause: 'not_loaded' }, 'The script tag is on the page, but the browser never asked for the script.'],
      [{ key: 'visit', state: 'fail', cause: 'not_sent' }, 'The script started but sent no visit within 10 seconds.'],
      [{ key: 'visit', state: 'fail', cause: 'wrong_domain', found: 'shop.example.com' }, 'The visit was sent for shop.example.com. Add data-domain="example.com" to the script.'],
    ]
    for (const [step, want] of cases) {
      const line = checkView(done([step]), 'example.com', NOW)!.lines[0]
      expect(line.caption).toBe(want)
      expect(line.tone).toBe('fail')
    }
  })

  it('says why a check could not run', () => {
    expect(checkView({ status: 'error', error: 'busy' }, 'example.com', NOW)!.head).toBe('The test browser is busy. Try again in a minute.')
    expect(checkView({ status: 'error', error: 'failed' }, 'example.com', NOW)!.head).toBe("The check couldn't run. Try again.")
  })

  it('keeps every sentence free of dashes', () => {
    const all = JSON.stringify(checkView({ status: 'running' }, 'example.com', NOW))
    expect(all).not.toMatch(/[–—]/)
  })
})
