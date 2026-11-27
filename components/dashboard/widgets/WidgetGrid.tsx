'use client'
// The sortable grid of the dashboard's widgets (PUL-88). Sortable only in Customize mode.
//
// How a move works, and why:
//   * The list is reordered LIVE while a widget is dragged (dnd-kit's onDragOver), so the real grid makes room as it
//     will look, whatever the sizes. A strategy that only translates neighbours assumes they are one size; ours are
//     four.
//   * A widget never remounts: its React key is its id, it stays in the same parent, and only the ORDER of the
//     children changes. The blocks' rows enter through a cascade (components/dashboard/Cascade.tsx), so a remount
//     would replay every row and ask every read again (the dashboard chat's measurement, 20-11-2026).
//   * What follows the pointer is a picture of the widget (a copy of its DOM, inert), never a second mounted block.
//   * The place it will land is the widget's own slot, its content hidden and outlined in orange.
//   * A widget the pointer has just pushed aside is not taken again until the pointer leaves it: with two sizes
//     side by side, the pushed widget can land back under the pointer and the two would trade places forever.
//   * Every drag has a press alternative (WCAG 2.2, 2.5.7): Move earlier and Move later. The keyboard picks a
//     widget up with Space or Enter, moves it with the arrows and puts it down with Space; Escape puts it back.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  DndContext, DragOverlay, KeyboardSensor, MeasuringStrategy, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors,
  type Announcements, type CollisionDetection, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, type SortingStrategy } from '@dnd-kit/sortable'
import { motion } from 'framer-motion'
import { WIDGET, SPAN, GRID, baseId, type FrameCtx } from './registry'
import { widgets, type Placed } from './store'
import { SetupAction, SetupState } from './setup'

/** How far the pointer must travel after a move before the next one may happen. */
export const MOVE_TRAVEL_PX = 24

/**
 * Whether dragging over `overId` may move the dragged widget now. Pure, so the loop it stops is pinned by a test
 * (__tests__/widgets.test.ts).
 *   * Over itself, or over the widget the last move pushed aside: no. With two sizes side by side, the pushed widget
 *     can land back under the pointer, and the two would trade places forever.
 *   * A move changes the layout under a STILL pointer, and with widgets of different sizes that can put the pointer
 *     over another widget, whose move puts it back: measured 24-11-2026, the wide chart traded places with Pages and
 *     Sources 27 times without the pointer moving, until React stopped the page (a black screen). So after a move,
 *     nothing moves again until the pointer itself has travelled MOVE_TRAVEL_PX. A keyboard move always travels a
 *     whole widget.
 */
export function mayReorder({ activeId, overId, pushedId, lastMoveAt, delta }: {
  activeId: string
  overId: string
  pushedId: string | null
  /** The drag's delta at the last move, or null before the first. */
  lastMoveAt: { x: number; y: number } | null
  delta: { x: number; y: number }
}): boolean {
  if (overId === activeId || overId === pushedId) return false
  if (lastMoveAt && Math.hypot(delta.x - lastMoveAt.x, delta.y - lastMoveAt.y) < MOVE_TRAVEL_PX) return false
  return true
}

/** The grid makes room by reordering, so no neighbour is translated while a widget is dragged. */
const noShift: SortingStrategy = () => null

const collide: CollisionDetection = (args) => (args.pointerCoordinates ? pointerWithin(args) : closestCenter(args))

export type Chrome = (p: { placed: Placed; index: number; count: number; handle: Handle; dragging: boolean; siteId: string; ctx: FrameCtx }) => ReactNode
/** The drag handle's props: on the whole widget in Customize mode. */
export interface Handle { ref: (el: HTMLElement | null) => void; props: Record<string, unknown> }

interface Props {
  ctx: FrameCtx
  list: Placed[]
  /** Whether widgets can be dragged at all on this page. */
  sortable: boolean
  chrome?: Chrome
  /** Something drawn after the widgets in the same grid (the Add a widget slot). */
  after?: ReactNode
  /** The whole widget is the handle (Customize mode). */
  wholeHandle?: boolean
  moved?: string | null
  label?: string
}

