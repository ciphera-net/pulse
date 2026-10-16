'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, toast } from '@ciphera-net/facet'
import { Laptop, DeviceMobile } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import {
  listDevices,
  signOutDevice,
  signOutOtherDevices,
  isCurrentDeviceUnknown,
  type Device,
} from '@/lib/api/devices'
import { SettingsPanel, PanelRow, PanelRows, EmptyRow } from '@/components/settings/panels'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { formatDate, formatRelativeTime } from '@/lib/utils/formatDate'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'

const APP_NAMES: Record<string, string> = {
  id: 'Ciphera ID',
  'pulse-app': 'Pulse',
  warden: 'Warden',
  link: 'Link',
}

/** "A", "A and B", "A, B and C" — an unknown client id is simply dropped. */
function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function describeApps(apps: string[]): string {
  return joinWithAnd(apps.map((a) => APP_NAMES[a]).filter((n): n is string => Boolean(n)))
}

/** "now" under a minute, otherwise formatRelativeTime's usual "5m ago" / "2h ago" / date. */
function describeActive(lastActiveAt: string): string {
  const rel = formatRelativeTime(lastActiveAt)
  return rel === 'Just now' ? 'now' : rel
}

/** Muted line glyph for a device row: phone or laptop, never a tinted tile. */
function DeviceGlyph({ hint }: { hint: string }) {
  const h = hint.toLowerCase()
  const isMobile = h.includes('ios') || h.includes('android')
  const Glyph = isMobile ? DeviceMobile : Laptop
  return <Glyph size={18} weight="regular" className="shrink-0 text-muted-foreground" />
}

/**
 * Devices — every browser signed in to the account, one row each. Signing one
 * out ends every session it holds, in every app; "Everywhere else" ends every
 * session but this browser's.
 *
 * Replaces the pair this tab used to carry: trusted devices (one row per IP
 * address) and active sessions (one row per refresh token, every row reading
 * "Unknown device"). A standing ruling for this tab: signing a device out is
 * one click, no confirmation — the ruling SessionsPanel already followed for
 * sessions.
 */
export default function DevicesPanel() {
  const { logout } = useAuth()
  const { zone } = useDisplayZone()
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [currentDeviceKnown, setCurrentDeviceKnown] = useState(false)
  const [failed, setFailed] = useState(false)
  const [signingOutId, setSigningOutId] = useState<string | null>(null)
  const [signingOutOthers, setSigningOutOthers] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const data = await listDevices()
      setDevices(data.devices ?? [])
      setCurrentDeviceKnown(data.current_device_known)
    } catch {
      setDevices(null)
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const signOut = async (device: Device) => {
    setSigningOutId(device.id)
    try {
      const result = await signOutDevice(device.id)
      if (result.this_device) {
        logout()
        return
      }
      toast.success(`Signed out of ${device.display_hint}.`)
      await load()
    } catch {
      toast.error("Couldn't sign that device out. Try again.")
    } finally {
      setSigningOutId(null)
    }
  }

  const signOutOthers = async () => {
    setSigningOutOthers(true)
    try {
      await signOutOtherDevices()
      toast.success('Signed out of every other device.')
      await load()
    } catch (err) {
      if (isCurrentDeviceUnknown(err)) {
        const message =
          (err.data as { error?: string } | undefined)?.error ??
          "This browser isn't recognised yet. Sign in again on it, then try again."
        toast.error(message)
      } else {
        toast.error("Couldn't sign out your other devices. Try again.")
      }
    } finally {
      setSigningOutOthers(false)
    }
  }

  const otherDevices = (devices ?? []).filter((d) => !d.is_current)

  return (
    <SettingsPanel
      title="Devices"
      description="Every browser signed in to your account. Signing one out ends all of its sessions, in every app."
    >
      {failed ? (
        <SettingsErrorState
          variant="banner"
          className="m-5"
          message="Couldn't load your devices. Try again."
          onRetry={() => void load()}
        />
      ) : devices === null ? (
        <SettingsLoadingState rows={3} />
      ) : devices.length === 0 ? (
        <EmptyRow icon={<Laptop weight="regular" />} title="No devices" caption="Signing in adds one." />
      ) : (
        <PanelRows>
          {devices.map((device) => (
            <PanelRow
              key={device.id}
              leading={<DeviceGlyph hint={device.display_hint} />}
              label={
                <span className="flex items-center gap-2">
                  {device.display_hint}
                  {device.is_current && <StatusChip tone="neutral">This device</StatusChip>}
                </span>
              }
              caption={`${describeApps(device.apps)} · Signed in ${formatDate(new Date(device.signed_in_at), zone)} · Active ${describeActive(device.last_active_at)}`}
              control={
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={signingOutId === device.id}
                  onClick={() => void signOut(device)}
                >
                  {signingOutId === device.id ? 'Signing out…' : 'Sign out'}
                </Button>
              }
            />
          ))}
          {currentDeviceKnown && otherDevices.length > 0 && (
            <PanelRow
              label="Everywhere else"
              caption="Sign out of every browser except this one."
              control={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={signingOutOthers}
                  onClick={() => void signOutOthers()}
                >
                  {signingOutOthers ? 'Signing out…' : 'Sign out of all other devices'}
                </Button>
              }
            />
          )}
        </PanelRows>
      )}
    </SettingsPanel>
  )
}
