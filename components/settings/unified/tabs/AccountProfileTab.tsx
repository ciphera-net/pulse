'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button, Input, toast, Spinner } from '@ciphera-net/ui'
import { useAuth } from '@/lib/auth/context'
import { updateDisplayName } from '@/lib/api/user'
import { deleteAccount } from '@/lib/api/user'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import { DangerZone } from '@/components/settings/unified/DangerZone'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'

export default function AccountProfileTab({ onDirtyChange, onRegisterSave }: { onDirtyChange?: (dirty: boolean) => void; onRegisterSave?: (fn: () => Promise<void>) => void }) {
  const { user, refresh, logout } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const initialRef = useRef('')
  const hasInitialized = useRef(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!user || hasInitialized.current) return
    setDisplayName(user.display_name || '')
    initialRef.current = user.display_name || ''
    hasInitialized.current = true
  }, [user])

  // Track dirty state
  const isDirty = hasInitialized.current
    ? displayName !== initialRef.current
    : false

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  const handleDiscard = () => {
    setDisplayName(initialRef.current)
  }

  const handleSave = useCallback(async () => {
    try {
      await updateDisplayName(displayName.trim())
      await refresh()
      initialRef.current = displayName.trim()
      onDirtyChange?.(false)
      toast.success('Profile updated')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to update profile')
    }
  }, [displayName, refresh, onDirtyChange])

  useEffect(() => {
    onRegisterSave?.(handleSave)
  }, [handleSave, onRegisterSave])

  const handleDelete = async () => {
    if (deleteText !== 'DELETE' || !deletePassword) return
    setDeleting(true)
    try {
      await deleteAccount(deletePassword)
      logout()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to delete account')
      setDeleting(false)
    }
  }

  if (!user) return <div className="flex items-center justify-center py-12"><Spinner className="w-6 h-6 text-neutral-500" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Profile</h3>
        <p className="text-sm text-neutral-400">Manage your personal account settings.</p>
      </div>

      {/* Display Name */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1.5">Display Name</label>
          <Input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1.5">Email Address</label>
          <Input value={user.email} disabled className="opacity-60" />
          <p className="text-xs text-neutral-500 mt-1">Email changes require password verification. Use <a href="https://id.ciphera.net/settings" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">Ciphera ID</a> to change your email.</p>
        </div>
      </div>

      {/* Danger Zone */}
      <DangerZone
        items={[
          {
            title: 'Delete Account',
            description: 'Permanently delete your account and all associated data.',
            buttonLabel: 'Delete',
            variant: 'solid',
            onClick: () => setShowDeleteConfirm(prev => {
              if (prev) { setDeleteText(''); setDeletePassword('') }
              return !prev
            }),
          },
        ]}
      />

      {showDeleteConfirm && (
        <div className="p-4 border border-red-900/50 bg-red-900/10 rounded-xl space-y-3">
          <p className="text-sm text-red-300">This will permanently delete:</p>
          <ul className="text-xs text-neutral-400 list-disc list-inside space-y-1">
            <li>Your account and all personal data</li>
            <li>All sessions and trusted devices</li>
            <li>You will be removed from all organizations</li>
          </ul>
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Your password</label>
            <Input
              type="password"
              value={deletePassword}
              onChange={e => setDeletePassword(e.target.value)}
              placeholder="Enter your password"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Type DELETE to confirm</label>
            <Input
              type="text"
              value={deleteText}
              onChange={e => setDeleteText(e.target.value)}
              placeholder="DELETE"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="bg-red-600 hover:bg-red-700 text-white border-red-600"
              onClick={handleDelete}
              disabled={deleteText !== 'DELETE' || !deletePassword || deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Account'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => { setShowDeleteConfirm(false); setDeleteText(''); setDeletePassword('') }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <SettingsSaveBar
        isDirty={isDirty}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </div>
  )
}
