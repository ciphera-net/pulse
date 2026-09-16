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
import { EmptyRow, SettingsPanel } from '@/components/settings/panels'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { formatRelativeTime, formatDateTimeFull, formatDate } from '@/lib/utils/formatDate'

/** Muted line glyph for a device row: phone or laptop, never a tinted tile. */
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
      setError(err instanceof Error ? err.message : "Couldn't load your trusted devices.")
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
      toast.error(getAuthErrorMessage(err as Error) || "Couldn't remove the device. Try again in a moment.")
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <>
      {loading ? (
        <SettingsLoadingState rows={3} />
      ) : error ? (
        <SettingsErrorState
          title="Couldn't load your trusted devices"
          message={error}
          onRetry={handleRetry}
        />
      ) : (
        <SettingsPanel
          title="Trusted devices"
          description="Devices that have signed in to your account. Removing a device means the next sign-in from it triggers a new-device alert."
        >
          {devices.length === 0 ? (
            <EmptyRow
              icon={<Laptop weight="regular" />}
              title="No trusted devices yet"
              caption="Devices are added automatically the first time you sign in and verify your session."
            />
          ) : (
            <Table aria-label="Trusted devices" containerClassName="border-0">
              <THead>
                <TR>
                  <TH>Device</TH>
                  {/* First seen drops out below sm: Last seen carries the
                      signal and the table then fits a ~358px viewport. */}
                  <TH className="hidden sm:table-cell">First seen</TH>
                  <TH numeric>Last seen</TH>
                  <TH className="w-px">
                    <span className="sr-only">Actions</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {devices.map(device => (
                  <TR key={device.id}>
                    <TD>
                      <div className="flex min-w-0 items-center gap-3">
                        <DeviceGlyph hint={device.display_hint} />
                        <span
                          className="min-w-0 flex-1 truncate font-medium text-foreground"
                          title={device.display_hint || 'Unknown device'}
                        >
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
                      className="hidden whitespace-nowrap text-xs text-muted-foreground sm:table-cell"
                      title={formatDateTimeFull(new Date(device.first_seen_at))}
                    >
                      {/* One format per column: first seen is a fixed fact, so
                          the calendar date; last seen is a moving one, so
                          relative. Relative in both columns read as
                          "5h ago / 25/08 / 1d ago" down one column (staging,
                          16-09-2026), which is the fault §4.7 named. */}
                      {formatDate(new Date(device.first_seen_at))}
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
        </SettingsPanel>
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
    </>
  )
}
