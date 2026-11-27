'use client'
// The site dashboard's widgets (PUL-88, beta `dashboard-widgets`; plan Pulse/docs/plans/24-11-2026-dashboard-widgets-
// build-plan.md). The SAVED layout is the team's and lives on the server (lib/api/dashboardLayout.ts, read through
// useDashboardWidgets below). This store holds only what this page knows: whether Customize is on, the draft it edits,
// the gallery, and the widget a press last moved (for its brief outline). Done sends the draft when Pulse's Undo bar
// runs out (review I4, owner W21); Cancel drops it.
import { useSyncExternalStore } from 'react'
import { toast } from '@ciphera-net/facet'
import type { DeferredAction } from '@ciphera-net/facet-hold'
import { useCan } from '@/lib/auth/permissions'
import { useFeature } from '@/lib/features'
import { useOptionalSiteScope } from '@/lib/scope/SiteScope'
import { useSiteSWR } from '@/lib/swr/site-read'
import { getDashboardLayout, layoutConflict, resetDashboardLayout, saveDashboardLayout, type LayoutWrite, type PlacedWidget, type TeamLayout, type WidgetSize } from '@/lib/api/dashboardLayout'

export type { WidgetSize }
export type Placed = PlacedWidget

export const DASHBOARD_WIDGETS_FLAG = 'dashboard-widgets'

/** Today's dashboard, in the grid's terms: the chart, the five blocks, the pair under them, the three overviews. */
export const DEFAULT_LAYOUT: Placed[] = [
  { id: 'chart', size: 'xl' },
  { id: 'sources', size: 'l' },
  { id: 'pages', size: 'l' },
  { id: 'locations', size: 'l' },
  { id: 'technology', size: 'l' },
  { id: 'events', size: 'xl' },
  { id: 'conversion', size: 'l' },
  { id: 'week', size: 'l' },
  { id: 'search', size: 's' },
  { id: 'uptime', size: 's' },
  { id: 'performance', size: 'm' },
]

interface State {
  /**
   * The site whose layout Customize is arranging; null outside Customize. The store is the whole app's, so a page
   * reads it for its own site only: a draft never shows on another site's dashboard.
   */
  editing: string | null
  /** Customize's copy: Done sends it, Cancel drops it. */
  draft: Placed[] | null
  galleryOpen: boolean
  /** The widget a press or the keyboard last moved, for the brief orange outline after a move. */
  moved: string | null
  saving: boolean
  /** Why the last Done failed; Customize stays open with the draft while it is set. */
  error: string | null
  /**
   * The revision Customize started from, which Done sends as its base (review I3): "" the standard dashboard, null
   * unknown (the read failed), which saves over whatever is stored.
   */
  base: string | null
  /**
   * The last Done met a layout someone else saved meanwhile (I3): theirs, as the server answered with the 409.
   * Customize stays open on the draft until the reader keeps theirs or this one.
   */
  conflict: TeamLayout | null
  /** The layout the Copy to other sites dialog copies (A3), or null while it is closed. */
  copying: Placed[] | null
  /**
   * A Done whose save waits for its Undo window (I4, Pulse's Undo bar, PUL-28). The page draws it until the save
   * lands, or Undo drops it and nothing is sent. Keyed by site: the store is the whole app's.
   */
  pending: { siteId: string; layout: Placed[] } | null
}

const IDLE: State = { editing: null, draft: null, galleryOpen: false, moved: null, saving: false, error: null, base: null, conflict: null, copying: null, pending: null }
let state: State = IDLE
const listeners = new Set<() => void>()
function set(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}
function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export function useWidgetsState(): State {
  return useSyncExternalStore(subscribe, () => state, () => IDLE)
}

/** Only the waiting save (I4), so the page's own hook re-renders when it changes and not on every drag. */
function usePending(): State['pending'] {
  return useSyncExternalStore(subscribe, () => state.pending, () => null)
}

/** Changes the draft; outside Customize nothing changes (the layout is the team's, and only Done saves it). */
function write(list: Placed[], moved: string | null = null) {
  if (!state.editing || !state.draft) return
  set({ draft: list, moved })
}

