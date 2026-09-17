'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button, Input, Modal, toast } from '@ciphera-net/facet'
import { Fingerprint } from '@phosphor-icons/react'
import { listPasskeys, deletePasskey, renamePasskey, type PasskeyCredential } from '@/lib/api/webauthn'
import { SettingsPanel, PanelRow, PanelRows, EmptyRow } from '@/components/settings/panels'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { formatDateTimeFull } from '@/lib/utils/formatDate'
import { DURATION_BASE, DURATION_FAST, EASE_APPLE } from '@/lib/motion'

interface Props {
  /**
   * Runs the enrolment ceremony (OPAQUE re-auth, the vault key re-wrapped
   * under the authenticator's PRF output, one atomic write). Resolves on
   * success AND on a cancel; rejects only on a real failure.
   */
  onAdd: () => Promise<void>
}

/**
 * Passkeys — the list, and the one action per passkey.
 *
 * id-backend caps an account at one passkey (ciphera-id#67), so "Add passkey"
 * is offered only while the list is known to be empty; the ceremony behind
 * `onAdd` still refuses a second one before the dialog opens, and the server
 * is the binding check either way.
 */
export default function PasskeysPanel({ onAdd }: Props) {
  const [passkeys, setPasskeys] = useState<PasskeyCredential[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<PasskeyCredential | null>(null)
  const [name, setName] = useState('')
  const [removing, setRemoving] = useState<PasskeyCredential | null>(null)
  const [busy, setBusy] = useState(false)
  const reducedMotion = useReducedMotion()

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const data = await listPasskeys()
      setPasskeys(data.credentials ?? [])
    } catch {
      setPasskeys(null)
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const add = async () => {
    setAdding(true)
    try {
      await onAdd()
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Couldn't add the passkey. Try again.")
    } finally {
      setAdding(false)
      // A cancel changes nothing and a success changes the list; re-reading
      // covers both without guessing which happened.
      await load()
    }
  }

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!renaming) return
    setBusy(true)
    try {
      await renamePasskey(renaming.id, name.trim())
      toast.success('Passkey renamed.')
      setRenaming(null)
      await load()
    } catch {
      toast.error("Couldn't rename the passkey. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!removing) return
    try {
      await deletePasskey(removing.id)
      toast.success('Passkey removed.')
    } catch {
      toast.error("Couldn't remove the passkey. Try again.")
    } finally {
      setRemoving(null)
      await load()
    }
  }

  const canAdd = passkeys !== null && passkeys.length === 0

  return (
    <SettingsPanel
      title="Passkeys"
      description="Sign in with your device's fingerprint, face or PIN instead of a password."
      action={
        canAdd ? (
          <Button variant="outline" size="sm" onClick={add} disabled={adding}>
            {adding ? 'Adding…' : 'Add passkey'}
          </Button>
        ) : undefined
      }
    >
      {failed ? (
        <SettingsErrorState
          variant="banner"
          className="m-5"
          message="Couldn't load your passkeys. Try again."
          onRetry={() => void load()}
        />
      ) : passkeys === null ? (
        <SettingsLoadingState rows={1} />
      ) : (
        <PanelRows>
          {/* One AnimatePresence spans BOTH the row list and the empty state,
              keyed by which is showing ("empty" vs a passkey id) — it used to
              branch on `passkeys.length === 0` a level up, outside this
              AnimatePresence, so a removal swapped straight to <EmptyRow/> in
              the very same commit that dropped the row's key, hard-unmounting
              the exiting motion.div before its own exit (DURATION_FAST) ever
              played. `mode="wait"` (the same device as Cascade.tsx's
              CascadeGroup) holds the outgoing view on screen for its exit
              before the incoming one mounts. 0<->1 is the only transition
              this panel can ever run — see the one-passkey cap in the class
              doc comment above. */}
          <AnimatePresence mode="wait" initial={false}>
            {passkeys.length === 0 ? (
              <motion.div
                key="empty"
                initial={reducedMotion ? false : { opacity: 0 }}
                animate={
                  reducedMotion ? undefined : { opacity: 1, transition: { duration: DURATION_BASE, ease: EASE_APPLE } }
                }
                exit={reducedMotion ? undefined : { opacity: 0, transition: { duration: DURATION_FAST, ease: EASE_APPLE } }}
              >
                <EmptyRow
                  icon={<Fingerprint weight="regular" />}
                  title="No passkey yet"
                  caption="One passkey per account. Adding it asks for your password once."
                />
              </motion.div>
            ) : (
              passkeys.map((pk) => (
                <motion.div
                  key={pk.id}
                  layout={!reducedMotion}
                  initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={
                    reducedMotion
                      ? undefined
                      : { opacity: 1, y: 0, transition: { duration: DURATION_BASE, ease: EASE_APPLE } }
                  }
                  exit={
                    reducedMotion
                      ? undefined
                      : { opacity: 0, y: 4, transition: { duration: DURATION_FAST, ease: EASE_APPLE } }
                  }
                >
                  <PanelRow
                    label={pk.display_name?.trim() || 'Passkey'}
                    caption={
                      `Added ${formatDateTimeFull(new Date(pk.createdAt))}` +
                      (pk.prf_enabled === false ? '. This passkey cannot open your vault; remove it and add a new one.' : '')
                    }
                    control={
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setRenaming(pk); setName(pk.display_name ?? '') }}>
                          Rename
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground transition-colors duration-fast ease-apple hover:text-destructive motion-reduce:transition-none"
                          onClick={() => setRemoving(pk)}
                        >
                          Remove
                        </Button>
                      </div>
                    }
                  />
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </PanelRows>
      )}

      <Modal isOpen={renaming !== null} onClose={() => !busy && setRenaming(null)} title="Rename passkey">
        <form onSubmit={saveName} className="space-y-4">
          <p className="text-sm text-muted-foreground">A name is the only thing that tells one passkey from another.</p>
          <Input aria-label="Passkey name" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} autoFocus />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setRenaming(null)} disabled={busy}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => { if (!o) setRemoving(null) }}
        title="Remove this passkey?"
        description="You'll sign in with your password until you add another one."
        confirmLabel="Remove passkey"
        onConfirm={remove}
      />
    </SettingsPanel>
  )
}
