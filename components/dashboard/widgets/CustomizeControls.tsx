'use client'
// The toolbar's part in the dashboard widgets (PUL-88). Outside Customize: the toolbar as it is, and the sliders icon
// at its right end (ruling W8), for whoever may edit the site, from 1,024 px (phones do not edit, W7). In Customize:
// the mode's own row in the same toolbar, in the order Reset, Add a widget, Cancel, Done (W9).
import type { ReactNode } from 'react'
import { ArrowCounterClockwise, Plus, SlidersHorizontal } from '@phosphor-icons/react'
import { Button, Tooltip } from '@ciphera-net/facet'
import { TOOLTIP_PANEL_CLASS } from '@/lib/ui/popupSurface'
import { useWidgetsState, widgets, type Placed } from './store'

export default function CustomizeControls({ children, layout, canCustomize, done }: {
  children: ReactNode
  layout: Placed[]
  canCustomize: boolean
  done: () => Promise<void>
}) {
  const s = useWidgetsState()
  if (s.editing && canCustomize) {
    return (
      <>
        <div className="flex min-w-0 flex-col justify-center" data-edit-bar="">
          <span className="text-sm font-medium text-white">Customize the dashboard</span>
          <span className="hidden text-xs text-neutral-400 sm:block">Your team sees this layout. Drag a widget or use its arrows to move it.</span>
        </div>
        <div className="hidden flex-1 sm:block" />
        <Button variant="ghost" size="toolbar" onClick={() => widgets.reset()} disabled={s.saving} data-edit-reset="">
          <ArrowCounterClockwise className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Reset
        </Button>
        <Button variant="chrome" size="toolbar" onClick={() => widgets.openGallery(true)} disabled={s.saving} data-edit-add="">
          <Plus className="mr-1.5 h-4 w-4" weight="bold" aria-hidden="true" />
          Add a widget
        </Button>
        <Button variant="chrome" size="toolbar" onClick={() => widgets.cancelEdit()} disabled={s.saving} data-edit-cancel="">Cancel</Button>
        <Button size="toolbar" onClick={() => { void done() }} disabled={s.saving} data-edit-done="">{s.saving ? 'Saving' : 'Done'}</Button>
      </>
    )
  }
  return (
    <>
      {children}
      {canCustomize && (
        <span className="hidden lg:contents">
          <Tooltip content="Customize dashboard" className={TOOLTIP_PANEL_CLASS}>
            <Button variant="chrome" size="toolbar-icon" aria-label="Customize dashboard" onClick={() => widgets.startEdit(layout)} data-customize="">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </Tooltip>
        </span>
      )}
    </>
  )
}