export const widgets = {
  /** Customize on the layout on screen; `revision` is the one it started from (null: unknown). */
  startEdit(siteId: string, saved: Placed[], revision: string | null) { set({ ...IDLE, pending: state.pending, editing: siteId, draft: [...saved], base: revision }) },
  cancelEdit() { set({ ...IDLE, pending: state.pending }) },
  openCopy(layout: Placed[] | null) { set({ copying: layout }) },
  /** Back to today's dashboard, in the draft: Done saves it as "no layout". */
  reset() { write(DEFAULT_LAYOUT.map((p) => ({ ...p }))) },
  move(from: number, to: number) {
    const list = [...(state.draft ?? [])]
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return
    const [item] = list.splice(from, 1)
    list.splice(to, 0, item)
    write(list, item.id)
  },
  /** The order a drag ended on. */
  commit(list: Placed[], moved: string | null) { write(list, moved) },
  setSize(id: string, size: WidgetSize) { write((state.draft ?? []).map((p) => (p.id === id ? { ...p, size } : p)), id) },
  setView(id: string, view: string) { write((state.draft ?? []).map((p) => (p.id === id ? { ...p, view } : p))) },
  setFunnel(id: string, funnel: string) {
    write((state.draft ?? []).map((p) => {
      if (p.id !== id) return p
      return funnel ? { ...p, funnel } : { id: p.id, size: p.size, ...(p.view ? { view: p.view } : {}) }
    }), id)
  },
  setEvent(id: string, event: string) { write((state.draft ?? []).map((p) => (p.id === id ? { ...p, event } : p)), id) },
  remove(id: string) { write((state.draft ?? []).filter((p) => p.id !== id)) },
  /** A widget that may be there more than once gets the next free instance id (`funnels:2`). */
  add(id: string, size: WidgetSize, opts: { multi?: boolean; funnel?: string; event?: string } = {}) {
    const list = state.draft ?? []
    let placedId = id
    if (list.some((p) => p.id === id)) {
      if (!opts.multi) return
      let n = 2
      while (list.some((p) => p.id === `${id}:${n}`)) n++
      placedId = `${id}:${n}`
    }
    write([...list, { id: placedId, size, ...(opts.funnel ? { funnel: opts.funnel } : {}), ...(opts.event ? { event: opts.event } : {}) }], placedId)
  },
  openGallery(open: boolean) { set({ galleryOpen: open }) },
  clearMoved() { if (state.moved) set({ moved: null }) },
}

/** The same layout as today's dashboard: saved as "no layout", so a later change to the default reaches the site. */
export function isDefaultLayout(list: Placed[]): boolean {
  return list.length === DEFAULT_LAYOUT.length && list.every((p, i) => {
    const d = DEFAULT_LAYOUT[i]
    return p.id === d.id && p.size === d.size && !p.view && !p.funnel && !p.event
  })
}

/**
 * Whether a page draws the dashboard as widgets (`on`), and whether it knows yet (`ready`).
 *   * A member of a team in the beta: on; ready once the layout read has answered (a failed read draws the standard
 *     layout rather than nothing).
 *   * A member while /me is on its way, or of a team not in the beta: off, and ready at once, so today's frame draws
 *     without waiting (every reader gets the frame whatever /me says, 15-11-2026). A beta team may see today's frame
 *     for a moment on a cold load.
 *   * A share link and the demo: on only when the team has a saved layout (the read answers null until the team is in
 *     the beta); ready once the read has answered.
 */
export function widgetsMode({ isPublic, flag, answered, saved }: { isPublic: boolean; flag: boolean | null; answered: boolean; saved: Placed[] | null }): { on: boolean; ready: boolean } {
  if (isPublic) return { on: answered && saved != null, ready: answered }
  if (flag !== true) return { on: false, ready: true }
  return { on: true, ready: answered }
}

/**
 * The site's widgets, as this reader sees them.
 *   * A member of a team in the beta: the team's layout, or today's dashboard drawn as widgets when there is none.
 *   * A share link and the demo: the team's layout when the team is in the beta and has arranged one; otherwise
 *     `on` is false and the page keeps today's frame.
 *   * Everyone else: `on` is false.
 * `ready` is false while the layout is being read, so a page never draws one layout and then jumps to another.
 */
