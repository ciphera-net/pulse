import { cdnUrl } from './cdn'

// * The site-wide 1200x630 share card. ONE definition, imported by the root
// * layout and by every marketing page that declares its own `openGraph`
// * block: Next.js shallow-merges metadata per top-level field, so a page
// * that declares `openGraph` REPLACES the root's block wholesale and MUST
// * re-declare the image or it ships with none (found live on /open-source,
// * 02-09-2026 — every marketing page had this hole).
// * DEPLOY DEPENDENCY: og-pulse.png must exist at that CDN path.
export const DEFAULT_OG_IMAGE = cdnUrl('/og-pulse.png')

export const DEFAULT_OG_IMAGES = [
  {
    url: DEFAULT_OG_IMAGE,
    width: 1200,
    height: 630,
    alt: 'Pulse — privacy-first web analytics',
  },
]
