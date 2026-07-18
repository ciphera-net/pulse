'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth/context'
import { getUserDevices, removeDevice, type TrustedDevice } from '@/lib/api/devices'
import {
  Button,
  toast,
  getAuthErrorMessage,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from '@ciphera-net/facet'
import { Laptop, DeviceMobile } from '@phosphor-icons/react'
import { EmptyRow } from '@/components/settings/panels'
import { SettingsPanel } from '@/components/settings/panels'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { formatRelativeTime, formatDateTimeFull } from '@/lib/utils/formatDate'

/** Muted line glyph for a device row — phone vs. laptop, never a tinted tile. */
function DeviceGlyph({ hint }: { hint: string }) {
  const h = hint.toLowerCase()
  const isMobile =
    h.includes('iphone') ||
    h.includes('android') ||
    h.includes('ios') ||
    h.includes('mobile') ||
    h.includes('phone')
  const Glyph = isMobile ? DeviceMobile : Laptop
  return <Glyph size={18} weight="regular" className="shrink-0 text-muted-foreground" />
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
    <section className="space-y-4">
      <div className="min-w-0">
        <p className="font-mono text-micro-label uppercase text-muted-foreground">Trusted devices</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Devices that have signed in to your account. Removing a device means the next sign-in from
          it will trigger a new-device alert.
        </p>
      </div>

      {loading ? (
        <SettingsLoadingState rows={3} />
      ) : error ? (
        <SettingsErrorState message={error} onRetry={handleRetry} />
      ) : devices.length === 0 ? (
        <SettingsPanel>
          <EmptyRow
            icon={<Laptop weight="regular" />}
            title="No trusted devices yet"
            caption="Devices are added automatically the first time you sign in and verify your session."
          />
        </SettingsPanel>
      ) : (
        <Table aria-label="Trusted devices">
          <THead>
            <TR>
              <TH>Device</TH>
              <TH>First seen</TH>
              <TH>Last seen</TH>
              <TH className="w-px" aria-label="Actions" />
            </TR>
          </THead>
          <TBody>
            {devices.map(device => (
              <TR key={device.id}>
                <TD>
                  <div className="flex items-center gap-3">
                    <DeviceGlyph hint={device.display_hint} />
                    <span className="truncate font-medium text-foreground">
                      {device.display_hint || 'Unknown device'}
                    </span>
                    {device.is_current && (
                      <StatusChip tone="neutral" className="shrink-0">
                        This device
                      </StatusChip>
                    )}
                  </div>
                </TD>
                <TD
                  numeric
                  className="whitespace-nowrap text-xs text-muted-foreground"
                  title={formatDateTimeFull(new Date(device.first_seen_at))}
                >
                  {formatRelativeTime(device.first_seen_at)}
                </TD>
                <TD
                  numeric
                  className="whitespace-nowrap text-xs text-muted-foreground"
                  title={formatDateTimeFull(new Date(device.last_seen_at))}
                >
                  {formatRelativeTime(device.last_seen_at)}
                </TD>
                <TD className="text-right">
                  {!device.is_current && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirmDevice(device)}
                      disabled={removingId === device.id}
                    >
                      {removingId === device.id ? 'Removing…' : 'Remove'}
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
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
    </section>
  )
}