export function useDashboardWidgets(siteId: string) {
  const scope = useOptionalSiteScope()
  const isPublic = scope?.mode === 'public'
  const flag = useFeature(DASHBOARD_WIDGETS_FLAG)
  const canEdit = useCan('sites.edit')
  const enabled = isPublic || flag === true
  const read = useSiteSWR<TeamLayout>(
    siteId, 'customer',
    (siteKey) => (enabled ? ['dashboardLayout', siteKey] : null),
    (ref) => getDashboardLayout(ref),
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  )
  const saved = read.data?.layout ?? null
  const revision = read.data ? read.data.revision : null
  const { on, ready } = widgetsMode({ isPublic, flag, answered: read.data !== undefined || read.error != null, saved })
  const pending = usePending()
  const layout = (pending?.siteId === siteId ? pending.layout : null) ?? saved ?? DEFAULT_LAYOUT

  /**
   * Writes a layout as the team's: today's dashboard is stored as no layout. 🔴 With `keepalive` the request must start
   * in this tick (the Undo window was cut short by the page being left), so no await comes before the API call.
   */
  const saveForTeam = (list: Placed[], write: LayoutWrite): Promise<TeamLayout> =>
    isDefaultLayout(list) ? resetDashboardLayout(siteId, write) : saveDashboardLayout(siteId, list, write)

  const done = (defer: (action: DeferredAction) => void) =>
    deferDone(siteId, defer, { save: saveForTeam, landed: (next) => read.mutate(next, { revalidate: false }) })
  /** I3, the reader keeps theirs: the draft replaces whatever is stored now, at once. */
  const keepMine = async () => {
    const draft = state.draft
    if (!draft) return
    set({ saving: true, error: null })
    try {
      const next = await saveForTeam(draft, {})
      await read.mutate(next, { revalidate: false })
      set({ ...IDLE, pending: state.pending })
    } catch {
      set({ saving: false, error: SAVE_FAILED })
    }
  }
  /** I3, the reader takes the layout someone else saved: the draft is dropped and theirs is drawn. */
  const seeTheirs = async () => {
    const theirs = state.conflict
    set({ ...IDLE, pending: state.pending })
    await (theirs ? read.mutate(theirs, { revalidate: false }) : read.mutate())
  }
  return { on, ready, layout, revision, canCustomize: !isPublic && flag === true && canEdit === true, done, keepMine, seeTheirs, readError: read.error ?? null }
}

const SAVE_FAILED = 'The layout could not be saved. Check your connection and press Done again.'

/**
 * Done (I4, owner W21: Pulse's Undo bar): the draft becomes the team's layout. Customize closes at once and the page
 * draws the draft (`pending`); the save is sent when the Undo bar runs out (`defer`, from the page's UndoProvider), or
 * at once with keepalive when the page is left. Undo sends nothing. The save names the revision Customize started
 * from, so a layout someone else saved meanwhile is answered with 409 (I3): Customize opens again on the draft with
 * theirs to choose from. Any other failure opens it again with the reason. Nothing arranged is lost either way.
 * Outside the hook so that every path can be tested without React: `io.save` writes, `io.landed` puts the answer in
 * the page's cache before the waiting copy goes, so the page never flashes the old layout.
 */
export function deferDone(
  siteId: string,
  defer: (action: DeferredAction) => void,
  io: { save: (draft: Placed[], write: LayoutWrite) => Promise<TeamLayout>; landed: (next: TeamLayout) => Promise<unknown> },
): void {
  const draft = state.draft
  if (!draft) return set({ ...IDLE, pending: state.pending })
  const base = state.base ?? undefined
  set({ ...IDLE, pending: { siteId, layout: draft } })
  defer({
    message: 'Layout saved for your team',
    commit: ({ keepalive }) => io.save(draft, { base, keepalive }),
    onUndo: () => set({ pending: null }),
    onCommitted: async (next) => {
      await io.landed(next as TeamLayout)
      // A Customize opened while this save waited started from the revision it replaced: it starts from this one.
      set(state.editing === siteId && state.base === (base ?? null) ? { pending: null, base: (next as TeamLayout).revision } : { pending: null })
    },
    onError: (e) => {
      const theirs = layoutConflict(e)
      const why = theirs ? { conflict: theirs } : { error: SAVE_FAILED }
      // The page may be another one by now (the Undo bar outlives a route change), so a failure is also said where the
      // reader is. A conflict waits for the dashboard, where theirs can be seen.
      if (!theirs) toast.error('Your dashboard layout could not be saved. Open the dashboard to try again.')
      // Arranging this site again: keep that draft and say why. Arranging another: leave it alone. Otherwise open
      // Customize again on the draft that failed.
      if (state.editing === siteId) set({ pending: null, ...why })
      else if (state.editing) set({ pending: null })
      else set({ ...IDLE, editing: siteId, draft, base: base ?? null, ...why })
    },
  })
}
