'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, AlertTriangleIcon } from '@ciphera-net/facet'
import { HoldDialog } from '@ciphera-net/facet-hold'
import { Trash } from '@phosphor-icons/react'
import { deleteSite, permanentDeleteSite } from '@/lib/api/sites'
import { useDeferredRemoval } from '@/lib/hold/useDeferredRemoval'
import { useRefreshSiteLists } from '@/lib/swr/sites'

interface DeleteSiteModalProps {
  open: boolean
  onClose: () => void
  siteName: string
  siteId: string
  permanentOnly?: boolean
}

function WarningRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-none border border-border p-3">
      <AlertTriangleIcon className="h-4 w-4 shrink-0 text-destructive" />
      <span className="text-sm font-medium text-foreground">{children}</span>
    </div>
  )
}

/**
 * Site deletion dialog, on facet-hold's HoldDialog (PUL-28). Two flows inside
 * the SAME dialog: schedule (7-day grace) and permanent, switched by the
 * secondary button below the warnings. The site hides from every list at
 * once on confirm and is sent only when the Undo bar's window runs out.
 *
 * The pending key depends on where the site is coming FROM, not on which
 * delete it is: a site still in the active fleet hides as `site:<id>` (the
 * fleet, the switcher, the command palette all read that key); a site
 * already scheduled for deletion, deleted permanently from the home page's
 * own list, hides as `deleted-site:<id>` instead, because that row is the
 * only one it is still visible in. `permanentOnly` is how this component is
 * always opened from that list, so it doubles as the signal here.
 */
export default function DeleteSiteModal({ open, onClose, siteName, siteId, permanentOnly }: DeleteSiteModalProps) {
  const router = useRouter()
  const [showPermanent, setShowPermanent] = useState(!!permanentOnly)
  const removeLater = useDeferredRemoval()
  const refreshSiteLists = useRefreshSiteLists()

  // Each open starts from the right variant: permanentOnly always opens on
  // the permanent one, and a plain open always starts on the soft one, even
  // if a previous visit left it toggled.
  useEffect(() => {
    if (open) setShowPermanent(!!permanentOnly)
  }, [open, permanentOnly])

  const handleConfirm = () => {
    const permanent = showPermanent
    removeLater({
      key: permanentOnly ? `deleted-site:${siteId}` : `site:${siteId}`,
      message: permanent ? `${siteName} deleted forever` : `${siteName} deleted`,
      send: ({ keepalive }) =>
        permanent ? permanentDeleteSite(siteId, { keepalive }) : deleteSite(siteId, { keepalive }),
      refresh: refreshSiteLists,
      failure: `Couldn't delete ${siteName}. Try again.`,
    })
    // Delete site navigates home at once (the provider survives the route
    // change, so the Undo bar keeps counting down there).
    router.push('/')
  }

  return (
    <HoldDialog
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose() }}
      title={showPermanent ? `Delete ${siteName} forever?` : `Delete ${siteName}?`}
      description={
        showPermanent
          ? 'The site and all its data will be deleted at once, with no 7-day grace period.'
          : 'This site will be scheduled for deletion with a 7-day grace period. You can restore it at any time during this period.'
      }
      holdLabel={showPermanent ? 'Hold to delete forever' : 'Hold to delete'}
      icon={<Trash weight="bold" className="h-4 w-4" aria-hidden="true" />}
      onConfirm={handleConfirm}
    >
      <div className="space-y-2">
        {showPermanent ? (
          <>
            <WarningRow>All analytics data is permanently lost</WarningRow>
            <WarningRow>Deleted at once, with no 7-day grace period</WarningRow>
          </>
        ) : (
          <>
            <WarningRow>All events and analytics data</WarningRow>
            <WarningRow>Alert channels and goals</WarningRow>
          </>
        )}
      </div>

      {!permanentOnly && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowPermanent((v) => !v)}
          className="w-full text-muted-foreground hover:text-destructive"
        >
          {showPermanent ? 'Back' : 'Delete permanently now instead'}
        </Button>
      )}
    </HoldDialog>
  )
}
