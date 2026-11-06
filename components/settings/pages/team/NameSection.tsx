'use client'

import { useState, type ChangeEvent } from 'react'
import { Input, toast } from '@ciphera-net/facet'
import { IdentificationBadge } from '@phosphor-icons/react'
import { KitRow, KitRows, KitSection } from '@/components/settings/kit/Kit'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import { ApiError } from '@/lib/api/client'
import { updateOrganization } from '@/lib/api/organization'
import { useIsAdminOrOwner } from '@/lib/auth/permissions'
import { useOrganization, useUserOrganizations } from '@/lib/swr/organizations'
import { KitLoadError, KitLoadingRows } from './states'
import { teamNameFits } from './words'

const CAPTION = 'Everyone in the team sees it in Pulse.'
const LENGTH_ERROR = 'Use 2 to 50 characters.'

/**
 * Name (copy deck §9.2): the team's name, saved through the save bar. The slug field is gone (R2); the rename route
 * still requires one, so the save sends the slug the team already has, which nothing on the page can change.
 * Hidden for somebody alone: their name shows nowhere, and the first invite asks for it (§9.11.6).
 */
export function NameSection() {
  // The server lets the owner or an admin rename the team.
  const canEdit = useIsAdminOrOwner()
  const { organization, error, mutate } = useOrganization()
  const { mutate: revalidateOrganizations } = useUserOrganizations()
  // null while the field shows the saved name: an answer read again while nobody is typing follows the server.
  const [draft, setDraft] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const saved = organization?.name ?? ''
  const value = draft ?? saved
  const isDirty = draft !== null && draft.trim() !== saved

  const retry = async () => {
    setRetrying(true)
    try {
      await mutate()
    } finally {
      setRetrying(false)
    }
  }

  const handleSave = async () => {
    if (!organization) throw new Error('The team has not loaded')
    const name = value.trim()
    if (!teamNameFits(name)) {
      toast.error(LENGTH_ERROR)
      // Rejects, so the bar keeps the draft and never says "Saved".
      throw new Error('Team name length')
    }
    try {
      const updated = await updateOrganization(organization.id, name, organization.slug)
      await mutate({ ...organization, ...updated }, { revalidate: false })
      setDraft(null)
      // The account menu lists teams by name.
      void revalidateOrganizations()
    } catch (err) {
      // The route answers 400 only for a name outside 2 to 50 characters (the slug sent is the team's own).
      toast.error(err instanceof ApiError && err.status === 400 ? LENGTH_ERROR : "Couldn't save the name. Try again.")
      throw err
    }
  }

  return (
    <>
      <KitSection title="Name" icon={<IdentificationBadge />}>
        <KitRows>
          {organization ? (
            <KitRow
              label="Team name"
              htmlFor="team-name"
              caption={canEdit ? CAPTION : `${CAPTION} Only the owner or an admin can change the name.`}
            >
              <Input
                id="team-name"
                value={value}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
                placeholder="Acme"
                disabled={!canEdit}
              />
            </KitRow>
          ) : error ? (
            <KitLoadError title="Couldn't load your team" onRetry={retry} retrying={retrying} />
          ) : (
            <KitLoadingRows />
          )}
        </KitRows>
      </KitSection>
      {canEdit && organization && <SettingsSaveBar isDirty={isDirty} onSave={handleSave} onDiscard={() => setDraft(null)} />}
    </>
  )
}
