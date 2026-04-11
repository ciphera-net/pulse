/**
 * Build-time env validation helpers.
 *
 * NEXT_PUBLIC_* values are inlined into the client bundle by `next build`.
 * At runtime (both server and browser) they're read from `process.env`.
 * If a required var is missing we want a loud failure, not a silent
 * `undefined` that turns into `"undefined"` in template literals or a
 * broken localhost fallback that ships to production.
 *
 * Using this helper (instead of `const X = process.env.FOO; if (!X) throw`)
 * ensures the resulting constant is typed as `string` rather than
 * `string | undefined` — TypeScript's control-flow narrowing does NOT
 * carry through module-level guards into nested function bodies when the
 * narrowed constant is used as a strict-typed function argument.
 *
 * Do NOT add runtime fallbacks here. A missing var at build time should
 * fail the CI build via scripts/validate-env.mjs; a missing var at test
 * time should be populated by vitest.setup.ts. Production code should
 * never see an empty value.
 */

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set. This value is required at build time. ` +
      `See .env.example and scripts/validate-env.mjs.`
    )
  }
  return value
}
