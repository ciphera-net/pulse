import type { InstallCheckState, InstallCheckStep, InstallCheckStepKey } from '@/lib/api/install-check'
import { ago } from './status'

/**
 * The install check's words (option B, 16-11-2026; plan Pulse/docs/plans/16-11-2026-verify-installation-plan.md).
 * The server sends codes and facts; every sentence a customer reads is here, pure, so each one is pinned by a test.
 */

export const STEP_LABELS: Record<InstallCheckStepKey, string> = {
  page: 'Your homepage opens',
  tag: 'The script is on the page',
  script: 'The script loads',
  visit: 'A visit reaches Pulse',
}

const ORDER: InstallCheckStepKey[] = ['page', 'tag', 'script', 'visit']

export interface CheckLine {
  key: InstallCheckStepKey
  label: string
  /** pass: orange check. fail: coral warning. waiting: grey dot. */
  tone: 'pass' | 'fail' | 'waiting'
  caption: string
  /** The docs page the "How to fix it" link after the caption opens, or null for no link. */
  fix: 'csp' | 'troubleshooting' | null
}

export interface CheckView {
  /** The line above the steps. */
  head: string
  lines: CheckLine[]
  /** The script block should open, because a caption points at the directives under the script. */
  openScript: boolean
}

function seconds(ms: number): string {
  return (Math.max(ms, 100) / 1000).toFixed(1)
}

function passCaption(s: InstallCheckStep, domain: string): string {
  switch (s.key) {
    case 'page':
      return s.ms != null ? `https://${domain} answered in ${seconds(s.ms)} s.` : `https://${domain} answered.`
    case 'tag':
      if (s.via === 'config') return 'Added through a tag manager.'
      if (s.via === 'other') return "Served from your site's own address."
      return `Set up for ${domain}.`
    case 'script':
      return 'It downloaded and started.'
    case 'visit':
      return "The test visit isn't counted."
  }
}

function failCaption(s: InstallCheckStep, domain: string): { caption: string; fix: CheckLine['fix'] } {
  const why = s.reason ? ` The browser said ${s.reason}.` : ''
  switch (s.cause) {
    case 'unreachable':
      return { caption: `Your homepage didn't answer. Check that https://${domain} opens in a browser.${why}`, fix: null }
    case 'http_status':
      return s.key === 'page'
        ? { caption: `Your homepage answered with error ${s.status}.`, fix: null }
        : { caption: `The script's address answered with error ${s.status}.`, fix: 'troubleshooting' }
    case 'missing':
      return {
        caption:
          "Pulse found no script on your homepage. Add the script below. A script that loads only after a cookie banner is accepted can't be seen by this check.",
        fix: 'troubleshooting',
      }
    case 'wrong_domain':
      return s.key === 'tag'
        ? { caption: `The script is set up for ${s.found}. Change its data-domain to ${domain}.`, fix: null }
        : { caption: `The visit was sent for ${s.found}. Add data-domain="${domain}" to the script.`, fix: null }
    case 'blocked_csp':
      return { caption: "Your site's Content Security Policy blocks js.ciphera.net. Add the two directives below to it.", fix: 'csp' }
    case 'blocked':
      return { caption: `The browser refused the script.${why}`, fix: 'troubleshooting' }
    case 'failed':
      return { caption: `The script didn't download.${why} Try again in a minute.`, fix: null }
    case 'not_loaded':
      return { caption: 'The script tag is on the page, but the browser never asked for the script.', fix: 'troubleshooting' }
    case 'not_sent':
      return { caption: 'The script started but sent no visit within 10 seconds.', fix: 'troubleshooting' }
    default:
      return { caption: 'This step failed.', fix: 'troubleshooting' }
  }
}

/** What the checklist shows for a state, or null when there is nothing to show (no check yet). */
export function checkView(st: InstallCheckState | undefined, domain: string, now: number = Date.now()): CheckView | null {
  if (!st || st.status === 'none') return null
  if (st.status === 'running') {
    return {
      head: `Opening ${domain} in a test browser. This takes about 20 seconds.`,
      lines: ORDER.map((key): CheckLine => ({ key, label: STEP_LABELS[key], tone: 'waiting', caption: 'Checking…', fix: null })),
      openScript: false,
    }
  }
  if (st.status === 'error') {
    return {
      head: st.error === 'busy' ? 'The test browser is busy. Try again in a minute.' : "The check couldn't run. Try again.",
      lines: [],
      openScript: false,
    }
  }
  const when = st.finished_at ? `Checked ${ago(st.finished_at, now)}.` : 'Checked.'
  const lines = (st.steps ?? []).map((s): CheckLine => {
    const label = STEP_LABELS[s.key] ?? s.key
    if (s.state === 'pass') return { key: s.key, label, tone: 'pass', caption: passCaption(s, domain), fix: null }
    if (s.state === 'skipped') return { key: s.key, label, tone: 'waiting', caption: 'Not checked', fix: null }
    return { key: s.key, label, tone: 'fail', ...failCaption(s, domain) }
  })
  return {
    head: `${when} Test visits aren't counted.`,
    lines,
    openScript: (st.steps ?? []).some((s) => s.state === 'fail' && (s.cause === 'blocked_csp' || s.cause === 'missing')),
  }
}
