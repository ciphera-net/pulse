/**
 * A stand-in for `@ciphera-net/facet-hold` in component tests (PUL-28).
 *
 *   vi.mock('@ciphera-net/facet-hold', async () =>
 *     (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())
 *
 * - `HoldDialog` renders only when open: a `role="dialog"` named by its
 *   title, the description, children, an error alert, Cancel, and ONE button
 *   labelled with `holdLabel` that confirms on click (the package's own suite
 *   proves the hold; a consumer test only needs the confirm).
 *   `onConfirm`'s promise is awaited: the dialog stays open while it runs and
 *   if it rejects, and closes when it resolves, exactly like the real one.
 * - `useUndo().defer` records each action in `deferred`, so a test decides
 *   what happens next: `commitLast()`, `commitLast({ keepalive: true })`,
 *   `undoLast()`, or `failLast(err)` after a commit that throws.
 *
 * Call `resetDeferred()` in `beforeEach`.
 */
import { useState, type ReactNode } from 'react'
import type { DeferredAction } from '@ciphera-net/facet-hold'

export const deferred: DeferredAction[] = []
const settled = new WeakSet<DeferredAction>()

/**
 * Undoes every action a test left waiting, then forgets them all. The items a
 * confirm hid live in a module-level store (lib/hold/pending.ts) that outlives
 * one test's render; without this, a test that confirms and never settles
 * would leave its item hidden in the NEXT test.
 */
export function resetDeferred(): void {
  for (const a of deferred) if (!settled.has(a)) a.onUndo?.()
  deferred.length = 0
}

function last(): DeferredAction {
  const a = deferred.at(-1)
  if (!a) throw new Error('no deferred action: nothing was confirmed')
  if (settled.has(a)) throw new Error('the last deferred action was already committed or undone')
  settled.add(a)
  return a
}

/** Runs the last action's commit as the Undo window running out would. */
export async function commitLast({ keepalive = false }: { keepalive?: boolean } = {}): Promise<void> {
  const a = last()
  let result: unknown
  try {
    result = await a.commit({ keepalive })
  } catch (err) {
    a.onError?.(err)
    return
  }
  await a.onCommitted?.(result)
}

/** Presses Undo on the last action. */
export function undoLast(): void {
  last().onUndo?.()
}

interface StandInDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  children?: ReactNode
  holdLabel: string
  disabled?: boolean
  error?: ReactNode
  onConfirm: () => void | Promise<void>
}

function HoldDialog({ open, onOpenChange, title, description, children, holdLabel, disabled, error, onConfirm }: StandInDialogProps) {
  const [busy, setBusy] = useState(false)
  if (!open) return null
  const confirm = () => {
    const r = onConfirm()
    if (r && typeof (r as Promise<void>).then === 'function') {
      setBusy(true)
      ;(r as Promise<void>).then(() => { setBusy(false); onOpenChange(false) }, () => setBusy(false))
    } else {
      onOpenChange(false)
    }
  }
  return (
    <div role="dialog" aria-label={title}>
      <h3>{title}</h3>
      {description && <div>{description}</div>}
      {children}
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</button>
      <button type="button" data-hold-confirm="" onClick={confirm} disabled={disabled || busy}>{busy ? 'Checking…' : holdLabel}</button>
    </div>
  )
}

export function facetHoldStandIn() {
  return {
    HoldDialog,
    HoldToConfirm: ({ children, onConfirm, disabled }: { children: ReactNode; onConfirm: () => void; disabled?: boolean }) => (
      <button type="button" data-hold-confirm="" onClick={onConfirm} disabled={disabled}>{children}</button>
    ),
    UndoProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
    useUndo: () => ({ defer: (a: DeferredAction) => { deferred.push(a) }, flush: () => {} }),
  }
}
