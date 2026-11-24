'use client'
// The controls Customize puts on a widget (ruling W1): the whole widget is a handle under a veil, its name and a
// remove button on top, its sizes and the two move buttons in the middle (the press alternative to a drag, WCAG 2.2
// SC 2.5.7). The widget's own controls cannot be pressed while it is being arranged.
import { ArrowLeft, ArrowRight, DotsSixVertical, Plus, X } from '@phosphor-icons/react'
import { Select, Switcher } from '@ciphera-net/facet'
import { useFunnels } from '@/lib/swr/dashboard'
import { FRAME_SURFACE } from '@/lib/dashboard/frame'
import { WIDGET, SPAN, sizeName } from './registry'
import { widgets, type Placed, type WidgetSize } from './store'
import { VIEWS } from './compact'
import { KEY_NUMBERS } from './keyNumbers'
import type { Chrome } from './WidgetGrid'

/** Stops a press on a control from starting a drag of the widget under it. */
const own = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
}

const iconButton = 'inline-flex h-7 w-7 items-center justify-center text-neutral-400 transition-colors duration-fast ease-apple hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange disabled:pointer-events-none disabled:text-neutral-700'

export const editChrome: Chrome = ({ placed, index, count, dragging, siteId }) => {
  const def = WIDGET.get(placed.id)
  if (!def || dragging) return null
  // The widget's own header stays readable under the veil; the mode's controls sit in the middle, over its rows.
  return (
    <div className="absolute inset-0 z-20 cursor-grab touch-none select-none bg-neutral-950/70 ring-1 ring-inset ring-white/[0.14] transition-colors duration-fast ease-apple hover:ring-brand-orange/80" data-edit-veil="">
      <button
        type="button"
        className="absolute -right-2 -top-2 z-10 inline-flex h-6 w-6 items-center justify-center border border-white/[0.18] bg-neutral-900 text-neutral-300 transition-colors duration-fast ease-apple hover:border-brand-orange hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
        aria-label={`Remove ${def.name}`}
        onClick={() => widgets.remove(placed.id)}
        {...own}
        data-edit-remove=""
      >
        <X className="h-3.5 w-3.5" weight="bold" />
      </button>
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
        <span className="flex max-w-full items-center gap-2 text-sm font-medium text-white">
          <DotsSixVertical className="h-4 w-4 shrink-0 text-neutral-400" weight="bold" aria-hidden="true" />
          <span className="truncate">{def.name}</span>
        </span>
        <div className="flex flex-wrap items-center justify-center gap-2" {...own}>
          <button type="button" className={iconButton} aria-label={`Move ${def.name} earlier`} disabled={index === 0} onClick={() => widgets.move(index, index - 1)}>
            <ArrowLeft className="h-4 w-4" weight="bold" />
          </button>
          {def.sizes.length > 1 && (
            <Switcher
              size="sm"
              aria-label={`Size of ${def.name}`}
              options={def.sizes.map((s) => ({ value: s, label: sizeName(def, s) }))}
              value={placed.size}
              onChange={(v) => widgets.setSize(placed.id, v as WidgetSize)}
            />
          )}
          <button type="button" className={iconButton} aria-label={`Move ${def.name} later`} disabled={index === count - 1} onClick={() => widgets.move(index, index + 1)}>
            <ArrowRight className="h-4 w-4" weight="bold" />
          </button>
        </div>
        {placed.id.split(':')[0] === 'funnels' && <div {...own}><FunnelChoice siteId={siteId} id={placed.id} value={placed.funnel} /></div>}
        <ViewChoice placed={placed} />
      </div>
    </div>
  )
}

/** The last cell of the grid in Customize mode: it opens the gallery (ruling W3). */
export function AddSlot({ label = 'Add a widget' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => widgets.openGallery(true)}
      className={`${FRAME_SURFACE} ${SPAN.s} group flex flex-col items-center justify-center gap-2 text-sm text-neutral-400 transition-colors duration-fast ease-apple hover:border-brand-orange/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange`}
      data-add-slot=""
    >
      <span className="inline-flex h-9 w-9 items-center justify-center border border-white/[0.12] transition-colors duration-fast ease-apple group-hover:border-brand-orange group-hover:text-brand-orange">
        <Plus className="h-4 w-4" weight="bold" aria-hidden="true" />
      </span>
      {label}
    </button>
  )
}

/** The Funnels widget's one setting, in Customize mode: which funnel it shows. "Most entered" follows the data. */
function FunnelChoice({ siteId, id, value }: { siteId: string; id: string; value?: string }) {
  const { data: funnels } = useFunnels(siteId)
  if (!funnels || funnels.length < 2) return null
  const MOST = '__most'
  return (
    <Select
      size="sm"
      aria-label="Funnel"
      value={value && funnels.some((f) => f.id === value) ? value : MOST}
      onChange={(v) => widgets.setFunnel(id, v === MOST ? '' : v)}
      options={[{ value: MOST, label: 'The one most visitors enter' }, ...funnels.map((f) => ({ value: f.id, label: f.name }))]}
      className="w-[220px]"
    />
  )
}

/**
 * The view a compact block or Small Key numbers opens on, for the whole team: in Customize the widget is under the
 * veil, so its own picker cannot be pressed. Outside Customize anyone can switch the view for themselves; it is not
 * saved.
 */
function ViewChoice({ placed }: { placed: Placed }) {
  const id = placed.id.split(':')[0]
  const views = id === 'numbers'
    ? (placed.size === 's' ? KEY_NUMBERS : null)
    : (VIEWS[id] && !(placed.size === 'l' || (id === 'events' && placed.size === 'xl')) ? VIEWS[id] : null)
  if (!views || views.length < 2) return null
  return (
    <div {...own}>
      <Select
        size="sm"
        aria-label="Opens on"
        value={views.some((v) => v.value === placed.view) ? placed.view! : views[0].value}
        onChange={(v) => widgets.setView(placed.id, v)}
        options={views.map((v) => ({ value: v.value, label: v.label }))}
        className="w-[180px]"
      />
    </div>
  )
}
