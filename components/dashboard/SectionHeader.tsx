'use client'

// ---------------------------------------------------------------------------
// Section header for the dashboard's briefing IA (Direction C, Phase 3):
// Acquisition · Audience · Outbound · Content · Behaviour.
//
// 🔴 THE PROVENANCE NOTE IS GONE (owner, 10-09-2026: "lets get rid of whole
// site & site timezone from on top right of all the blocks... its
// unnecessary"). It carried the filter scope of each section's cards
// ("filtered with the page" vs "whole site", and "· site timezone" on
// Behaviour) — F14's structural answer to stating scope where the numbers
// live.
//
// What made it removable rather than a loss: the only case where scope
// actually differs between neighbouring cards is Outbound, whose endpoints
// take no filters — and that card states it ITSELF, in its own footnote, and
// only when a page filter is on ("Outbound is not filtered yet — these are
// whole-site clicks"). The header note said it on every section, on every
// load, whether or not anything was filtered. A line that is right five times
// out of five and informative none of them is chrome.
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
  title: string
}

export default function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <div className="mb-3 mt-8">
      <h2 className="text-sm font-semibold tracking-tight text-white">{title}</h2>
    </div>
  )
}
