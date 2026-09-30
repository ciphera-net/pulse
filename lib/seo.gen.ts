// 🔴 COMMITTED EMPTY STUB — `npm run build` replaces this file (prebuild →
// scripts/generate-seo.ts) with what WordPress holds, and fails loudly if it
// cannot (design D39). It exists so a fresh clone type-checks and tests without
// cluster access: empty means "no CMS overrides", i.e. every route renders its
// page's own built-in metadata — exactly the site before Level 1 existed.
//
// ⚠️ A local build FILLS this file. Never commit the filled version — run
// `git checkout -- lib/seo.gen.ts` first. lib/__tests__/seo-gen-stub.test.ts
// fails CI if a filled copy is ever committed.

import type { RouteSeo } from './seo'

export const SEO_ROUTE_COUNT = 0

export const SEO_WATERMARK = ""

export const SEO_OVERRIDE = false

export const SEO_GENERATED = false

export const routeSeo: Record<string, RouteSeo> = {}
