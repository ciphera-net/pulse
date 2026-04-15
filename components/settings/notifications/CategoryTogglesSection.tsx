'use client'

export default function CategoryTogglesSection() {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 text-sm text-neutral-400">
      <p className="text-neutral-300 font-medium mb-1">Workspace category toggles</p>
      <p className="text-xs">
        Per-category enable/disable for the entire workspace will land in a follow-up release.
        For now, every member's per-user delivery preferences govern what they receive.
      </p>
    </div>
  )
}
