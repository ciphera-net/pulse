import { renderSnippet, type Integration } from '@/lib/integrations'

/**
 * The tracking script a site pastes: ONE builder for every surface that shows it (onboarding's install panel and the
 * General settings page), so the two can never print different tags for the same site.
 *
 * 🔑 Since 14-11-2026 (tracker v1.9.0) the tag is the SAME for every site whatever its choices: the script takes its
 * options from the site's saved settings, which the server sends, and the server enforces them. Until then each
 * choice was a data-* flag written into the tag here (data-no-scroll, data-ignore-dnt, …) plus a second tag for
 * interactions, so a saved choice did nothing until the owner pasted the tag again; on 14-11-2026 five of the seven
 * live tags that could be read disagreed with their settings. The choices below are still the site's settings, saved
 * through featuresPayload; they just no longer change the text.
 * Design: Pulse/docs/plans/14-11-2026-one-tag-settings-from-server-design.md
 */

// * Every copied script names the rolling files, so a site gets each new version without replacing its tag. The option
// * to lock a site to one version (Subresource Integrity) was removed on 07-11-2026; tags pasted with it keep loading
// * the js.ciphera.net/v<version>/ copies, which stay on the CDN.
const ROLLING_BASE = 'https://js.ciphera.net'

/** The core script's three features, each a switch in the site's settings. */
export const FEATURE_KEYS = ['scroll', 'outbound', 'downloads'] as const
export type FeatureKey = (typeof FEATURE_KEYS)[number]

/** The interactions companion's three kinds, each a switch in the site's settings. */
export const INTERACTION_KEYS = ['clicks', 'copy', 'forms'] as const
export type InteractionKey = (typeof INTERACTION_KEYS)[number]

/** The site's tracking settings as the settings pages edit them. */
export interface ScriptChoices {
  features: Record<FeatureKey, boolean>
  /** Interactions capture (clicks, copies and forms): off unless a site opted in. */
  interactions: boolean
  kinds: Record<InteractionKey, boolean>
  /** Positive polarity: on means the browser's signal is respected, off counts those browsers. */
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
 * The script text: a platform's own wiring (next/script and the like) when the platform has one, otherwise the
 * universal tag. The same for every site on the same platform, whatever its settings (see the header).
 *
 * 🔴 The domain is cut to the hostname character set before it is written: the text is pasted into the site's
 * <head>, so a double quote in it could break out of `data-domain` and add an attacker's `src` to the site's page.
 */
export function trackingScript(domain: string, platform: Integration | undefined): string {
  const safeDomain = domain.replace(/[^a-zA-Z0-9.-]/g, '')
  if (platform?.snippet?.code) {
    // * No flags and no companion line: the registry's snippets still accept both for older callers.
    return renderSnippet(platform.snippet, safeDomain, [], null)
  }
  return `<script defer data-domain="${safeDomain}" src="${ROLLING_BASE}/script.js"></script>`
}

/** The two directives a site with a Content Security Policy adds. */
export const CSP_DIRECTIVES = 'script-src https://js.ciphera.net; connect-src https://pulse-api.ciphera.net'
