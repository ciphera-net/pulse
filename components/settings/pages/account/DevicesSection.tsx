'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, toast } from '@ciphera-net/facet'
import { Devices } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { listDevices, signOutDevice, signOutOtherDevices, isCurrentDeviceUnknown, type Device } from '@/lib/api/devices'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { DESTRUCTIVE_OUTLINE } from '@/components/settings/unified/DangerZone'
import { KitBlock, KitRow, KitRows, KitSection, KitStatus } from '@/components/settings/kit/Kit'
import { agoLabel, dayLabel } from './format'
import { LoadingRows } from './parts'

/** R39: this device, then the five used most recently; the rest behind "Show all". */
export const DEVICES_SHOWN = 6
// Within two minutes reads as now, as the drawing does.
const ACTIVE_NOW_MS = 120_000

const APP_NAMES: Record<string, string> = {
  id: 'Ciphera ID',
  'pulse-app': 'Pulse',
  warden: 'Warden',
  link: 'Link',
}

// One order whatever order the server sends: "Pulse and Ciphera ID", as the deck words it.
const APP_ORDER = ['pulse-app', 'id', 'warden', 'link']

/** "A", "A and B", "A, B and C"; an unknown client id is dropped. */
export function describeApps(apps: string[]): string {
  const names = APP_ORDER.filter((a) => apps.includes(a)).map((a) => APP_NAMES[a])
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** This device first, then by when each was last used. */
export function sortDevices(devices: Device[]): Device[] {
  return [...devices].sort(
    (a, b) => Number(b.is_current) - Number(a.is_current) || b.last_active_at.localeCompare(a.last_active_at),
  )
}

/**
 * Devices: every browser signed in to the account. Signing one out is one click, no confirmation (the standing
 * ruling for this list); signing out this browser signs you out here too.
 */
export default function DevicesSection() {
  const { logout } = useAuth()
  const { zone } = useDisplayZone()
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [currentDeviceKnown, setCurrentDeviceKnown] = useState(false)
  const [failed, setFailed] = useState(false)
  const [showAll, setShowAll] = useState(false)
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
      toast.success(`Signed out of ${device.display_hint}`)
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
      toast.success('Signed out everywhere else')
      await load()
    } catch (err) {
      toast.error(isCurrentDeviceUnknown(err)
        ? "This browser isn't recognised yet. Sign in again on it, then try again."
        : "Couldn't sign out your other devices. Try again.")
    } finally {
      setSigningOutOthers(false)
    }
  }

  const sorted = devices ? sortDevices(devices) : []
  const listed = showAll ? sorted : sorted.slice(0, DEVICES_SHOWN)
  const others = sorted.filter((d) => !d.is_current)

  let body: React.ReactNode
  if (failed) {
    body = (
      <KitRows>
        <KitRow
          label="Couldn't load your devices. Try again."
          control={<Button variant="outline" size="sm" onClick={() => void load()}>Try again</Button>}
        />
      </KitRows>
    )
  } else if (devices === null) {
    body = <LoadingRows rows={3} />
  } else if (devices.length === 0) {
    body = (
      <KitRows>
        <KitRow label="No devices" caption="Signing in adds one." />
      </KitRows>
    )
  } else {
    const now = Date.now()
    body = (
      <KitRows>
        {listed.map((d) => {
          const activeNow = d.is_current || now - new Date(d.last_active_at).getTime() < ACTIVE_NOW_MS
          const apps = describeApps(d.apps)
          return (
            <div key={d.id} data-account-device={d.is_current ? 'current' : 'other'}>
              <KitRow
                label={d.is_current ? `This device · ${d.display_hint}` : d.display_hint}
                caption={
                  <>
                    <KitStatus tone={activeNow ? 'live' : 'off'}>
                      {activeNow ? 'Active now' : `Active ${agoLabel(d.last_active_at, zone, now)}`}
                    </KitStatus>
                    {`${apps ? ` · ${apps}` : ''} · Signed in ${dayLabel(d.signed_in_at, zone)}`}
                  </>
                }
                control={
                  <Button
                    variant="outline"
                    size="sm"
                    className={DESTRUCTIVE_OUTLINE}
                    disabled={signingOutId === d.id}
                    onClick={() => void signOut(d)}
                  >
                    {signingOutId === d.id ? 'Signing out…' : 'Sign out'}
                  </Button>
                }
              />
            </div>
          )
        })}
        {listed.length < sorted.length && (
          <KitBlock>
            <Button variant="outline" size="sm" onClick={() => setShowAll(true)}>{`Show all ${sorted.length} browsers`}</Button>
          </KitBlock>
        )}
        <KitRow
          label="Everywhere else"
          caption="Sign out of every browser except this one."
          control={
            // Dimmed, not removed (R24). It stays off while this browser can't be named: without knowing what to spare,
            // it would sign you out here too.
            <Button
              variant="outline"
              size="sm"
              className={DESTRUCTIVE_OUTLINE}
              disabled={signingOutOthers || !currentDeviceKnown || others.length === 0}
              onClick={() => void signOutOthers()}
            >
              {signingOutOthers ? 'Signing out…' : 'Sign out everywhere else'}
            </Button>
          }
        />
      </KitRows>
    )
  }

  return (
    <KitSection
      title="Devices"
      description="Every browser signed in to your account. Signing one out ends its sessions in every Ciphera app; a page already open there can keep working for up to 16 minutes."
      icon={<Devices />}
    >
      {body}
    </KitSection>
  )
}
