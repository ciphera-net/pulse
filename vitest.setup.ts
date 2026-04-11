// Vitest setup file — runs once before test collection, so any module-level
// code in imported files (like `lib/api/client.ts`, `lib/mollie.ts`, etc.)
// sees these env vars already set. Without this, `requireEnv()` calls throw
// at module import and the entire test suite fails 1/0 before collection.
//
// Values are deliberately obvious fakes — if any test accidentally makes a
// real fetch, the error message will make it clear we're in test mode.
// Tests that need to assert on specific URL substrings can override these
// per-test or override per-test via `vi.stubEnv(...)`.
process.env.NEXT_PUBLIC_API_URL ??= 'http://test.invalid/api'
process.env.NEXT_PUBLIC_AUTH_URL ??= 'http://test.invalid/auth-ui'
process.env.NEXT_PUBLIC_APP_URL ??= 'http://test.invalid/app'
process.env.NEXT_PUBLIC_AUTH_API_URL ??= 'http://test.invalid/auth-api'
process.env.NEXT_PUBLIC_CAPTCHA_API_URL ??= 'http://test.invalid/captcha/api/v1'
process.env.NEXT_PUBLIC_MOLLIE_PROFILE_ID ??= 'pfl_test_stub'
process.env.NEXT_PUBLIC_MOLLIE_TESTMODE ??= 'true'

import '@testing-library/jest-dom/vitest'
