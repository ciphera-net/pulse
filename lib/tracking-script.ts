import { renderSnippet, type Integration } from '@/lib/integrations'

/**
 * The tracking script a site pastes, built from its choices: ONE builder for every surface that shows the script
 * (onboarding's install panel and the General settings page), so the two can never print different tags for the same
 * site. Before the settings overhaul's General page (PUL-42, P2) it lived inside `ScriptSetupBlock`, and a second
 * surface would have meant a second copy: the drift its own comments warn about (the framework path once dropped the
 * flags the raw tag applied).
 */

// * Every copied script names the rolling files, so a site gets each new version without replacing its tag. The option
// * to lock a site to one version (Subresource Integrity) was removed on 07-11-2026; tags pasted with it keep loading
// * the js.ciphera.net/v<version>/ copies, which stay on the CDN.
const ROLLING_BASE = 'https://js.ciphera.net'

/** The core script's opt-outs the script actually reads, in the order they are written. */
export const FEATURE_KEYS = ['scroll', 'outbound', 'downloads'] as const
export type FeatureKey = (typeof FEATURE_KEYS)[number]
const FEATURE_ATTR: Record<FeatureKey, string> = {
  scroll: 'data-no-scroll',
  outbound: 'data-no-outbound',
  downloads: 'data-no-downloads',
}

/** The interactions companion's three kinds, one per `data-no-*` it honours. */
export const INTERACTION_KEYS = ['clicks', 'copy', 'forms'] as const
export type InteractionKey = (typeof INTERACTION_KEYS)[number]
const INTERACTION_ATTR: Record<InteractionKey, string> = {
  clicks: 'data-no-clicks',
  copy: 'data-no-copy',
  forms: 'data-no-forms',
}

/** Everything the script's text depends on besides the domain and the platform. */
export interface ScriptChoices {
  features: Record<FeatureKey, boolean>
  /** The companion tag (clicks, copies and forms): off unless a site opted in. */
  interactions: boolean
  kinds: Record<InteractionKey, boolean>
  /** Positive polarity: on means the browser's signal is respected, off adds `data-ignore-*`. */
  respectDnt: boolean
  respectGpc: boolean
}

/**
 * A site's stored choices, with today's defaults for anything unset: the three features and the three kinds on, the
 * companion off, both privacy signals respected. `undefined` signals mean the server has not sent them yet, which is
 * respecting (true), never false. Keys this builder does not know (`sri`, `storage`, `ttl`) are ignored.
 */
export function choicesFrom(
  sf: Record<string, unknown> | null | undefined,
  respectDnt?: boolean,
  respectGpc?: boolean,
): ScriptChoices {
  const s = sf ?? {}
  const on = (k: string, d: boolean) => (s[k] != null ? Boolean(s[k]) : d)
  return {
    features: { scroll: on('scroll', true), outbound: on('outbound', true), downloads: on('downloads', true) },
    interactions: on('interactions', false),
    kinds: { clicks: on('clicks', true), copy: on('copy', true), forms: on('forms', true) },
    respectDnt: respectDnt ?? true,
    respectGpc: respectGpc ?? true,
  }
}

/**
 * The keys of `script_features` these choices own. A caller MERGES them over the site's stored object, never replaces
 * it: legacy keys (storage, ttl, sri) must survive a save, the stored-but-unread contract of the visitor-recognition
 * and version-lock removals.
 */
export function featuresPayload(c: ScriptChoices): Record<string, unknown> {
  return { ...c.features, interactions: c.interactions, ...c.kinds }
}

/**
 * The `data-*` flags for the core tag: the features switched off, then the privacy signals not respected. One list for
 * the raw tag and every platform's snippet.
 */
export function coreFlags(c: ScriptChoices): string[] {
  return [
    ...FEATURE_KEYS.filter((k) => !c.features[k]).map((k) => FEATURE_ATTR[k]),
    ...(!c.respectDnt ? ['data-ignore-dnt'] : []),
    ...(!c.respectGpc ? ['data-ignore-gpc'] : []),
  ]
}

/**
 * The companion's own opt-outs, or `null` when the companion is off. `null` and `[]` differ: `[]` is "companion on,
 * every kind on"; `null` is "no companion tag at all".
 */
export function interactionFlags(c: ScriptChoices): string[] | null {
  return c.interactions ? INTERACTION_KEYS.filter((k) => !c.kinds[k]).map((k) => INTERACTION_ATTR[k]) : null
}

/**
 * The script text. A platform's own wiring (next/script and the like) when the platform has one; otherwise the
 * universal tag, plus the companion's line when it is on.
 *
 * 🔴 The domain is cut to the hostname character set before it is written: the text is pasted into the site's
 * <head>, so a double quote in it could break out of `data-domain` and add an attacker's `src` to the site's page.
 */
export function trackingScript(domain: string, platform: Integration | undefined, c: ScriptChoices): string {
  const safeDomain = domain.replace(/[^a-zA-Z0-9.-]/g, '')
  const flags = coreFlags(c)
  const companion = interactionFlags(c)
  if (platform?.snippet?.code) {
    return renderSnippet(platform.snippet, safeDomain, flags, companion)
  }
  const tag = (file: string, attrs: string[]) =>
    `<script ${['defer', ...attrs, `src="${ROLLING_BASE}/${file}"`].join(' ')}></script>`
  const core = tag('script.js', [`data-domain="${safeDomain}"`, ...flags])
  // The companion has no data-domain: it reads nothing of its own and calls the core through window.pulse.
  return companion === null ? core : `${core}\n${tag('script.interactions.js', companion)}`
}

/** The two directives a site with a Content Security Policy adds. */
export const CSP_DIRECTIVES = 'script-src https://js.ciphera.net; connect-src https://pulse-api.ciphera.net'
