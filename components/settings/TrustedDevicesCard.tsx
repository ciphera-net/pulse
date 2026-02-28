'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth/context'
import { getUserDevices, removeDevice, type TrustedDevice } from '@/lib/api/devices'
import { Spinner, toast } from '@ciphera-net/ui'

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getDeviceIcon(hint: string): string {
  const h = hint.toLowerCase()
  if (h.includes('iphone') || h.includes('android') || h.includes('ios')) {
    return 'M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3'
  }
  return 'M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z'
}

export default function TrustedDevicesCard() {
  const { user } = useAuth()
  const [devices, setDevices] = useState<TrustedDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [removingId, setRemovingId] = useState<string | null>(null)

  const fetchDevices = useCallback(async () => {
    try {
      const data = await getUserDevices()
      setDevices(data.devices ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices')
    }
  }, [])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    fetchDevices().finally(() => setLoading(false))
  }, [user, fetchDevices])

  const handleRemove = async (device: TrustedDevice) => {
    if (device.is_current) {
      toast.error('You cannot remove the device you are currently using.')
      return
    }

    setRemovingId(device.id)
    try {
      await removeDevice(device.id)
      setDevices(prev => prev.filter(d => d.id !== device.id))
      toast.success('Device removed. A new sign-in from it will trigger an alert.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove device')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-1">Trusted Devices</h2>
      <p className="text-neutral-500 dark:text-neutral-400 text-sm mb-6">
        Devices that have signed in to your account. Removing a device means the next sign-in from it will trigger a new device alert.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-6 text-center">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : devices.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-center">
          <svg className="w-12 h-12 mx-auto mb-3 text-neutral-300 dark:text-neutral-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
          </svg>
          <p className="text-neutral-500 dark:text-neutral-400">No trusted devices yet. They appear after you sign in.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {devices.map((device) => (
            <div
              key={device.id}
              className="flex items-center gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3"
            >
              <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={getDeviceIcon(device.display_hint)} />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-neutral-900 dark:text-white text-sm truncate">
                    {device.display_hint || 'Unknown device'}
                  </span>
                  {device.is_current && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-950/40 text-green-600 dark:text-green-400 flex-shrink-0">
                      This device
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  <span title={formatFullDate(device.first_seen_at)}>
                    First seen {formatRelativeTime(device.first_seen_at)}
                  </span>
                  <span>&middot;</span>
                  <span title={formatFullDate(device.last_seen_at)}>
                    Last seen {formatRelativeTime(device.last_seen_at)}
                  </span>
                </div>
              </div>

              {!device.is_current && (
                <button
                  type="button"
                  onClick={() => handleRemove(device)}
                  disabled={removingId === device.id}
                  className="flex-shrink-0 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  {removingId === device.id ? 'Removing...' : 'Remove'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
