'use client'

import type { ImportedProvenance } from '@/lib/api/stats'
import type { ImportedDimension } from '@/lib/import/source-display'
import { cardImportNote } from '@/lib/dashboard/importBoundary'

/**
 * A card's imported-history footnote (PULSE-118, M11-h): said when the import
 * holds no rows for the card's dimension while the range overlaps it, so a card
 * that is all Pulse-measured beside a headline that is not never reads as a gap.
 * Outbound's footnote device (`mt-3 text-[11px] text-neutral-500`): a word, never
 * a panel. Renders nothing in every other state.
 */
export function ImportedCardNote({
  card,
  dimension,
}: {
  card: ImportedProvenance | null | undefined
  dimension: ImportedDimension | null
}) {
  const text = cardImportNote(card, dimension, new Date().getFullYear())
  if (!text) return null
  return (
    <p className="mt-3 text-[11px] text-neutral-500" data-testid="imported-card-note">
      {text}
    </p>
  )
}
