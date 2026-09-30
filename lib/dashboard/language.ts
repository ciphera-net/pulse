// ---------------------------------------------------------------------------
// Shared language-tag display logic (PULSE-173). Lives outside Locations.tsx
// so a leaf UI component (FilterPill, for the grouped-filter chip label) can
// use the SAME formatting as the Languages card without importing a full
// dashboard card component — one definition, not two that could drift.
// ---------------------------------------------------------------------------

/**
 * Renders a BCP47-ish language tag as a human name via `Intl.DisplayNames`:
 * "en-US" -> "English (United States)", "en" -> "English", "Unknown" stays
 * "Unknown". Also used on a bare GROUP KEY (PULSE-173's "en", no region),
 * which is exactly what makes it reusable for the grouped filter chip: a
 * group key has no region subtag, so this naturally returns just the
 * language name with no fabricated pairing.
 */
export function formatLanguage(locale: string): string {
  if (locale === 'Unknown') return 'Unknown'
  try {
    const parts = locale.replace(/@.*$/, '').split('-')
    const langDisplay = new Intl.DisplayNames(['en'], { type: 'language' })
    const langName = langDisplay.of(parts[0]) || parts[0]
    if (parts[1]) {
      const regionDisplay = new Intl.DisplayNames(['en'], { type: 'region' })
      const regionName = regionDisplay.of(parts[1].toUpperCase())
      if (regionName) return `${langName} (${regionName})`
    }
    return langName
  } catch {
    return locale
  }
}
