'use client'

// ---------------------------------------------------------------------------
// Section header for the dashboard's briefing IA (Direction C, Phase 3):
// Acquisition · Audience · Content · Behaviour. The note is each section's
// provenance line — what population its cards describe ("events · filtered
// with the page" vs "events · whole site"), so filter scope is stated where
// the numbers live instead of assumed (F14's structural answer).
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
  title: string
  note?: string
}

export default function SectionHeader({ title, note }: SectionHeaderProps) {
  return (
    <div className="mb-3 mt-8 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-tight text-white">{title}</h2>
      {note && <span className="truncate text-[11px] text-neutral-500">{note}</span>}
    </div>
  )
}
