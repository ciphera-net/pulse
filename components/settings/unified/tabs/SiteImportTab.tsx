'use client'

import { useCallback, useState } from 'react'
import { toast } from '@ciphera-net/facet'
import { useCan } from '@/lib/auth/permissions'
import { useSite } from '@/lib/swr/dashboard'
import { useImportSources } from '@/lib/import/useImportSources'
import { deleteImport } from '@/lib/import'
import { appTransport } from '@/lib/import/app-transport'
import { importErrorMessage, messageInputFromApiError } from '@/lib/import/messages'
import { sourceLabel, type SourceId } from '@/lib/import/source-display'
import type { ImportSource } from '@/lib/import/source-meta'
import type { SiteImportStatus } from '@/lib/api/dataImports'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { UploadFlow } from '@/components/settings/import/UploadFlow'
import { MatomoFlow } from '@/components/settings/import/MatomoFlow'
import { useImportSlot } from '@/components/settings/import/useImportSlot'

// ─── Site settings → Import (PULSE-118, design §3.10b; owner ruling Q-M11) ──
//
// Flow A: one panel, "Import history", one row per source the server lists (in
// the server's order, D6's), each opening its flow in place under its own row,
// one at a time. The site holds ONE import (the `data_imports_one_per_site`
// index), so while one exists the other rows lock and the panel says so once.
//
// Every member reads the status (§3.9, §3.10a constraint 5): the tab has no
// permission of its own, and only `integrations.manage` sees the controls.

export const PANEL_DESCRIPTION =
  "Bring this site's history from another analytics tool. Imported days are labelled as imported wherever they appear."
export const ONE_IMPORT_DESCRIPTION = 'One import per site. Delete this one to import from another tool.'
export const IDLE_FOOTNOTE = 'One import per site. An uploaded export is read in your browser and never sent to Pulse.'

export default function SiteImportTab({ siteId }: { siteId: string }) {
  const canManage = useCan('integrations.manage')
  const sourcesState = useImportSources(siteId)
  const sources = sourcesState.status === 'available' ? sourcesState.sources : []
  // The slot is read through the upload window, which answers for an upload source.
  const discovery = sources.find((s) => s.flow === 'upload')?.id ?? null
  const [localUpload, setLocalUpload] = useState<SourceId | null>(null)
  const slot = useImportSlot(siteId, discovery, { localUpload: localUpload !== null })
  const { data: site } = useSite(siteId)

  const [open, setOpen] = useState<SourceId | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const existing = slot.status === 'ready' ? slot.existing : null
  const holder: string | null = existing?.source ?? localUpload

  // The server's newest word on the import: take it when a request just answered
  // with it, else read the slot again.
  const replace = useCallback(
    (status?: SiteImportStatus | null) => {
      if (slot.status !== 'ready') return
      if (status === undefined) void slot.refresh()
      else slot.set(status)
    },
    [slot],
  )

  if (sourcesState.status === 'loading' || (sourcesState.status === 'available' && slot.status === 'loading')) {
    return <SettingsLoadingState rows={6} />
  }
  if (sourcesState.status === 'error') {
    return (
      <SettingsErrorState
        title="Couldn't load the import sources"
        message="This is usually temporary. Nothing about your data has changed."
        onRetry={sourcesState.retry}
      />
    )
  }
  // The route renders the standard not-found state for this case (M11-b); a tab
  // rendered anyway shows nothing rather than a panel with no way in.
  if (sourcesState.status === 'unavailable') return null
  if (slot.status === 'error') {
    return (
      <SettingsErrorState
        title="Couldn't load this site's import"
        message="This is usually temporary. The import itself isn't affected."
        onRetry={slot.retry}
      />
    )
  }

  const doDelete = async () => {
    if (!existing) return
    const tool = sourceLabel(existing.source)
    try {
      await deleteImport({ siteId, importId: existing.id, transport: appTransport })
      toast.success(`Imported data from ${tool} deleted`)
    } catch (e) {
      const m = importErrorMessage(messageInputFromApiError(e), existing.source)
      toast.error(m?.text ?? "Couldn't delete the imported data. Try again.")
    } finally {
      setOpen(null)
      if (slot.status === 'ready') await slot.refresh()
    }
  }

  const discard = async (importId: string) => {
    await deleteImport({ siteId, importId, transport: appTransport })
    if (slot.status === 'ready') await slot.refresh()
  }

  return (
    <div className="space-y-8">
      <SettingsPanel title="Import history" description={holder ? ONE_IMPORT_DESCRIPTION : PANEL_DESCRIPTION}>
        <PanelRows>
          {sources.map((s) => {
            const mine = existing?.source === s.id ? existing : null
            const locked = holder !== null && holder !== s.id
            if (s.flow === 'upload') {
              return (
                <UploadFlow
                  key={s.id}
                  siteId={siteId}
                  source={s.id as ImportSource}
                  existing={mine}
                  locked={locked}
                  open={open === s.id}
                  onOpen={() => setOpen(s.id)}
                  onClose={() => setOpen((cur) => (cur === s.id ? null : cur))}
                  canManage={canManage}
                  siteTimezone={site?.timezone ?? null}
                  onRequestDelete={() => setConfirmDelete(true)}
                  onLocalChange={(active) => setLocalUpload((cur) => (active ? s.id : cur === s.id ? null : cur))}
                  onFinished={(status) => replace(status)}
                  onServerChanged={() => replace()}
                />
              )
            }
            return (
              <MatomoFlow
                key={s.id}
                siteId={siteId}
                existing={mine}
                locked={locked}
                open={open === s.id}
                onOpen={() => setOpen(s.id)}
                onClose={() => setOpen((cur) => (cur === s.id ? null : cur))}
                canManage={canManage}
                onRequestDelete={() => setConfirmDelete(true)}
                onDiscard={discard}
                onChanged={(status) => replace(status)}
              />
            )
          })}
          {!holder && <PanelRow caption={IDLE_FOOTNOTE} />}
        </PanelRows>
      </SettingsPanel>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete imported data"
        description={`This removes everything imported from ${existing ? sourceLabel(existing.source) : 'the other tool'} from every chart, card, export and API answer. Data Pulse measured itself isn't touched.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={doDelete}
      />
    </div>
  )
}
