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
//
// 🔴 ONE PINNED SIGN IS HALF A GUARD (added 15-08-2026). The negative offset above
// catches a date rendered a day EARLY, which is the failure recorded in
// formatDate.ts. It CANNOT catch the opposite: a late-in-day UTC instant shifting
// FORWARD under a positive offset — which is exactly the defect that reached a
// customer's screen on 15-08-2026, where 2026-08-15T23:24:01Z rendered as
// "Sun, 16/08/2026". Under America/New_York that same instant renders 15/08 and the
// bug is invisible.
//
// So the date-sensitive suites run a SECOND time under a maximal POSITIVE offset:
// `npm run test:tz-positive` (PULSE_TEST_TZ=Pacific/Kiritimati, UTC+14). A dedicated
// variable rather than reading TZ directly, because a CI image that happens to set
// TZ=UTC would otherwise silently defeat the pin — which is the state this file was
// written to end.
process.env.TZ = process.env.PULSE_TEST_TZ || 'America/New_York'

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
import { configure } from '@testing-library/react'

// 🔴 THE HARNESS HAS TWO BUDGETS, AND vitest.config.ts RAISES ONLY ONE OF THEM.
//
// vitest.config.ts already lifts testTimeout/hookTimeout to 20 s in CI, for the
// reason written there: the test pod requests 500m CPU and waitFor budgets
// starve. But Testing Library's `findBy*` / `waitFor` run on THEIR OWN default —
// asyncUtilTimeout = 1000 ms — which that config cannot reach. Measured
// 05-09-2026, five pipelines in a row with 2–4 suites sharing one agent node:
//   1478/1479/1481  SitePrivacyTab.visitorViews  (waitFor → getByText)
//   1482            setup/done page              (findByText)
//   1483            AccountDevicesTab             (findByText, died at 1266 ms)
// Four different files, none touched by any of the diffs, every one green in
// its own PR run minutes earlier. That is the 1 s ceiling meeting a starved
// CPU, not four bugs.
//
// Raise it in CI only, to the same order as the vitest budgets: an assertion
// that never becomes true still fails, just against a budget the pod can meet;
// local runs keep the sharp 1 s default so real slowness is felt where a human
// is watching. (Woodpecker sets CI=woodpecker.)
if (process.env.CI) configure({ asyncUtilTimeout: 10_000 })
