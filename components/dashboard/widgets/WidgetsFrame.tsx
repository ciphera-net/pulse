'use client'
// The site dashboard as widgets (PUL-88, beta `dashboard-widgets`; rulings W1–W19 in
// Pulse/docs/plans/20-11-2026-dashboard-widgets-plan.md). components/surfaces/DashboardFrame.tsx hands over to this when
// useDashboardWidgets says so, with the same props; the chart deck becomes the Chart widget and Key numbers.
//
// One grid of fixed sizes (registry.tsx). Outside Customize it is the team's layout, read-only. In Customize the
// widgets are draggable under a veil, and the draft is what Done sends (store.ts). Phones draw the same order in one
// column and offer no Customize (W7).
import { useEffect, type ReactNode } from 'react'
import { MotionConfig } from 'framer-motion'
import { SquaresFour } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { DashboardFrameProvider } from '@/lib/dashboard/frame'
import WidgetGrid from './WidgetGrid'
import Gallery from './Gallery'
import { AddSlot, editChrome } from './chrome'
import { CHART_VARIANTS_CSS } from './chartVariants'
import { WIDGET, type FrameCtx } from './registry'
import { useWidgetsState, widgets, type Placed } from './store'

/**
 * A saved layout as this build can draw it: widgets it does not know, sizes they no longer draw, a second copy of a
 * widget that may be there only once, and any id twice are dropped.
 */
export function drawable(list: Placed[]): Placed[] {
  const seen = new Set<string>()
  return list.filter((p) => {
    const def = WIDGET.get(p.id)
    if (!def || !def.sizes.includes(p.size) || seen.has(p.id)) return false
    if (p.id.includes(':') && !def.multi) return false
    seen.add(p.id)
    return true
  })
}

export default function WidgetsFrame({ layout, canCustomize, ...props }: FrameCtx & { deck: ReactNode; layout: Placed[]; canCustomize: boolean }) {
  const s = useWidgetsState()
  const ctx: FrameCtx = props
  // The orange outline after a move by press or keyboard shows for a moment, then goes.
  useEffect(() => {
    if (!s.moved) return
    const t = window.setTimeout(() => widgets.clearMoved(), 1200)
    return () => window.clearTimeout(t)
  }, [s.moved])
  // Leaving the page (or the site) leaves Customize: a draft is never carried to another dashboard.
  useEffect(() => () => widgets.cancelEdit(), [props.siteId])

  const editing = s.editing && canCustomize
  const list = drawable(editing && s.draft ? s.draft : layout)

  const body = !editing && list.length === 0 ? (
    // Everything removed: the dashboard says so, in Pulse's one empty state, and offers the way back.
    <div className="glass-block rounded-none border border-white/[0.08]" data-dashboard-empty="">
      <EmptyState
        icon={<SquaresFour />}
        title="This dashboard is empty"
        description={canCustomize ? 'Add the widgets your team wants to see here. Reset in Customize brings back the standard dashboard.' : 'Someone who can edit this site can add widgets to it.'}
        action={canCustomize ? { label: 'Add a widget', onClick: () => { widgets.startEdit(layout); widgets.openGallery(true) } } : undefined}
        className="py-16"
      />
    </div>
  ) : (
    <WidgetGrid
      ctx={ctx}
      list={list}
      sortable={editing}
      wholeHandle
      chrome={editing ? editChrome : undefined}
      after={editing ? <AddSlot /> : null}
      moved={s.moved}
    />
  )

  return (
    <DashboardFrameProvider>
      <MotionConfig reducedMotion="user">
        <style data-chart-variants="">{CHART_VARIANTS_CSS}</style>
        <div className="flex flex-col gap-3" data-dashboard-frame="" data-dashboard-widgets={editing ? 'editing' : ''}>
          {s.error && editing && <p role="alert" className="text-sm text-red-400" data-widgets-error="">{s.error}</p>}
          {body}
        </div>
        {editing && <Gallery ctx={ctx} />}
      </MotionConfig>
    </DashboardFrameProvider>
  )
}
