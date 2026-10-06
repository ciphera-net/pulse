import type { Metadata } from 'next'
import { routeSeo, SEO_ROUTE_COUNT, SEO_WATERMARK, SEO_OVERRIDE, SEO_GENERATED } from './seo.gen'

/**
 * Level 1: SEO fields come from WordPress; the page body does not.
 *
 * Design: Pulse/docs/plans/30-09-2026-pulse-headless-cms-phase-4-design.md §4
 *
 * 🔴 A ROUTE STUB IS METADATA BOLTED ONTO A REACT ROUTE THAT ALREADY EXISTS. It has
 * no body. This helper only ever replaces what goes in <head>.
 */

export interface RouteSeo {
  title: string
  description: string
  canonical: string
  ogTitle: string
  ogDescription: string
  ogImage: string
  twitterTitle: string
  twitterDescription: string
  noindex: boolean
  nofollow: boolean
  /** WordPress `modifiedGmt` for this stub — feeds the sitemap's lastmod. */
  modified: string
}

/** What the generator wrote (lib/seo.gen.ts). Only `seoFor` reads it in this app since B7. */
export { routeSeo, SEO_ROUTE_COUNT, SEO_WATERMARK, SEO_OVERRIDE, SEO_GENERATED }

export function seoForRoute(path: string): RouteSeo | undefined {
  return routeSeo[path]
}

/**
 * Merge WordPress over the page's hardcoded metadata, field by field.
 *
 * The hardcoded object stays in the page file and is the fallback: a route with no
 * stub renders exactly as it did before Level 1 existed. That is what makes a
 * WordPress outage a deploy problem rather than a serving problem (D39) — by the
 * time this runs, the content is already baked into the build.
 */
export function seoFor(path: string, fallback: Metadata): Metadata {
  const wp = routeSeo[path]
  if (!wp) return fallback

  const merged: Metadata = { ...fallback }

  // 🔴 `absolute`, NEVER a bare string. The root layout sets
  // `title: { template: '%s | Pulse Analytics' }`, so a plain string here would be
  // appended to — and a WordPress title that already reads "Pulse … | Pulse
  // Analytics" would render "Pulse … | Pulse Analytics | Pulse Analytics".
  //
  // 🔴 CARRY THE FALLBACK'S OWN `template` FORWARD. Next.js only propagates a
  // template to descendant segments from THIS segment's own resolved title
  // (resolve-title.js keys off `'template' in title`, not the nearest ancestor
  // that declared one) — so replacing the whole title object with a bare
  // `{ absolute }` would silently drop the template a layout re-declares for
  // its own children (app/integrations/layout.tsx does this for the 75
  // /integrations/[slug] guides). Setting `template` alongside `absolute` is
  // safe for THIS segment's own title (Next resolves `absolute` first and
  // ignores `template` for it) while keeping it live for descendants.
  if (wp.title) {
    const fallbackTemplate =
      typeof fallback.title === 'object' && fallback.title && 'template' in fallback.title
        ? fallback.title.template
        : undefined
    merged.title = fallbackTemplate
      ? { absolute: wp.title, template: fallbackTemplate }
      : { absolute: wp.title }
  }
  if (wp.description) merged.description = wp.description

  // Empty means DERIVE, not "no canonical" — nullable state over a sentinel.
  merged.alternates = {
    ...(fallback.alternates ?? {}),
    canonical: wp.canonical || `https://pulse.ciphera.net${path === '/' ? '' : path}`,
  }

  const fbOg = (fallback.openGraph ?? {}) as Record<string, unknown>
  merged.openGraph = {
    ...fbOg,
    ...(wp.ogTitle ? { title: wp.ogTitle } : {}),
    ...(wp.ogDescription ? { description: wp.ogDescription } : {}),
    ...(wp.ogImage
      ? { images: [{ url: wp.ogImage, width: 1200, height: 630, alt: wp.ogTitle || wp.title }] }
      : {}),
  }

  const fbTw = (fallback.twitter ?? {}) as Record<string, unknown>
  merged.twitter = {
    ...fbTw,
    ...(wp.twitterTitle ? { title: wp.twitterTitle } : {}),
    ...(wp.twitterDescription ? { description: wp.twitterDescription } : {}),
    ...(wp.ogImage ? { images: [wp.ogImage] } : {}),
  }

  // Only ever narrow. A stub can take a page OUT of the index; it cannot put one in
  // that the page itself had excluded.
  if (wp.noindex || wp.nofollow) {
    merged.robots = { index: !wp.noindex, follow: !wp.nofollow }
  }

  return merged
}
