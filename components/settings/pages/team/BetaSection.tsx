'use client'

import { useState } from 'react'
import { useSWRConfig } from 'swr'
import { Toggle, toast } from '@ciphera-net/facet'
import { Flask } from '@phosphor-icons/react'
import { KitRow, KitRows, KitSection } from '@/components/settings/kit/Kit'
import { setBetaFeatures } from '@/lib/api/organization'
import { useIsAdminOrOwner } from '@/lib/auth/permissions'
import { BETAS } from '@/lib/betas'
import { setTeamFeatures } from '@/lib/features'
import { useOrganization } from '@/lib/swr/organizations'
import { KitLoadError, KitLoadingRows } from './states'

// The server-decided lists the betas change, read again after a switch (lib/betas.ts).
const REVALIDATED = new Set(BETAS.flatMap((b) => b.revalidates))

/**
 * Beta features (copy deck §9.7): the team's one switch. An owner or admin changes it; everybody else sees its state.
 * The switch moves at once and goes back if the save fails; the server's answer carries the team's betas, which go
 * into the /me cache, and the lists a beta changes are read again (as the Beta tab did, PUL-40).
 */
export function BetaSection({ alone }: { alone: boolean }) {
  const canEdit = useIsAdminOrOwner()
  const { organization, error, mutate: mutateOrganization } = useOrganization()
  const { mutate } = useSWRConfig()
  const [saving, setSaving] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const retry = async () => {
    setRetrying(true)
    try {
      await mutateOrganization()
    } finally {
      setRetrying(false)
    }
  }

  const handleToggle = async () => {
    if (!organization) return
    const previous = organization
    const next = !previous.beta_features_enabled
    setSaving(true)
    void mutateOrganization({ ...previous, beta_features_enabled: next }, { revalidate: false })
    try {
      const { features, ...saved } = await setBetaFeatures(previous.id, next)
      void mutateOrganization(saved, { revalidate: false })
      setTeamFeatures(mutate, previous.id, features)
      // A bare mutate keeps what is on screen while it re-reads, and drops the dedupe entry so a list that mounts
      // later fetches anew.
      void mutate((key) => Array.isArray(key) && REVALIDATED.has(key[0]))
    } catch {
      void mutateOrganization(previous, { revalidate: false })
      toast.error("Couldn't change beta features. Try again.")
    } finally {
      setSaving(false)
    }
  }

  // Somebody alone is never told about a team (PULSE-59): the switch is theirs.
  const caption = [
    alone ? null : 'For everyone in this team.',
    BETAS.length > 0 ? `Now in beta: ${BETAS.map((b) => b.name).join(', ')}.` : null,
    canEdit ? null : 'Only the owner or an admin can change this.',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <KitSection
      title="Beta features"
      description="New features before everyone gets them. Pulse may still change or remove them."
      icon={<Flask />}
    >
      <KitRows>
        {organization ? (
          <KitRow
            label="Use beta features"
            caption={caption || undefined}
            control={
              <Toggle
                checked={organization.beta_features_enabled}
                onChange={() => void handleToggle()}
                disabled={!canEdit || saving}
                aria-label="Use beta features"
              />
            }
          />
        ) : error ? (
          <KitLoadError title="Couldn't load beta features" onRetry={retry} retrying={retrying} />
        ) : (
          <KitLoadingRows />
        )}
      </KitRows>
    </KitSection>
  )
}
