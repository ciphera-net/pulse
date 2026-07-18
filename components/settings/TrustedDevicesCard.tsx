'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth/context'
import { getUserDevices, removeDevice, type TrustedDevice } from '@/lib/api/devices'
import { Button, Spinner, toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { Laptop } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { formatRelativeTime, formatDateTimeFull } from '@/lib/utils/formatDate'

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
  const [confirmDevice, setConfirmDevice] = useState<TrustedDevice | null>(null)

  const fetchDevices = useCallback(async () => {
    setError('')
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

  const handleRetry = useCallback(() => {
    setLoading(true)
    fetchDevices().finally(() => setLoading(false))
  }, [fetchDevices])

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
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to remove device')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-white mb-1">Trusted Devices</h2>
      <p className="text-neutral-400 text-sm mb-6">
        Devices that have signed in to your account. Removing a device means the next sign-in from it will trigger a new device alert.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : error ? (
        <SettingsErrorState message={error} onRetry={handleRetry} />
      ) : devices.length === 0 ? (
        <div className="bg-card border border-border">
          <EmptyState
            title="No trusted devices yet"
            description="Devices are added automatically the first time you sign in and verify your session."
            icon={<Laptop weight="regular" />}
          />
        </div>
      ) : (
        <div className="rounded-none border border-neutral-800 bg-neutral-800/30 divide-y divide-neutral-800">
          {devices.map((device) => (
            <div
              key={device.id}
              className="flex items-center gap-3 px-4 py-3 group"
            >
              <div className="flex-shrink-0 w-9 h-9 rounded-none flex items-center justify-center bg-neutral-800 text-neutral-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={getDeviceIcon(device.display_hint)} />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white text-sm truncate">
                    {device.display_hint || 'Unknown device'}
                  </span>
                  {device.is_current && (
                    <StatusChip tone="success" className="flex-shrink-0">This device</StatusChip>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-400">
                  <span title={formatDateTimeFull(new Date(device.first_seen_at))}>
                    First seen {formatRelativeTime(device.first_seen_at)}
                  </span>
                  <span>&middot;</span>
                  <span title={formatDateTimeFull(new Date(device.last_seen_at))}>
                    Last seen {formatRelativeTime(device.last_seen_at)}
                  </span>
                </div>
              </div>

              {!device.is_current && (
                <div className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity ease-apple">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-shrink-0 text-red-400 hover:text-red-300"
                    onClick={() => setConfirmDevice(device)}
                    disabled={removingId === device.id}
                  >
                    {removingId === device.id ? 'Removing...' : 'Remove'}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmDevice !== null}
        onOpenChange={(open) => { if (!open) setConfirmDevice(null) }}
        title="Remove device"
        description="A new sign-in from this device will trigger a security alert."
        confirmLabel="Remove"
        variant="danger"
        onConfirm={async () => {
          if (confirmDevice) await handleRemove(confirmDevice)
        }}
      />
    </div>
  )
}
