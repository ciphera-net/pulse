// Country code helpers shared by the Search Console views (GSC returns alpha-3
// codes; the flag icon set and display names key on alpha-2). Extracted from the
// dashboard SearchPerformance widget's proven logic so both surfaces agree —
// full ISO 3166-1 coverage via i18n-iso-countries, names via Intl.DisplayNames.

import countries from 'i18n-iso-countries'

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

/** Alpha-3 → alpha-2 (e.g. "USA" → "US"), or null for unknown codes. */
export function alpha3ToAlpha2(alpha3: string): string | null {
  return countries.alpha3ToAlpha2(alpha3.toUpperCase()) ?? null
}

/** Human country name for an alpha-3 code, falling back to the raw code. */
export function countryName(alpha3: string): string {
  const a2 = alpha3ToAlpha2(alpha3)
  if (!a2) return alpha3
  try {
    return regionNames.of(a2) ?? alpha3
  } catch {
    return alpha3
  }
}
