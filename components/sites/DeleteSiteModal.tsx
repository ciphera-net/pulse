'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { toast, getAuthErrorMessage, AlertTriangleIcon, XIcon } from '@ciphera-net/ui'
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

export default function DeleteSiteModal({ open, onClose, onDeleted, siteName, siteDomain, siteId, permanentOnly }: DeleteSiteModalProps) {
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [showPermanent, setShowPermanent] = useState(!!permanentOnly)
  const [permanentConfirm, setPermanentConfirm] = useState('')
  const [isPermanentDeleting, setIsPermanentDeleting] = useState(false)

  useEffect(() => {
    if (open && permanentOnly) {
      setShowPermanent(true)
    }
  }, [open, permanentOnly])

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
      toast.error(getAuthErrorMessage(error) || 'Failed to delete site')
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
      toast.error(getAuthErrorMessage(error) || 'Failed to permanently delete site')
      setIsPermanentDeleting(false)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm p-4 pointer-events-none"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-sm bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-red-200 dark:border-red-900 shadow-xl pointer-events-auto"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-red-600 dark:text-red-500">Delete {siteName || 'Site'}?</h3>
              <button
                onClick={handleClose}
                className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-white"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {!showPermanent ? (
              <>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                  This site will be scheduled for deletion with a <span className="font-bold">7-day grace period</span>. You can restore it at any time during this period.
                </p>

                <div className="mb-5 space-y-2">
                  <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-lg">
                    <AlertTriangleIcon className="h-4 w-4 text-red-500 shrink-0" />
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">
                      All events and analytics data
                    </span>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-lg">
                    <AlertTriangleIcon className="h-4 w-4 text-red-500 shrink-0" />
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">
                      Report schedules and goals
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Type <span className="font-mono font-bold text-red-600 dark:text-red-400">DELETE</span> to confirm
                    </label>
                    <input
                      type="text"
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      autoComplete="off"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400"
                      placeholder="DELETE"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="flex-1 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
                      disabled={isDeleting}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSoftDelete}
                      disabled={deleteConfirm !== 'DELETE' || isDeleting}
                      className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDeleting ? 'Deleting...' : 'Schedule Deletion'}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowPermanent(true)}
                    className="w-full text-center text-xs text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  >
                    Permanently delete now (cannot be undone)
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                  This action is <span className="font-bold">irreversible</span>. The site and all its data will be permanently deleted immediately.
                </p>

                <div className="mb-5 space-y-2">
                  <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-lg">
                    <AlertTriangleIcon className="h-4 w-4 text-red-500 shrink-0" />
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">
                      All analytics data will be permanently lost
                    </span>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-lg">
                    <AlertTriangleIcon className="h-4 w-4 text-red-500 shrink-0" />
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">
                      This cannot be undone
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Type <span className="font-mono font-bold text-red-600 dark:text-red-400">{siteDomain}</span> to confirm
                    </label>
                    <input
                      type="text"
                      value={permanentConfirm}
                      onChange={(e) => setPermanentConfirm(e.target.value)}
                      autoComplete="off"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400"
                      placeholder={siteDomain}
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (permanentOnly) {
                          handleClose()
                        } else {
                          setShowPermanent(false)
                          setPermanentConfirm('')
                        }
                      }}
                      className="flex-1 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
                      disabled={isPermanentDeleting}
                    >
                      {permanentOnly ? 'Cancel' : 'Back'}
                    </button>
                    <button
                      onClick={handlePermanentDelete}
                      disabled={permanentConfirm !== siteDomain || isPermanentDeleting}
                      className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isPermanentDeleting ? 'Deleting...' : 'Delete Forever'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
