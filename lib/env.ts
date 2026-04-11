/**
 * Build-time env validation helpers.
 *
 * IMPORTANT: Next.js/webpack inlines `process.env.NEXT_PUBLIC_FOO` at build
 * time via DefinePlugin, but ONLY when it's a literal property access. A
 * dynamic/computed access like `process.env[name]` is NOT replaced —
 * webpack can't statically determine which key is being read. At runtime
 * in the browser, `process.env` is an empty polyfill, so any computed
 * access returns `undefined` and you ship broken code to production.
 *
 * Because of that, this helper takes the VALUE as an argument, not the
 * name. The caller writes:
 *
 *     const API_URL = requireEnv('NEXT_PUBLIC_API_URL', process.env.NEXT_PUBLIC_API_URL)
 *
 * and webpack replaces the second argument with the string literal at
 * build time. At runtime the helper just validates truthiness and returns
 * the narrowed `string` type. The first argument is kept only for the
 * error message so developers know which var is missing.
 *
 * Do NOT change this to `requireEnv(name)` with an internal
 * `process.env[name]` read — that's exactly the trap that broke pulse
 * sign-in on 11-04-2026.
 */

export function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set. This value is required at build time. ` +
      `See .env.example and scripts/validate-env.mjs.`
    )
  }
  return value
}
