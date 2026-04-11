/**
 * Typed, Zod-validated build-time environment configuration.
 *
 * This file is the SINGLE SOURCE OF TRUTH for every public environment
 * variable pulse-frontend consumes. All consumers should `import { env }`
 * and read values from the resulting object — never from `process.env`
 * directly.
 *
 * How it works:
 *
 * 1. `@t3-oss/env-nextjs` wraps a Zod schema and validates `process.env`
 *    at module load time. Any missing or malformed value throws a
 *    structured error listing every problem at once.
 *
 * 2. The `runtimeEnv` object is the ONLY place in the app where
 *    `process.env.NEXT_PUBLIC_*` is read. Every access is a literal
 *    property access, which webpack's DefinePlugin statically replaces
 *    with the build-arg value at compile time. This is the exact pattern
 *    that survives the Next.js inlining trap — see the 11-04-2026
 *    sign-in outage retrospective for why this matters.
 *
 * 3. `env.NEXT_PUBLIC_FOO` is typed as `string` (narrowed from the Zod
 *    schema), so TypeScript propagates the non-undefined type everywhere
 *    without manual `requireEnv` helpers or `if (!X) throw` guards.
 *
 * 4. The `client` section holds values destined for the browser — these
 *    end up in the compiled JS bundle. The `server` section (empty for
 *    pulse-frontend today) would hold server-only secrets; the library
 *    throws at runtime if client code tries to read a server value,
 *    enforcing a hard architectural boundary.
 *
 * Adding a new NEXT_PUBLIC_* var:
 *   a. Add the Zod field to the `client` schema below.
 *   b. Add the literal `process.env.NEXT_PUBLIC_FOO` entry to `runtimeEnv`.
 *   c. Add the `build-args:` line to .github/workflows/build-and-push.yml
 *      (remember: per-branch values go in the `target` step for the ones
 *      that differ between prod and staging).
 *   d. Add the variable to .env.example with prod+staging values.
 *   e. Use `env.NEXT_PUBLIC_FOO` anywhere in source.
 */

import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  client: {
    /** pulse-backend API base URL (differs between prod and staging). */
    NEXT_PUBLIC_API_URL: z.string().url(),

    /** auth-frontend public URL used for OAuth redirects from pulse → auth. */
    NEXT_PUBLIC_AUTH_URL: z.string().url(),

    /** pulse-frontend's own public URL (self-links, OAuth callback, share URLs). */
    NEXT_PUBLIC_APP_URL: z.string().url(),

    /** auth-backend API base URL (used by token refresh and server actions). */
    NEXT_PUBLIC_AUTH_API_URL: z.string().url(),

    /** Captcha service base URL, includes `/api/v1` suffix. */
    NEXT_PUBLIC_CAPTCHA_API_URL: z.string().url(),

    /**
     * Mollie billing profile ID. Public identifier of the Mollie profile,
     * NOT a secret — it appears in every checkout API call from the browser.
     * Must start with `pfl_`.
     */
    NEXT_PUBLIC_MOLLIE_PROFILE_ID: z.string().regex(/^pfl_/, 'Must start with pfl_'),

    /**
     * Mollie testmode flag. `true` in staging (hits Mollie test API),
     * `false` in prod (hits Mollie live API). Must match the backend's
     * Mollie API key type (test_XXX vs live_XXX) or Mollie will reject
     * tokenized payments with a schema mismatch.
     */
    NEXT_PUBLIC_MOLLIE_TESTMODE: z.enum(['true', 'false']),
  },
  /*
   * Every entry here MUST be a literal `process.env.NEXT_PUBLIC_X` access.
   * Do NOT read them indirectly — webpack DefinePlugin only inlines
   * literal reads, and a missed replacement ships an `undefined` value
   * to production. See the 11-04-2026 sign-in outage retrospective
   * (the `requireEnv(name)` helper had exactly this bug).
   */
  runtimeEnv: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_AUTH_URL: process.env.NEXT_PUBLIC_AUTH_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_AUTH_API_URL: process.env.NEXT_PUBLIC_AUTH_API_URL,
    NEXT_PUBLIC_CAPTCHA_API_URL: process.env.NEXT_PUBLIC_CAPTCHA_API_URL,
    NEXT_PUBLIC_MOLLIE_PROFILE_ID: process.env.NEXT_PUBLIC_MOLLIE_PROFILE_ID,
    NEXT_PUBLIC_MOLLIE_TESTMODE: process.env.NEXT_PUBLIC_MOLLIE_TESTMODE,
  },
  emptyStringAsUndefined: true,
})
