'use client'

import { useState } from 'react'
import { useSWRConfig } from 'swr'
import { UsersThree } from '@phosphor-icons/react'
import { toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { updateSite, type Site } from '@/lib/api/sites'
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
  /**
   * The WHOLE site, not just its domain.
   *
   * 🔴 It used to take `domain` and send `{ name: domain }`, because the update
   * endpoint requires a name. That RENAMED THE SITE TO ITS DOMAIN on every
   * enable — measured in production: "Ciphera" became "ciphera.net" the moment
   * the owner pressed the button. PUT /sites/:id merges omitted fields against
   * the stored row, but `name` is `binding:"required"` and so cannot be
   * omitted; the only correct value to send is the one already there, which is
   * exactly what SitePrivacyTab does (`name: site!.name`).
   */
  site: Site
  onEnabled: () => void
}

export function VisitorsOffRoom({ site, onEnabled }: VisitorsOffRoomProps) {
  const canEdit = useCan('sites.edit')
  const [saving, setSaving] = useState(false)
  // 🔴 The BOUND mutate. The global `mutate` from 'swr' writes to the default
  // cache, which nothing in this app reads — SWRConfig mounts a custom provider
  // — so it is a silent no-op (pulse#412/#413).
  const { mutate } = useSWRConfig()

  async function enable() {
    setSaving(true)
    try {
      const updated = await updateSite(site.id, {
        // The stored name, never the domain. See the prop's comment.
        name: site.name,
        visitor_views_enabled: true,
      })

      // Seed the site cache with the server's own answer — no refetch needed,
      // and no window where the page still believes the toggle is off.
      await mutate(['site', site.id], updated, { revalidate: false })

      // 🔴 AND DROP THE VISITORS CACHES. Without this the page kept showing
      // this very room after a success toast, until the user refreshed.
      //
      // The reason is not obvious: useVisitors had already failed with the
      // toggle-off 403, and dashboardSWRConfig deliberately does NOT retry a
      // 403. SWR therefore holds that error until something revalidates the
      // key — and the key does not change when the site does. So the page's
      // "API says disabled" branch stayed true against a site that was now
      // enabled. Clearing the data forces those hooks back into loading and
      // refetching, which is what clears the error.
      await mutate(
        (key) => Array.isArray(key) && typeof key[0] === 'string'
          && key[0].startsWith('visitor') && key[1] === site.id,
        undefined,
        { revalidate: true },
      )

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
          Off for {site.domain}
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
