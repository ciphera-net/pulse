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
import { useDashboardWidgets, useWidgetsState, widgets, type Placed } from './store'
import CopyLayout from './CopyLayout'
import { Button } from '@ciphera-net/facet'

/**
 * A saved layout as this build can draw it. Widgets it does not know, a second copy of a widget that may be there only
 * once, and any id twice are dropped. A size the widget no longer draws becomes its default size, so retiring a size
 * never takes a widget off a team's dashboard (review §3, F2).
 */
export function drawable(list: Placed[]): Placed[] {
  const seen = new Set<string>()
  const out: Placed[] = []
  for (const p of list) {
    const def = WIDGET.get(p.id)
    if (!def || seen.has(p.id) || (p.id.includes(':') && !def.multi)) continue
    seen.add(p.id)
    out.push(def.sizes.includes(p.size) ? p : { ...p, size: def.size })
  }
  return out
}

export default function WidgetsFrame({ layout, canCustomize, ...props }: FrameCtx & { deck: ReactNode; layout: Placed[]; canCustomize: boolean }) {
  const s = useWidgetsState()
  const actions = useDashboardWidgets(props.siteId)
  // The orange outline after a move by press or keyboard shows for a moment, then goes.
  useEffect(() => {
    if (!s.moved) return
    const t = window.setTimeout(() => widgets.clearMoved(), 1200)
    return () => window.clearTimeout(t)
  }, [s.moved])
  // Leaving the page (or the site) leaves Customize: a draft is never carried to another dashboard.
  useEffect(() => () => widgets.cancelEdit(), [props.siteId])

  const editing = s.editing === props.siteId && canCustomize
  const list = drawable(editing && s.draft ? s.draft : layout)
  const ctx: FrameCtx = { ...props, layoutIds: list.map((p) => p.id.split(':')[0]) }

  const body = !editing && list.length === 0 ? (
    // Everything removed: the dashboard says so, in Pulse's one empty state, and offers the way back.
    <div className="glass-block rounded-none border border-white/[0.08]" data-dashboard-empty="">
      <EmptyState
        icon={<SquaresFour />}
        title="This dashboard is empty"
        description={canCustomize ? 'Add the widgets your team wants to see here. Reset in Customize brings back the standard dashboard.' : 'Someone who can edit this site can add widgets to it.'}
        action={canCustomize ? { label: 'Add a widget', onClick: () => { widgets.startEdit(props.siteId, layout, actions.revision); widgets.openGallery(true) } } : undefined}
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
          {s.error && editing && <p role="alert" className="text-sm text-destructive" data-widgets-error="">{s.error}</p>}
          {/* Two people arranging at once (review I3, owner W21: a line above the widgets). */}
          {s.conflict && editing && (
            <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" data-widgets-conflict="">
              <span className="text-neutral-200">Someone on your team saved this layout while you were arranging it.</span>
              <span className="flex gap-2">
                <Button variant="chrome" size="sm" onClick={() => { void actions.seeTheirs() }}>See theirs</Button>
                <Button size="sm" onClick={() => { void actions.keepMine() }}>Keep mine</Button>
              </span>
            </div>
          )}
          {body}
        </div>
        {editing && <Gallery ctx={ctx} />}
        <CopyLayout siteId={props.siteId} />
      </MotionConfig>
    </DashboardFrameProvider>
  )
}
