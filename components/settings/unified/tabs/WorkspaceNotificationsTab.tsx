'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Toggle, toast, Spinner } from '@ciphera-net/ui'
import { useAuth } from '@/lib/auth/context'
import { getNotificationSettings, updateNotificationSettings, type NotificationSettingsResponse } from '@/lib/api/notification-settings'

export default function WorkspaceNotificationsTab({ onDirtyChange, onRegisterSave }: { onDirtyChange?: (dirty: boolean) => void; onRegisterSave?: (fn: () => Promise<void>) => void }) {
  const { user } = useAuth()
  const [data, setData] = useState<NotificationSettingsResponse | null>(null)
  const [settings, setSettings] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const initialRef = useRef('')
  const hasInitialized = useRef(false)

  useEffect(() => {
    if (!user?.org_id) return
    getNotificationSettings()
      .then(resp => {
        setData(resp)
        setSettings(resp.settings || {})
        if (!hasInitialized.current) {
          initialRef.current = JSON.stringify(resp.settings || {})
          hasInitialized.current = true
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user?.org_id])

  // Track dirty state
  useEffect(() => {
    if (!initialRef.current) return
    onDirtyChange?.(JSON.stringify(settings) !== initialRef.current)
  }, [settings, onDirtyChange])

  const handleToggle = (key: string) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSave = useCallback(async () => {
    try {
      await updateNotificationSettings(settings)
      initialRef.current = JSON.stringify(settings)
      onDirtyChange?.(false)
      toast.success('Notification preferences updated')
    } catch {
      toast.error('Failed to update notification preferences')
    }
  }, [settings, onDirtyChange])

  useEffect(() => {
    onRegisterSave?.(handleSave)
  }, [handleSave, onRegisterSave])

  if (loading) return <div className="flex items-center justify-center py-12"><Spinner className="w-6 h-6 text-neutral-500" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Notifications</h3>
        <p className="text-sm text-neutral-400">Choose what notifications you receive.</p>
      </div>

      <div className="space-y-1">
        {(data?.categories || []).map(cat => (
          <div key={cat.id} className="flex items-center justify-between py-3 px-4 rounded-xl hover:bg-neutral-800/20 transition-colors">
            <div>
              <p className="text-sm font-medium text-white">{cat.label}</p>
              <p className="text-xs text-neutral-400">{cat.description}</p>
            </div>
            <Toggle checked={settings[cat.id] ?? false} onChange={() => handleToggle(cat.id)} />
          </div>
        ))}

        {(!data?.categories || data.categories.length === 0) && (
          <p className="text-sm text-neutral-500 text-center py-6">No notification preferences available.</p>
        )}
      </div>
    </div>
  )
}
