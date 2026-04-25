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
