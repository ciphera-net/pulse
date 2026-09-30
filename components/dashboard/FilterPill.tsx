'use client'

import { motion } from 'framer-motion'
import { X } from '@phosphor-icons/react'
import { type DimensionFilter, DIMENSION_LABELS, OPERATOR_LABELS } from '@/lib/filters'
import { EASE_APPLE } from '@/lib/motion'
import { formatLanguage } from '@/lib/dashboard/language'

interface FilterPillProps {
  filter: DimensionFilter
  /** Receives the pill's label element so the filter popover can anchor to it. */
  onEdit: (anchor: HTMLElement) => void
  onRemove: () => void
}

export default function FilterPill({ filter, onEdit, onRemove }: FilterPillProps) {
  const dim = DIMENSION_LABELS[filter.dimension] || filter.dimension
  const op = OPERATOR_LABELS[filter.operator]
  // PULSE-173: a grouped-language row's click produces one filter carrying
  // every member locale of the group (e.g. ["en-US","en-GB","en",…]) — showing
  // "en-US +8" would name one arbitrary member and hide that the filter is
  // really "the English group". Every member shares the same base subtag by
  // construction, so the LANGUAGE NAME (not a member) is the honest label.
  // A single-value language filter (the ungrouped click, unchanged) still
  // falls through to the generic branch below and reads as it always has.
  const val = filter.dimension === 'language' && filter.values.length > 1
    ? formatLanguage(filter.values[0].replace(/@.*$/, '').split('-')[0])
    : filter.values.length > 1
      ? `${filter.values[0]} +${filter.values.length - 1}`
      : filter.values[0]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15, ease: EASE_APPLE }}
      // * h-10 matches the Filter button and date-range control — the pill sits
      // * in the same toolbar row and must share its rhythm.
      className="inline-flex items-center h-10 rounded-none bg-brand-orange/10 text-brand-ink text-sm font-medium border border-brand-orange/20"
    >
      <button
        onClick={e => onEdit(e.currentTarget)}
        className="flex items-center gap-1.5 px-3 h-full hover:bg-brand-orange/10 transition-colors cursor-pointer"
      >
        <span className="text-brand-ink/70">{dim}</span>
        <span className="text-brand-ink/50">{op}</span>
        <span className="max-w-[140px] truncate">{val}</span>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        className="flex items-center justify-center w-8 h-full hover:bg-red-500/20 hover:text-red-400 transition-colors cursor-pointer border-l border-brand-orange/20"
        aria-label={`Remove ${dim} filter`}
      >
        <X className="w-3.5 h-3.5" weight="bold" />
      </button>
    </motion.div>
  )
}
