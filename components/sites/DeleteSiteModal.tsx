'use client'

import { useEffect, useRef, useState } from 'react'
import { Modal, Button, toast, getAuthErrorMessage, AlertTriangleIcon } from '@ciphera-net/facet'
import { deleteSite, permanentDeleteSite } from '@/lib/api/sites'

interface DeleteSiteModalProps {
  open: boolean
  onClose: () => void
  onDeleted: () => void
  siteName: string
  siteDomain: string
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
 * Site deletion dialog on Facet's Modal (replacing the former bespoke
 * framer-motion portal). Two flows: schedule (type DELETE, 7-day grace) and
 * permanent (type the exact domain). Facet's Modal traps focus but does not
 * restore it on close, so the opener's focus is restored here.
 */
export default function DeleteSiteModal({ open, onClose, onDeleted, siteName, siteDomain, siteId, permanentOnly }: DeleteSiteModalProps) {
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [showPermanent, setShowPermanent] = useState(!!permanentOnly)
  const [permanentConfirm, setPermanentConfirm] = useState('')
  const [isPermanentDeleting, setIsPermanentDeleting] = useState(false)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open && permanentOnly) setShowPermanent(true)
  }, [open, permanentOnly])

  useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null
    } else {
      restoreFocusRef.current?.focus()
      restoreFocusRef.current = null
    }
  }, [open])

  const handleClose = () => {
    setDeleteConfirm('')
    setShowPermanent(false)
    setPermanentConfirm('')
    setIsDeleting(false)
    setIsPermanentDeleting(false)
    onClose()
  }

  const handleSoftDelete = async () => {
    if (deleteConfirm !== 'DELETE') return
    setIsDeleting(true)
    try {
      await deleteSite(siteId)
      toast.success('Site scheduled for deletion. You have 7 days to restore it.')
      handleClose()
      onDeleted()
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || "Couldn't delete this site. Try again.")
      setIsDeleting(false)
    }
  }

  const handlePermanentDelete = async () => {
    if (permanentConfirm !== siteDomain) return
    setIsPermanentDeleting(true)
    try {
      await permanentDeleteSite(siteId)
      toast.success('Site permanently deleted')
      handleClose()
      onDeleted()
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || "Couldn't permanently delete this site. Try again.")
      setIsPermanentDeleting(false)
    }
  }

  const confirmInputClass =
    'w-full rounded-none border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

  return (
    <Modal isOpen={open} onClose={handleClose} title={`Delete ${siteName || 'Site'}?`} className="max-w-sm">
      {!showPermanent ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This site will be scheduled for deletion with a <span className="font-semibold">7-day grace period</span>. You
            can restore it at any time during this period.
          </p>

          <div className="space-y-2">
            <WarningRow>All events and analytics data</WarningRow>
            <WarningRow>Alert channels and goals</WarningRow>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Type <span className="font-mono font-semibold text-destructive">DELETE</span> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              autoComplete="off"
              className={confirmInputClass}
              placeholder="DELETE"
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleClose} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleSoftDelete}
              disabled={deleteConfirm !== 'DELETE' || isDeleting}
              isLoading={isDeleting}
            >
              Schedule deletion
            </Button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowPermanent(true)}
            className="w-full text-muted-foreground hover:text-destructive"
          >
            Permanently delete now (cannot be undone)
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This action is <span className="font-semibold">irreversible</span>. The site and all its data will be
            permanently deleted immediately.
          </p>

          <div className="space-y-2">
            <WarningRow>All analytics data will be permanently lost</WarningRow>
            <WarningRow>This cannot be undone</WarningRow>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Type <span className="font-mono font-semibold text-destructive">{siteDomain}</span> to confirm
            </label>
            <input
              type="text"
              value={permanentConfirm}
              onChange={(e) => setPermanentConfirm(e.target.value)}
              autoComplete="off"
              className={confirmInputClass}
              placeholder={siteDomain}
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                if (permanentOnly) {
                  handleClose()
                } else {
                  setShowPermanent(false)
                  setPermanentConfirm('')
                }
              }}
              disabled={isPermanentDeleting}
            >
              {permanentOnly ? 'Cancel' : 'Back'}
            </Button>
            <Button
              variant="destructive"
              onClick={handlePermanentDelete}
              disabled={permanentConfirm !== siteDomain || isPermanentDeleting}
              isLoading={isPermanentDeleting}
            >
              Delete forever
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
