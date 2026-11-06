'use client'

import { useEffect, useState } from 'react'
import { Button, toast } from '@ciphera-net/facet'
import { ClockCounterClockwise } from '@phosphor-icons/react'
import { useCan } from '@/lib/auth/permissions'
import { useBingStatus, useBunnyStatus, useGSCStatus, useSite } from '@/lib/swr/dashboard'
import { useImportSources } from '@/lib/import/useImportSources'
import { ga4CallbackMessage, type ImportMessage } from '@/lib/import/messages'
import type { SourceId } from '@/lib/import/source-display'
import { useImportSlot } from '@/components/settings/import/useImportSlot'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { KitPage, KitRow, KitRows, KitSection } from '@/components/settings/kit/Kit'
import { ConnectedServices } from './ConnectedServices'
import { ImportHistory, SECTION_LINE_EMPTY } from './ImportHistory'
import { ExportSection } from './ExportSection'
import { GSC_CALLBACK } from './words'

// ─── Settings → Data (settings overhaul P6; copy deck §8; rulings R23, R24, R31, R32) ─────────────────────────────
//
// Connected services · Import history · Export, each gated on its own (copy deck §8.6 finding 7): the services need
// integrations.manage, the export analytics.export, and the import nothing, so every member reads an import's status.
// The import section exists only where the server lists a source this build can drive (useImportSources).

/**
 * The Google callbacks land here with a code in the address: `?gsc=` (Search Console, via /sites/:id/settings) and
 * `?ga4=` (the Google Analytics import's popup). Each is said once, then scrubbed from the address so a reload does
 * not say it again.
 */
function useCallbackCodes(): ImportMessage | null {
  const [ga4Notice, setGa4Notice] = useState<ImportMessage | null>(null)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const gsc = params.get('gsc')
    const ga4 = params.get('ga4')
    if (gsc === null && ga4 === null) return
    if (gsc !== null) {
      const msg = GSC_CALLBACK[gsc]
      if (msg?.type === 'success') toast.success(msg.text)
      else if (msg) toast.error(msg.text)
      params.delete('gsc')
    }
    if (ga4 !== null) {
      // Said in the Google Analytics row of the popup's own page; the opener learns the outcome by reading again.
      setGa4Notice(ga4CallbackMessage(ga4))
      params.delete('ga4')
    }
    const rest = params.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`)
  }, [])
  return ga4Notice
}

export default function DataPage({ siteId }: { siteId: string }) {
  const canManage = useCan('integrations.manage')
  const canExport = useCan('analytics.export')
  const { data: site, error: siteError, mutate: mutateSite } = useSite(siteId)
  const [retryingSite, setRetryingSite] = useState(false)
  // A member's page has no services, so their status is never asked for.
  const gsc = useGSCStatus(canManage ? siteId : '')
  const bing = useBingStatus(canManage ? siteId : '')
  const bunny = useBunnyStatus(canManage ? siteId : '')

  const sourcesState = useImportSources(siteId)
  const sources = sourcesState.status === 'available' ? sourcesState.sources : []
  // The slot is read through the upload window, which answers for an upload source.
  const discovery = sources.find((s) => s.flow === 'upload')?.id ?? null
  const [localUpload, setLocalUpload] = useState<SourceId | null>(null)
  const slot = useImportSlot(siteId, discovery, { localUpload: localUpload !== null })

  const ga4Notice = useCallbackCodes()

  const loading =
    (canManage && (gsc.isLoading || bing.isLoading || bunny.isLoading)) ||
    sourcesState.status === 'loading' ||
    (sourcesState.status === 'available' && slot.status === 'loading') ||
    (canExport && !site && !siteError)
  if (loading) return <SettingsLoadingState rows={6} />

  const retrySite = () => {
    setRetryingSite(true)
    Promise.resolve(mutateSite()).finally(() => setRetryingSite(false))
  }

  let importSection: React.ReactNode = null
  if (sourcesState.status === 'error') {
    importSection = (
      <ImportProblem
        title="Couldn't load the import tools"
        line="Nothing about your data has changed."
        onRetry={sourcesState.retry}
      />
    )
  } else if (sourcesState.status === 'available' && slot.status === 'error') {
    importSection = (
      <ImportProblem
        title="Couldn't load this site's import"
        line="The import itself is unaffected."
        onRetry={slot.retry}
      />
    )
  } else if (sourcesState.status === 'available' && slot.status === 'ready') {
    importSection = (
      <ImportHistory
        siteId={siteId}
        site={site}
        canManage={canManage}
        sources={sources}
        slot={slot}
        localUpload={localUpload}
        onLocalUpload={setLocalUpload}
        ga4Notice={ga4Notice}
      />
    )
  }

  return (
    <KitPage>
      {canManage && <ConnectedServices siteId={siteId} gsc={gsc} bing={bing} bunny={bunny} />}
      {importSection}
      {canExport && (
        <ExportSection site={site} siteError={!!siteError} onRetrySite={retrySite} retryingSite={retryingSite} canManage={canManage} />
      )}
    </KitPage>
  )
}

/** The import section when it could not be read: what failed, that nothing changed, and Try again (§8.5). */
function ImportProblem({ title, line, onRetry }: { title: string; line: string; onRetry: () => void }) {
  return (
    <KitSection title="Import history" description={SECTION_LINE_EMPTY} icon={<ClockCounterClockwise />}>
      <KitRows>
        <KitRow
          label={title}
          caption={line}
          control={
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          }
        />
      </KitRows>
    </KitSection>
  )
}
