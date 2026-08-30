'use client'

import { useState } from 'react'
import { UsersThree } from '@phosphor-icons/react'
import { toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { updateSite } from '@/lib/api/sites'
import { useCan } from '@/lib/auth/permissions'

// ─── The default-OFF room (approved round 1, §9a.6) ─────────────────
//
// The nav item is visible for every site; this is what it opens until the owner
// turns the surface on. That resolves the obvious objection to a default-off
// feature — that it is invisible and therefore never adopted — without making
// the activation any less deliberate.
//
// 🔴 THE COPY IS THE POINT, and it is the honest half of the whole feature.
// This switch does not change collection. Pulse writes the same columns either
// way. Saying otherwise — or saying nothing and letting a reader assume — would
// make it the worst kind of privacy control: one whose owner believes it stops
// data existing.

interface VisitorsOffRoomProps {
  siteId: string
  domain: string
  onEnabled: () => void
}

export function VisitorsOffRoom({ siteId, domain, onEnabled }: VisitorsOffRoomProps) {
  const canEdit = useCan('sites.edit')
  const [saving, setSaving] = useState(false)

  async function enable() {
    setSaving(true)
    try {
      await updateSite(siteId, { name: domain, visitor_views_enabled: true })
      toast.success('Visitor views enabled')
      onEnabled()
    } catch (err) {
      // Surfaced, never swallowed: a failed enable that looked like a success
      // would leave the page cycling back to this room with no explanation.
      toast.error(getAuthErrorMessage(err) || 'Could not enable visitor views')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto mt-10 w-full max-w-xl rounded-none border border-border bg-card p-8">
      <div className="mx-auto flex size-16 items-center justify-center rounded-none border border-border">
        <UsersThree className="size-7 text-neutral-400" weight="regular" aria-hidden="true" />
      </div>

      <h2 className="mt-6 text-center text-lg font-medium text-white">
        Visitor-level views are off
      </h2>

      <p className="mx-auto mt-3 max-w-md text-center text-sm leading-relaxed text-neutral-400">
        Pulse collects the same data either way — this switch controls whether anyone can read
        it at visitor grain. Identities are pseudonymous, scoped to this site, and reset every
        calendar month.
      </p>

      <div className="mt-6 flex items-center justify-between border border-border px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm text-neutral-300">
          <span className="size-1.5 rounded-full bg-neutral-600" aria-hidden="true" />
          Off for {domain}
        </span>
        <span className="text-xs text-neutral-500">collection unchanged</span>
      </div>

      <button
        type="button"
        onClick={enable}
        disabled={saving || !canEdit}
        className="mt-4 flex h-11 w-full items-center justify-center rounded-none bg-brand-orange text-sm font-medium text-black transition-opacity duration-fast ease-apple hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {saving ? 'Enabling…' : 'Enable visitor views'}
      </button>

      <p className="mt-3 text-center text-xs text-neutral-500">
        {canEdit
          ? 'Owner-only · recorded in the audit trail · turn it off any time'
          : 'Only an owner or admin can turn this on'}
      </p>
    </div>
  )
}
