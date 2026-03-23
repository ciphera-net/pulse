'use client'

import { useState, useEffect } from 'react'
import { toast, Spinner } from '@ciphera-net/ui'
import { useAuth } from '@/lib/auth/context'
import { getNotificationSettings, updateNotificationSettings, type NotificationSettingsResponse } from '@/lib/api/notification-settings'

export default function WorkspaceNotificationsTab() {
  const { user } = useAuth()
  const [data, setData] = useState<NotificationSettingsResponse | null>(null)
  const [settings, setSettings] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.org_id) return
    getNotificationSettings()
      .then(resp => {
        setData(resp)
        setSettings(resp.settings || {})
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user?.org_id])

  const handleToggle = async (key: string) => {
    const prev = { ...settings }
    const updated = { ...settings, [key]: !settings[key] }
    setSettings(updated)
    try {
      await updateNotificationSettings(updated)
    } catch {
      setSettings(prev)
      toast.error('Failed to update notification preference')
    }
  }

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
            <button
              onClick={() => handleToggle(cat.id)}
              className={`relative w-10 h-6 rounded-full transition-colors duration-200 ${settings[cat.id] ? 'bg-brand-orange' : 'bg-neutral-700'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${settings[cat.id] ? 'translate-x-4' : ''}`} />
            </button>
          </div>
        ))}

        {(!data?.categories || data.categories.length === 0) && (
          <p className="text-sm text-neutral-500 text-center py-6">No notification preferences available.</p>
        )}
      </div>
    </div>
  )
}
