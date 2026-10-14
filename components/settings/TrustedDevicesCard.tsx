'use client'

import { useEffect, useState, useCallback } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useAuth } from '@/lib/auth/context'
import { getUserDevices, removeDevice, type TrustedDevice } from '@/lib/api/devices'
import {
  Button,
  Table,
  THead,
  TBody,
  TR,
  TD,
} from '@ciphera-net/facet'
import { HoldDialog } from '@ciphera-net/facet-hold'
import { SettingsTH } from '@/components/settings/panels/SettingsTH'
import { Laptop, DeviceMobile, Prohibit } from '@phosphor-icons/react'
import { EmptyRow, SettingsPanel } from '@/components/settings/panels'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { useDeferredRemoval } from '@/lib/hold/useDeferredRemoval'
import { usePendingKeys } from '@/lib/hold/pending'
import { formatRelativeTime, formatDateTimeFull, formatDate } from '@/lib/utils/formatDate'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'

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
  const { zone } = useDisplayZone()
  const [devices, setDevices] = useState<TrustedDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmDevice, setConfirmDevice] = useState<TrustedDevice | null>(null)
  const reducedMotion = useReducedMotion()
  const removeLater = useDeferredRemoval()
  const pendingKeys = usePendingKeys()
  // Hidden at once while its removal waits behind the Undo bar (PUL-28).
  const visibleDevices = devices.filter((d) => !pendingKeys.has(`device:${d.id}`))

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

  // Hides the device at once; the request sends only when the Undo window
  // runs out (PUL-28).
  const confirmRemove = () => {
    if (!confirmDevice) return
    const device = confirmDevice
    setConfirmDevice(null)
    removeLater({
      key: `device:${device.id}`,
      message: `${device.display_hint || 'Unknown device'} removed`,
      send: ({ keepalive }) => removeDevice(device.id, { keepalive }),
      refresh: fetchDevices,
      failure: "Couldn't remove the device. Try again.",
    })
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
          {visibleDevices.length === 0 ? (
            <EmptyRow
              icon={<Laptop weight="regular" />}
              title="No trusted devices yet"
              caption="Devices are added automatically the first time you sign in and verify your session."
            />
          ) : (
            <Table aria-label="Trusted devices" containerClassName="border-0">
              <THead>
                <TR>
                  <SettingsTH>Device</SettingsTH>
                  {/* First seen drops out below sm: Last seen carries the
                      signal and the table then fits a ~358px viewport. */}
                  <SettingsTH className="hidden sm:table-cell">First seen</SettingsTH>
                  <SettingsTH numeric>Last seen</SettingsTH>
                  <SettingsTH className="w-px">
                    <span className="sr-only">Actions</span>
                  </SettingsTH>
                </TR>
              </THead>
              <TBody>
                {/* M5: a removed device row exits rather than popping out of
                    the list. `initial={false}` on both the AnimatePresence and
                    each row means a row already on the page never plays an
                    entrance (mirrors the api-keys/passkeys device); only a
                    later removal animates, and only when motion is allowed. */}
                <AnimatePresence initial={false}>
                  {visibleDevices.map(device => (
                    <motion.tr
                      key={device.id}
                      data-testid={`device-row-${device.id}`}
                      initial={false}
                      exit={reducedMotion ? undefined : { opacity: 0 }}
                      transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
                      className="border-b border-border transition-colors duration-fast ease-apple last:border-0 hover:bg-muted motion-reduce:transition-none"
                    >
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
                        title={formatDateTimeFull(new Date(device.first_seen_at), zone)}
                      >
                        {/* One format per column: first seen is a fixed fact, so
                            the calendar date; last seen is a moving one, so
                            relative. Relative in both columns read as
                            "5h ago / 25/08 / 1d ago" down one column (staging,
                            16-09-2026), which is the fault §4.7 named. */}
                        {formatDate(new Date(device.first_seen_at), zone)}
                      </TD>
                      <TD
                        numeric
                        className="whitespace-nowrap text-xs text-muted-foreground"
                        title={formatDateTimeFull(new Date(device.last_seen_at), zone)}
                      >
                        {formatRelativeTime(device.last_seen_at)}
                      </TD>
                      <TD className="text-right">
                        {!device.is_current && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground transition-colors duration-fast ease-apple hover:text-destructive motion-reduce:transition-none"
                            aria-haspopup="dialog"
                            onClick={() => setConfirmDevice(device)}
                          >
                            Remove
                          </Button>
                        )}
                      </TD>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TBody>
            </Table>
          )}
        </SettingsPanel>
      )}

      <HoldDialog
        open={confirmDevice !== null}
        onOpenChange={(open) => { if (!open) setConfirmDevice(null) }}
        title="Remove this device?"
        description="A new sign-in from this device will trigger a security alert."
        holdLabel="Hold to remove"
        icon={<Prohibit weight="bold" className="h-4 w-4" aria-hidden="true" />}
        onConfirm={confirmRemove}
      />
    </>
  )
}
