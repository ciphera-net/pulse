'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@ciphera-net/facet'
import { HoldDialog } from '@ciphera-net/facet-hold'
import { Trash } from '@phosphor-icons/react'
import { deleteSite, permanentDeleteSite } from '@/lib/api/sites'
import { useDeferredRemoval } from '@/lib/hold/useDeferredRemoval'
import { useRefreshSiteLists } from '@/lib/swr/sites'
import { KitDialogRow, KitDialogTitle } from '@/components/settings/kit/Kit'

interface DeleteSiteModalProps {
  open: boolean
  onClose: () => void
  siteName: string
  /** The address the dialog names: what stops being counted. */
  siteDomain: string
  siteId: string
  permanentOnly?: boolean
}

/**
 * Site deletion dialog, on facet-hold's HoldDialog (PUL-28), drawn as settings overhaul R11 (style C: the kit inside
 * the dialog) in the copy deck's words (§3.8). Two flows inside the SAME dialog: delete (restorable for 7 days) and
 * delete now, switched by the secondary button. The site hides from every list at once on confirm and is sent only
 * when the Undo bar's window runs out.
 *
 * The pending key depends on where the site is coming FROM, not on which delete it is: a site still in the active
 * fleet hides as `site:<id>` (the fleet, the switcher, the command palette all read that key); a site already
 * scheduled for deletion, deleted for good from the home page's own list, hides as `deleted-site:<id>` instead,
 * because that row is the only one it is still visible in. `permanentOnly` is how this component is always opened
 * from that list, so it doubles as the signal here.
 */
export default function DeleteSiteModal({ open, onClose, siteName, siteDomain, siteId, permanentOnly }: DeleteSiteModalProps) {
  const router = useRouter()
  const [now, setNow] = useState(!!permanentOnly)
  const removeLater = useDeferredRemoval()
  const refreshSiteLists = useRefreshSiteLists()

  // Each open starts from the right variant: permanentOnly always opens on delete now, and a plain open always starts
  // on the restorable one, even if a previous visit left it toggled.
  useEffect(() => {
    if (open) setNow(!!permanentOnly)
  }, [open, permanentOnly])

  const handleConfirm = () => {
    const permanent = now
    removeLater({
      key: permanentOnly ? `deleted-site:${siteId}` : `site:${siteId}`,
      message: permanent ? `${siteName} deleted for good` : `${siteName} deleted`,
      send: ({ keepalive }) => (permanent ? permanentDeleteSite(siteId, { keepalive }) : deleteSite(siteId, { keepalive })),
      refresh: refreshSiteLists,
      failure: `Couldn't delete ${siteName}. Try again.`,
    })
    // Delete site navigates home at once (the provider survives the route change, so the Undo bar keeps counting
    // down there).
    router.push('/')
  }

  return (
    <HoldDialog
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose() }}
      title={<KitDialogTitle icon={<Trash weight="bold" />}>{now ? `Delete ${siteName} now?` : `Delete ${siteName}?`}</KitDialogTitle>}
      description={
        now
          ? `${siteDomain} and all its data are deleted right away. This can't be undone.`
          : `Pulse stops counting visits on ${siteDomain} and removes it from your sites. You can restore it from the home page for 7 days. After that it is deleted for good.`
      }
      holdLabel={now ? 'Hold to delete now' : 'Hold to delete'}
      icon={<Trash weight="bold" className="h-4 w-4" aria-hidden="true" />}
      onConfirm={handleConfirm}
      className="max-w-[480px]"
    >
      <div data-dialog-style="groups">
        {/* The line above already says the rest: the restore window, or that this one can't be undone. */}
        <KitDialogRow label="What goes" caption={now ? 'Everything, at once.' : 'Its stats, its goals and everything else set up for it.'} />
      </div>
      {!permanentOnly && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setNow((v) => !v)}
          className="w-full text-muted-foreground hover:text-destructive"
        >
          {now ? 'Back' : 'Delete now, without the 7 days'}
        </Button>
      )}
    </HoldDialog>
  )
}
