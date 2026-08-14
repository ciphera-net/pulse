// 🔴 PIN A NON-UTC TIMEZONE, AND DELIBERATELY A NEGATIVE-OFFSET ONE.
//
// Nothing used to set TZ here or in vitest.config.ts, and CI runs `npm test` in
// `image: node:22`, whose TZ is UTC. So every assertion of the form "this
// renders in UTC" was satisfied by the ENVIRONMENT rather than by the code.
// Measured: deleting both `timeZone: 'UTC'` options from PageSpeedStatusLine
// leaves the suite 12/12 GREEN under TZ=UTC and fails 2 tests under a real
// viewer's zone. A regression that dropped UTC formatting would have merged
// green, and every viewer outside UTC would then have seen a local-time stamp
// still labelled "UTC", directly under a spec plate saying "runs are UTC".
//
// America/New_York rather than a positive offset: for the midnight-UTC
// timestamps that fill fixtures, UTC-4 shifts the DATE backwards, which is the
// failure that actually reaches a customer. A UTC+10 zone leaves those same
// dates unchanged and would have proved less. It found one real defect
// immediately — see lib/notifications/renderers/billing.tsx.
//
// Set here rather than in the npm script so it holds for `npx vitest run` and
// for an IDE runner too. Verified effective: Intl resolves to America/New_York
// inside the workers, not merely in process.env.
process.env.TZ = 'America/New_York'

// Vitest setup file — runs once before test collection, so any module-level
// code in imported files (lib/env.ts, lib/api/client.ts, etc.) sees these env
// vars already set. Without this, the @t3-oss/env-nextjs Zod schema validation
// throws at module import and the entire test suite fails before collection.
//
// Values are deliberately obvious fakes — if any test accidentally makes a
// real fetch, the error message will make it clear we're in test mode.
// Tests that need to assert on specific URL substrings can override these
// per-test via `vi.stubEnv(...)`.
process.env.NEXT_PUBLIC_API_URL ??= 'http://test.invalid/api'
process.env.NEXT_PUBLIC_ID_URL      ??= 'http://test.invalid/id-ui'
process.env.NEXT_PUBLIC_APP_URL ??= 'http://test.invalid/app'
process.env.NEXT_PUBLIC_ID_API_URL  ??= 'http://test.invalid/id-api'
process.env.NEXT_PUBLIC_CAPTCHA_API_URL ??= 'http://test.invalid/captcha/api/v1'

import '@testing-library/jest-dom/vitest'