export default function WidgetGrid({ ctx, list, sortable, chrome, after, wholeHandle = false, moved, label = 'Dashboard widgets' }: Props) {
  const [order, setOrder] = useState<Placed[] | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const pushed = useRef<string | null>(null)
  /** Where the pointer was (the drag's delta) at the last move: no new move until it has travelled from there. */
  const movedAt = useRef<{ x: number; y: number } | null>(null)
  const startedAt = useRef<Placed[] | null>(null)
  const shown = order ?? list

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const nameOf = (id: string | number) => WIDGET.get(String(id))?.name ?? String(id)
  const placeOf = (id: string | number, l: Placed[] = order ?? list) => l.findIndex((p) => p.id === String(id)) + 1
  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `Picked up ${nameOf(a.id)}. It is in place ${placeOf(a.id)} of ${shown.length}. Use the arrow keys to move it, Space to put it down, Escape to cancel.`,
    onDragOver: ({ active: a }) => `${nameOf(a.id)} is now in place ${placeOf(a.id)} of ${shown.length}.`,
    onDragEnd: ({ active: a }) => `${nameOf(a.id)} was put down in place ${placeOf(a.id)} of ${shown.length}.`,
    onDragCancel: ({ active: a }) => `Moving cancelled. ${nameOf(a.id)} is back in place ${placeOf(a.id, startedAt.current ?? list)}.`,
  }

  const onStart = ({ active: a }: DragStartEvent) => {
    startedAt.current = list
    pushed.current = null
    movedAt.current = null
    setOrder(list)
    setActive(String(a.id))
  }
  const onOver = ({ active: a, over, delta }: DragOverEvent) => {
    if (!over) return
    const overId = String(over.id)
    if (overId === String(a.id)) { pushed.current = null; return }
    if (!mayReorder({ activeId: String(a.id), overId, pushedId: pushed.current, lastMoveAt: movedAt.current, delta })) return
    movedAt.current = { x: delta.x, y: delta.y }
    setOrder((current) => {
      const l = [...(current ?? list)]
      const from = l.findIndex((p) => p.id === String(a.id))
      const to = l.findIndex((p) => p.id === overId)
      if (from < 0 || to < 0) return current
      const [item] = l.splice(from, 1)
      l.splice(to, 0, item)
      return l
    })
    pushed.current = overId
  }
  const finish = (commit: boolean) => {
    if (commit && order && startedAt.current && order.some((p, i) => p.id !== startedAt.current?.[i]?.id)) {
      widgets.commit(order, active)
    }
    setOrder(null)
    setActive(null)
    pushed.current = null
  }

  const cells = (
    <div className={GRID} role={sortable ? 'list' : undefined} aria-label={sortable ? label : undefined} data-widget-grid="">
      {shown.map((placed, index) => (
        <Cell
          key={placed.id}
          placed={placed}
          index={index}
          count={shown.length}
          ctx={ctx}
          sortable={sortable}
          chrome={chrome}
          wholeHandle={wholeHandle}
          moved={moved === placed.id && !active}
        />
      ))}
      {after}
    </div>
  )

  if (!sortable) return cells
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collide}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onStart}
      onDragOver={onOver}
      onDragEnd={() => finish(true)}
      onDragCancel={() => finish(false)}
      accessibility={{ announcements, screenReaderInstructions: { draggable: 'To pick up a widget, press Space or Enter. Use the arrow keys to move it, Space or Enter to put it down, and Escape to cancel.' } }}
    >
      <SortableContext items={shown.map((p) => p.id)} strategy={noShift}>
        {cells}
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)' }}>
        {active ? <Ghost id={active} /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function Cell({ placed, index, count, ctx, sortable, chrome, wholeHandle, moved }: {
  placed: Placed; index: number; count: number; ctx: FrameCtx; sortable: boolean; chrome?: Chrome; wholeHandle: boolean; moved: boolean
}) {
  const def = WIDGET.get(placed.id)
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useSortable({ id: placed.id, disabled: !sortable })
  if (!def) return null
  const visible = def.shown ? def.shown(ctx) : true
  const handle: Handle = { ref: setActivatorNodeRef, props: { ...attributes, ...listeners, 'aria-roledescription': 'movable widget', 'aria-label': `Move ${def.name}` } }
  return (
    <motion.div
      ref={wholeHandle && sortable ? (el: HTMLDivElement | null) => { setNodeRef(el); setActivatorNodeRef(el) } : setNodeRef}
      layout="position"
      transition={{ layout: { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] } }}
      className={`${SPAN[placed.size]} group/w relative min-w-0 ${visible ? '' : 'hidden'}`}
      role={sortable ? 'listitem' : undefined}
      data-widget={placed.id}
      data-widget-size={placed.size}
      {...(wholeHandle && sortable ? handle.props : {})}
    >
      <div className={`relative h-full ${isDragging ? 'invisible' : ''}`} data-widget-body={placed.id}>
        <SetupState id={baseId(placed.id)} siteId={ctx.siteId} range={{ ...ctx.dateRange, period: ctx.period }}>{(unset) => (unset ? <SetupAction id={baseId(placed.id)} siteId={ctx.siteId} /> : def.render(ctx, placed.size, placed))}</SetupState>
      </div>
      {chrome?.({ placed, index, count, handle, dragging: isDragging, siteId: ctx.siteId, ctx })}
      {isDragging && <div className="pointer-events-none absolute inset-0 border border-brand-orange/70 bg-brand-orange/[0.04]" data-widget-slot="" aria-hidden="true" />}
      {moved && <div className="pointer-events-none absolute inset-0 border border-brand-orange" data-widget-moved="" aria-hidden="true" />}
    </motion.div>
  )
}

/** A picture of the widget being dragged: a copy of its DOM, inert and hidden from assistive tech. */
function Ghost({ id }: { id: string }) {
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const source = document.querySelector(`[data-widget-body="${CSS.escape(id)}"]`)
    if (!source || !box.current) return
    const copy = source.cloneNode(true) as HTMLElement
    copy.classList.remove('invisible')
    copy.removeAttribute('data-widget-body')
    copy.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'))
    copy.setAttribute('aria-hidden', 'true')
    copy.setAttribute('inert', '')
    box.current.replaceChildren(copy)
  }, [id])
  return <div ref={box} className="h-full w-full cursor-grabbing shadow-2xl shadow-black/60 ring-1 ring-brand-orange/70" data-widget-ghost={id} />
}
