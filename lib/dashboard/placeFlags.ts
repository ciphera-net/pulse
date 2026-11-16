import { hasFlag } from '@/lib/flags'
import { TIMEZONE_COUNTRY } from '@/lib/timezone-countries.gen'

// ---------------------------------------------------------------------------
// Which country's flag a timezone or a language draws. The Locations block's rules, kept here so the block and the
// Filter menu (lib/utils/icons.tsx getFilterValueIcon) draw the same flag for the same value (16-11-2026). An empty
// code is the grey globe: a value that belongs to no country.
// ---------------------------------------------------------------------------

// * IANA timezone → ISO country code, from IANA tzdata's own zone.tab + backward links
// * (lib/timezone-countries.gen.ts, regenerate with scripts/generate-timezone-countries.mjs).
// * It was a hand-written list of ~45 zones, so most rows had no flag (PULSE-170). A zone that
// * belongs to no country (UTC, Etc/*, the Etc/Unknown placeholder) returns '' and the row shows
// * the same grey globe the Languages tab uses for "no country" (PULSE-179, the owner's T-A).
export function getTimezoneCountry(tz: string): string {
  if (!tz || tz === 'Unknown') return ''
  return TIMEZONE_COUNTRY[tz] ?? ''
}

// * A grouped language row's flag code (PULSE-173): the server-computed
// * `flag_region` when it names a code we have art for, else the group key's
// * CLDR likely-subtag region (e.g. "ja" -> "JP") when THAT has art, else ''
// * (globe). `flag_region` already encodes "which member, if any, earned the
// * flag" (the most-visited member that carries a region) — this function only ever adds the
// * bare-key fallback and the hasFlag gate, never re-picks a member.
export function getGroupFlagCode(item: { language?: string; flag_region?: string | null }): string {
  const key = item.language ?? ''
  if (!key || key === 'Unknown') return ''
  const region = (item.flag_region ?? '').toUpperCase()
  if (region && hasFlag(region)) return region
  try {
    const likely = new Intl.Locale(key).maximize().region
    if (likely && hasFlag(likely)) return likely
  } catch {
    // Not a resolvable BCP47 primary subtag — no fallback flag, same as an
    // unresolvable code anywhere else on this card.
  }
  return ''
}

/**
 * A stored language tag's flag code, by the grouped row's rule above: the tag's own region ("en-GB" → GB) when it
 * has art, else its language's likely region ("nb" → NO), else '' (the globe). The Filter menu lists stored tags,
 * while the Languages tab groups them by language, so this is the rule that draws a tag as its group is drawn.
 */
export function languageFlagCode(tag: string): string {
  const [language, ...subtags] = (tag ?? '').replace(/@.*$/, '').split('-')
  // The region is the two-letter (or three-digit) subtag, wherever it sits: "zh-Hant-TW" names TW after its script.
  const region = subtags.find((s) => /^[A-Za-z]{2}$|^\d{3}$/.test(s)) ?? null
  return getGroupFlagCode({ language, flag_region: region })
}
