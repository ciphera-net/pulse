'use client'
// The toolbar's part in the dashboard widgets (PUL-88). Outside Customize: the toolbar as it is, and the sliders icon
// at its right end (ruling W8), for whoever may edit the site, from 1,024 px (phones do not edit, W7). In Customize:
// the mode's own row in the same toolbar, in the order Copy to other sites (when the team has another site; review
// A3, owner W21), Reset, Add a widget, Cancel, Done (W9).
import type { ReactNode } from 'react'
import { ArrowCounterClockwise, Copy, Plus, SlidersHorizontal } from '@phosphor-icons/react'
import { Button, Tooltip } from '@ciphera-net/facet'
import { useUndo, type DeferredAction } from '@ciphera-net/facet-hold'
import { TOOLTIP_PANEL_CLASS } from '@/lib/ui/popupSurface'
import { useSites } from '@/lib/swr/sites'
import { useWidgetsState, widgets, type Placed } from './store'

export default function CustomizeControls({ children, siteId, layout, revision, canCustomize, done }: {
  children: ReactNode
  siteId: string
  layout: Placed[]
  /** The layout's revision, which Customize starts from (null: unknown). */
  revision: string | null
  canCustomize: boolean
  /** Done, given Pulse's Undo bar to wait on (useDashboardWidgets). */
  done: (defer: (action: DeferredAction) => void) => void
}) {
  const s = useWidgetsState()
  if (s.editing === siteId && canCustomize) {
    return (
      <>
        <div className="flex min-w-0 flex-col justify-center" data-edit-bar="">
          <span className="text-sm font-medium text-white">Customize the dashboard</span>
          <span className="hidden text-xs text-neutral-400 sm:block">Your team sees this layout. Drag a widget or use its arrows to move it.</span>
        </div>
        <div className="hidden flex-1 sm:block" />
        <CopyButton siteId={siteId} />
        <Button variant="ghost" size="toolbar" onClick={() => widgets.reset()} disabled={s.saving} data-edit-reset="">
          <ArrowCounterClockwise className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Reset
        </Button>
        <Button variant="chrome" size="toolbar" onClick={() => widgets.openGallery(true)} disabled={s.saving} data-edit-add="">
          <Plus className="mr-1.5 h-4 w-4" weight="bold" aria-hidden="true" />
          Add a widget
        </Button>
        <Button variant="chrome" size="toolbar" onClick={() => widgets.cancelEdit()} disabled={s.saving} data-edit-cancel="">Cancel</Button>
        <DoneButton done={done} />
      </>
    )
  }
  return (
    <>
      {children}
      {canCustomize && (
        <span className="hidden lg:contents">
          <Tooltip content="Customize dashboard" className={TOOLTIP_PANEL_CLASS}>
            <Button variant="chrome" size="toolbar-icon" aria-label="Customize dashboard" onClick={() => widgets.startEdit(siteId, layout, revision)} data-customize="">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </Tooltip>
        </span>
      )}
    </>
  )
}

/** Done waits on the app's one Undo bar (app/layout.tsx), so it reads it here, only while Customize is open. */
function DoneButton({ done }: { done: (defer: (action: DeferredAction) => void) => void }) {
  const s = useWidgetsState()
  const { defer } = useUndo()
  return <Button size="toolbar" onClick={() => done(defer)} disabled={s.saving} data-edit-done="">{s.saving ? 'Saving' : 'Done'}</Button>
}

/** Copy to other sites (A3): the team's sites are read only while Customize is open, and a team of one has no button. */
function CopyButton({ siteId }: { siteId: string }) {
  const s = useWidgetsState()
  const { sites } = useSites()
  if (!sites.some((site) => site.id !== siteId)) return null
  return (
    <Button variant="ghost" size="toolbar" onClick={() => widgets.openCopy(s.draft)} disabled={s.saving} data-edit-copy="">
      <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
      Copy to other sites
    </Button>
  )
}
