'use client'

import { useState } from 'react'
import { useSWRConfig } from 'swr'
import { toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { useIsAdminOrOwner } from '@/lib/auth/permissions'
import { setBetaFeatures } from '@/lib/api/organization'
import { useOrganization } from '@/lib/swr/organizations'
import { setTeamFeatures } from '@/lib/features'
import { BETAS } from '@/lib/betas'
import { BetaFeaturesPanel } from '@/components/settings/BetaFeaturesPanel'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'

// The server-decided lists the betas change, read again after a switch (lib/betas.ts).
const REVALIDATED = new Set(BETAS.flatMap((b) => b.revalidates))

/**
 * Settings → Beta (PUL-40): the team's beta-features switch, on a tab of its own. An owner or admin
 * changes it; everybody else sees its state. A switch shows at once: the server answers with the
 * team's betas, which go into the /me cache, and the lists a beta changes are read again.
 */
export default function WorkspaceBetaTab() {
  const canEdit = useIsAdminOrOwner()
  const { organization, error, mutate: mutateOrganization } = useOrganization()
  const { mutate } = useSWRConfig()
  const [saving, setSaving] = useState(false)
  const [retrying, setRetrying] = useState(false)

  if (error && !organization) {
    return (
      <SettingsErrorState
        title="Couldn't load beta features"
        message="This is usually temporary. Try again in a moment."
        onRetry={async () => {
          setRetrying(true)
          try {
            await mutateOrganization()
          } finally {
            setRetrying(false)
          }
        }}
        retrying={retrying}
      />
    )
  }
  if (!organization) return <SettingsLoadingState rows={1} />

  const handleToggle = async () => {
    const previous = organization
    const next = !previous.beta_features_enabled
    // Optimistic: the switch answers the finger at once and goes back if the save fails, never
    // left showing a state the server does not hold.
    setSaving(true)
    void mutateOrganization({ ...previous, beta_features_enabled: next }, { revalidate: false })
    try {
      const { features, ...saved } = await setBetaFeatures(previous.id, next)
      void mutateOrganization(saved, { revalidate: false })
      setTeamFeatures(mutate, previous.id, features)
      // A bare mutate keeps what is on screen while it re-reads, and drops the dedupe entry so a
      // list that mounts later fetches anew.
      void mutate((key) => Array.isArray(key) && REVALIDATED.has(key[0]))
    } catch (err) {
      void mutateOrganization(previous, { revalidate: false })
      toast.error(getAuthErrorMessage(err as Error) || "Couldn't save your changes. Try again in a moment.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <BetaFeaturesPanel
        on={organization.beta_features_enabled}
        canEdit={canEdit}
        saving={saving}
        onToggle={handleToggle}
        inBeta={BETAS.map((b) => b.name)}
      />
    </div>
  )
}
