/**
 * The made-up team as the network would answer it (TEST-ONLY, like everything in this folder): the bodies of the
 * team-names routes, the members, the activity log, the connected assistants and the person's vault, with every byte
 * built by the production crypto (lib/crypto/team-names.ts, the Tessera vault). The browser check of the built pages
 * answers those GETs with these bodies and plants the vault key in IndexedDB, so the build runs unchanged from the
 * vault open to the names on screen; fixture-network.test.ts proves the bodies open as intended through the real
 * session.
 */

import { vaultOpsFor, type VaultKey } from '@ciphera-net/tessera'
import { createIdentity, sealName, shareableName, type TeamIdentity } from '@/lib/crypto/team-names'
import { encryptVaultH } from '@/lib/crypto/vault-ops'
import {
  MADE_UP_PEOPLE,
  MY_EMAIL,
  MY_LONG_NAME,
  MY_NAME,
  FORMER_NAME,
  TOMAS,
  madeUpAudit,
  madeUpConnections,
  madeUpMembers,
  type MadeUpState,
} from './madeUpTeam'

/** What Account shows on its own: the name set, none, one too long, a key this browser cannot open, no key yet. */
export type MadeUpAccount = 'set' | 'noname' | 'long' | 'broken' | 'first'

export interface MadeUpNetworkInput {
  teamId: string
  myId: string
  /** How the team looks (`locked`: the check plants no vault key, so these bodies are never asked for). */
  state: MadeUpState
  /** Account's own state; `set` everywhere but the Account checks. */
  account?: MadeUpAccount
  now: Date
  /** The vault key the check plants in IndexedDB, as raw bytes (32). */
  vmk: Uint8Array
}

export interface MadeUpNetwork {
  members: { members: ReturnType<typeof madeUpMembers>; avatar_seeds: Record<string, string> }
  audit: { entries: ReturnType<typeof madeUpAudit>; total: number; avatar_seeds: Record<string, string> }
  connections: { connections: ReturnType<typeof madeUpConnections>; avatar_seeds: Record<string, string> }
  /** GET /me/team-key: the row, or null for a 404 (no key yet: since R72 the browser publishes one on its own). */
  teamKey: { key_id: string; public_key: string; sealed_private_key: string } | null
  directory: {
    keys: { user_id: string; public_key: string }[]
    for_me: { sender_id: string; sender_key_id: string; recipient_key_id: string; sealed: string }[]
    mine: { recipient_id: string; recipient_key_id: string; name_tag: string; sealed_hash: string }[]
  }
  vault: { encrypted_vault: string }
}

const b64 = (bytes: Uint8Array): string => {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

const importVmk = (raw: Uint8Array): Promise<VaultKey> =>
  crypto.subtle.importKey('raw', new Uint8Array(raw), 'HKDF', false, ['deriveKey']) as Promise<VaultKey>

const sha256 = async (bytes: Uint8Array): Promise<Uint8Array> => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))

/** A key pair for someone whose vault the check never sees: a vault key of their own, thrown away. */
async function stranger(): Promise<{ identity: TeamIdentity; envelope: Uint8Array }> {
  return createIdentity(vaultOpsFor(await importVmk(crypto.getRandomValues(new Uint8Array(32)))))
}

export async function buildMadeUpNetwork(input: MadeUpNetworkInput): Promise<MadeUpNetwork> {
  const { teamId, myId, state, now } = input
  const account = input.account ?? 'set'
  const vmk = await importVmk(input.vmk)
  const me = await createIdentity(vaultOpsFor(vmk))

  // My own name, as my vault holds it.
  const myName = account === 'noname' ? null : account === 'long' ? MY_LONG_NAME : MY_NAME
  const vault = { encrypted_vault: await encryptVaultH({ kind: 'opaque', vault: vaultOpsFor(vmk) }, { email: MY_EMAIL, ...(myName ? { display_name: myName } : {}) }) }

  // A key this browser cannot open: sealed under another vault key.
  const broken = account === 'broken' ? await stranger() : null
  const teamKey =
    account === 'first' || state === 'first'
      ? null
      : broken
        ? { key_id: b64(broken.identity.keyId), public_key: b64(broken.identity.publicKey), sealed_private_key: b64(broken.envelope) }
        : { key_id: b64(me.identity.keyId), public_key: b64(me.identity.publicKey), sealed_private_key: b64(me.envelope) }
  // No key yet: the server serves none for me, so nobody sealed anything for me and I sealed nothing. The browser
  // publishes a key at the first visit with the vault open (R72); the check answers that POST itself.
  const keyless = teamKey === null

  // Every teammate has a key, and so does the former member whose row is kept (R54).
  const people = await Promise.all(MADE_UP_PEOPLE.map(async (p) => ({ ...p, ...(await stranger()) })))
  const tomas = await stranger()
  const keys = [
    ...(keyless ? [] : [{ user_id: myId, public_key: b64((broken ?? me).identity.publicKey) }]),
    ...people.map((p) => ({ user_id: p.id, public_key: b64(p.identity.publicKey) })),
    { user_id: TOMAS, public_key: b64(tomas.identity.publicKey) },
  ]

  // What each of them sealed for me, per state ("partial": Amara's has not arrived).
  const forMe: MadeUpNetwork['directory']['for_me'] = []
  const sealFor = async (senderId: string, sender: TeamIdentity, name: string) => {
    const { sealed } = await sealName({ teamId, senderId, recipientId: myId, name, sender, recipientPublicKey: me.identity.publicKey, recipientKeyId: me.identity.keyId })
    forMe.push({ sender_id: senderId, sender_key_id: b64(sender.keyId), recipient_key_id: b64(me.identity.keyId), sealed: b64(sealed) })
  }
  for (const p of people) {
    const name = p.names[state]
    if (name && !keyless) await sealFor(p.id, p.identity, name)
  }
  if (!keyless && (state === 'partial' || state === 'named' || state === 'copies')) await sealFor(TOMAS, tomas.identity, FORMER_NAME)

  // What I sealed for each current teammate, current for my name: nothing is left for the reconcile to write. A name
  // that is not shared has no rows at all, or the reconcile would take them back (a write).
  const mine: MadeUpNetwork['directory']['mine'] = []
  const share = shareableName(myName)
  if (share.kind === 'name' && !broken && !keyless) {
    for (const p of people) {
      const sealed = await sealName({ teamId, senderId: myId, recipientId: p.id, name: share.name, sender: me.identity, recipientPublicKey: p.identity.publicKey, recipientKeyId: p.identity.keyId })
      mine.push({ recipient_id: p.id, recipient_key_id: b64(p.identity.keyId), name_tag: b64(sealed.nameTag), sealed_hash: b64(await sha256(sealed.sealed)) })
    }
  }

  return {
    members: { members: madeUpMembers(teamId, myId), avatar_seeds: {} },
    audit: { entries: madeUpAudit(teamId, myId, now), total: 10, avatar_seeds: {} },
    connections: { connections: madeUpConnections(myId, now), avatar_seeds: {} },
    teamKey,
    directory: { keys, for_me: forMe, mine },
    vault,
  }
}
