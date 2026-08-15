import catalogue from './audit-descriptions.json'

// ---------------------------------------------------------------------------
// Audit description catalogue.
//
// Lighthouse's description prose used to be stored on every check row — ~33 KB
// of identical English, re-stored daily, per site, per strategy. It is a pure
// function of the Lighthouse version, so it ships once in the bundle instead.
// The file is GENERATED, never hand-edited:
//
//   cd pulse-backend/runner
//   node scripts/export-audit-descriptions.mjs \
//     --out ../../pulse-frontend/lib/pagespeed/audit-descriptions.json
//
// ⚠️ A missing id renders TITLE-ONLY, and that is correct rather than a bug to
// paper over. An id we do not have came from a different Lighthouse version, and
// showing this version's guidance for it would attribute the wrong advice to
// that run. Silence beats a confident wrong answer.
// ---------------------------------------------------------------------------

const DESCRIPTIONS = catalogue.descriptions as Record<string, string>

/** The Lighthouse version this catalogue was generated from. */
export const CATALOGUE_LIGHTHOUSE_VERSION: string = catalogue._lighthouse_version

/** Description prose for an audit id, or null when this version has no entry. */
export function auditDescription(auditId: string): string | null {
  return DESCRIPTIONS[auditId] ?? null
}
