'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toast } from '@ciphera-net/facet'
import { HoldDialog, useUndo } from '@ciphera-net/facet-hold'
import { Trash } from '@phosphor-icons/react'
import { useCan } from '@/lib/auth/permissions'
import { useSite } from '@/lib/swr/dashboard'
import { useImportSources } from '@/lib/import/useImportSources'
import { deleteImport } from '@/lib/import'
import { appTransport } from '@/lib/import/app-transport'
import { ga4CallbackMessage, importErrorMessage, messageInputFromApiError, type ImportMessage } from '@/lib/import/messages'
import { sourceLabel, type SourceId } from '@/lib/import/source-display'
import type { ImportSource } from '@/lib/import/source-meta'
import type { SiteImportStatus } from '@/lib/api/dataImports'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { UploadFlow } from '@/components/settings/import/UploadFlow'
import { MatomoFlow } from '@/components/settings/import/MatomoFlow'
import { GA4Flow } from '@/components/settings/import/GA4Flow'
import { useImportSlot } from '@/components/settings/import/useImportSlot'
import { ImportRecordRow } from '@/components/settings/import/ImportRows'
import { usePendingKeys, whilePending } from '@/lib/hold/pending'

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
  // Hand-rolled on useUndo rather than useDeferredRemoval (PUL-28): a failed
  // delete here reads through the import-specific error mapper, not the
  // generic auth-error message, and that mapping must survive the hold.
  const { defer } = useUndo()
  // The site's one import, hidden at once while its delete waits behind the
  // Undo bar: the slot renders as if nothing were imported.
  const pendingKeys = usePendingKeys()

  // GA4's OAuth callback lands the Google POPUP here with `?ga4=<code>` (M5-b,
  // forwarded by /sites/[id]/settings). The code is said in the GA4 row of the
  // popup's own page, then scrubbed from the address so a reload doesn't say it
  // again; the opener learns the outcome from its own revalidation.
  const [ga4Notice, setGa4Notice] = useState<ImportMessage | null>(null)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('ga4')
    if (code === null) return
    setGa4Notice(ga4CallbackMessage(code))
    params.delete('ga4')
    const rest = params.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`)
  }, [])

  const slotExisting = slot.status === 'ready' ? slot.existing : null
  // While the delete waits, the slot reads as empty but the server still holds
  // the import (one per site), so starting another would be refused: every row
  // stays locked until the delete is sent or undone.
  const deletePending = slotExisting !== null && pendingKeys.has(`import:${slotExisting.id}`)
  const existing = deletePending ? null : slotExisting
  const holder: string | null = existing?.source ?? localUpload

  // A row that another import locked is never left open. Two presses in one batch
  // (Import on one row, Connect on another) both land before the lock renders; the
  // row that did not take the slot closes here, before the browser paints it.
  useLayoutEffect(() => {
    if (open !== null && holder !== null && holder !== open) setOpen(null)
  }, [open, holder])

  // A request that answers after the tab has gone (an upload rejecting after the
  // site switched) must not read the slot again: its SWR hook is unmounted.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // One delete per confirm: a second press lands before the dialog's own guard
  // renders, and would answer "This import no longer exists" after a delete that worked.
  const deletingRef = useRef(false)

  // The server's newest word on the import: take it when a request just answered
  // with it, else read the slot again.
  const replace = useCallback(
    (status?: SiteImportStatus | null) => {
      if (!mountedRef.current || slot.status !== 'ready') return
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

  // The import disappears at once; the delete is sent when the Undo window
  // runs out (PUL-28).
  const doDelete = () => {
    if (!existing || deletingRef.current) return
    deletingRef.current = true
    const importId = existing.id
    const source = existing.source
    const tool = sourceLabel(source)
    // whilePending shows the slot's import again only after the refresh has
    // landed, so a deleted import never flashes back.
    defer(whilePending(`import:${importId}`, {
      message: `Imported data from ${tool} deleted`,
      commit: ({ keepalive }: { keepalive: boolean }) => deleteImport({ siteId, importId, transport: appTransport, keepalive }),
      onUndo: () => {
        deletingRef.current = false
      },
      onCommitted: async () => {
        try {
          if (mountedRef.current && slot.status === 'ready') await slot.refresh()
        } finally {
          deletingRef.current = false
        }
      },
      onError: (err: unknown) => {
        deletingRef.current = false
        const m = importErrorMessage(messageInputFromApiError(err), source)
        toast.error(m?.text ?? "Couldn't delete the imported data. Try again.")
      },
    }))
    setOpen(null)
  }

  const discard = async (importId: string) => {
    await deleteImport({ siteId, importId, transport: appTransport })
    if (mountedRef.current && slot.status === 'ready') await slot.refresh()
  }

  return (
    <div className="space-y-8">
      <SettingsPanel title="Import history" description={holder ? ONE_IMPORT_DESCRIPTION : PANEL_DESCRIPTION}>
        <PanelRows>
          {sources.map((s) => {
            const mine = existing?.source === s.id ? existing : null
            const locked = deletePending || (holder !== null && holder !== s.id)
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
            if (s.flow === 'ga4') {
              return (
                <GA4Flow
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
                  siteDomain={site?.domain ?? null}
                  siteTimezone={site?.timezone ?? null}
                  notice={ga4Notice}
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
          {existing && !sources.some((s) => s.id === existing.source) && (
            <ImportRecordRow status={existing} canManage={canManage} onRequestDelete={() => setConfirmDelete(true)} />
          )}
          {!holder && <PanelRow caption={IDLE_FOOTNOTE} />}
        </PanelRows>
      </SettingsPanel>

      <HoldDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete imported data?"
        description={`This removes everything imported from ${existing ? sourceLabel(existing.source) : 'the other tool'} from every chart, card, export and API answer. Data Pulse measured itself isn't touched.`}
        holdLabel="Hold to delete"
        icon={<Trash weight="bold" className="h-4 w-4" aria-hidden="true" />}
        onConfirm={doDelete}
      />
    </div>
  )
}
