/**
 * Naming the authenticator a user just tried, so a failure can say something
 * they can act on.
 *
 * WebAuthn's AAGUID identifies the authenticator MODEL — "iCloud Keychain",
 * "Bitwarden", "Windows Hello". It is the only signal we get about what the user
 * actually used, and it arrives with the registration response, which means it
 * is available even when the enrolment then fails for want of PRF. That is the
 * whole point: "Bitwarden cannot do this yet" is a sentence somebody can act on,
 * where "this device did not provide the key material" is not.
 *
 * 🔴 THE AAGUID IS SELF-REPORTED AND IS FOR COPY ONLY. It is attested only when
 * attestation is requested and verified, which this ceremony does not do. A
 * hostile client can claim any AAGUID it likes. Nothing may ever be GATED on
 * this value — no capability decision, no skipping the PRF check, no trust. It
 * decides one thing: which sentence to render after a failure that has already
 * been decided by the actual PRF result.
 *
 * ⚠️ Deliberately a SHORT list, not a vendored registry. The canonical source
 * (passkeydeveloper/passkey-authenticator-aaguids) is hundreds of entries and
 * would need syncing; the value here is entirely in the handful of providers
 * whose PRF support is the reason somebody is reading an error message. An
 * unknown AAGUID falls back to generic advice, which is exactly as useful as the
 * message we had before.
 */

/** What we can say about an authenticator, once we know which one it is. */
export interface AuthenticatorProfile {
  /** Human name, as the provider brands it. */
  name: string
  /**
   * Whether this authenticator can produce a PRF secret at enrolment.
   *
   * ⚠️ `false` here is a documented, MEASURED limitation of the provider — not
   * a permission check. The enrolment has already failed by the time this is
   * read; this only decides how to explain it.
   */
  prf: 'yes' | 'no' | 'partial'
  /** Provider-specific detail worth telling the user. Kept short. */
  note?: string
}

/**
 * AAGUIDs, lowercase, hyphenated.
 *
 * Sources: the two `no`/`partial` entries were measured on real hardware during
 * the 03-09-2026 live gate (both failed to return PRF and wrote zero rows); the
 * rest are from the public registry and the vendors' own release notes.
 */
const KNOWN: Record<string, AuthenticatorProfile> = {
  // Measured working, 03-09-2026 — the credential the live gate enrolled with.
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': { name: 'iCloud Keychain', prf: 'yes' },

  // 🔴 Measured FAILING, 03-09-2026. Bitwarden's FIDO2 service hardcodes
  // `extensionData: false`, so there is no PRF implementation to enable. Open
  // feature request, no committed date.
  'd548826e-79b4-db40-a3d8-11116f7e8349': {
    name: 'Bitwarden',
    prf: 'no',
    note: 'Bitwarden cannot do this yet — it has no PRF support for the passkeys it stores.',
  },

  // 🔴 Measured FAILING, 03-09-2026. The browser extension gained PRF in July
  // 2025; the iOS app still pins pass-common 1.6.1 where PRF landed in 1.7.3,
  // and even then only on the registration path.
  '8dc7d4d5-6e4b-4b0f-a9c1-1a4b9e2c3d5f': {
    name: 'Proton Pass',
    prf: 'partial',
    note: 'Proton Pass supports this in the browser extension, but not yet in the iOS app.',
  },

  // Returns prf.results.first as a plain Array rather than an ArrayBuffer —
  // handled since pulse#510. Listed so a future failure is not misattributed.
  'bada5566-a7aa-401f-bd96-45619a55120d': { name: '1Password', prf: 'yes' },

  // Create-time PRF needs Windows 11 25H2 + Chrome 147 or later (Feb 2026).
  '08987058-cadc-4b81-b6e1-30de50dcbe96': {
    name: 'Windows Hello',
    prf: 'yes',
    note: 'Windows Hello needs Windows 11 25H2 or later for this.',
  },
  '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': { name: 'Windows Hello', prf: 'yes' },
  '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': { name: 'Windows Hello', prf: 'yes' },

  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': { name: 'Google Password Manager', prf: 'yes' },
  '531126d6-e717-415c-9320-3d9aa6981239': { name: 'Dashlane', prf: 'yes' },
  'f3809540-7f14-49c1-a8b3-8f813b225541': { name: 'Enpass', prf: 'yes' },
  '0076631b-d4a0-427f-5773-0ec71c9e0279': { name: 'KeePassXC', prf: 'yes' },

  // Security keys. PRF requires a PIN to be set — the spec mandates user
  // verification for it, and a PIN-less key silently cannot do it.
  'ee882879-721c-4913-9775-3dfcce97072a': {
    name: 'YubiKey 5',
    prf: 'yes',
    note: 'A security key needs a PIN set before it can do this.',
  },
  'fa2b99dc-9e39-4257-8f92-4a30d23c4118': {
    name: 'YubiKey 5 NFC',
    prf: 'yes',
    note: 'A security key needs a PIN set before it can do this.',
  },
}

/** The all-zero AAGUID: "this authenticator declines to identify its model". */
const ANONYMOUS = '00000000-0000-0000-0000-000000000000'

/**
 * Extract the AAGUID from a registration response.
 *
 * `authenticatorData` is `getAuthenticatorData()`, which browsers expose on the
 * registration response and @simplewebauthn passes through as base64url. Its
 * layout is fixed: rpIdHash(32) ‖ flags(1) ‖ signCount(4) ‖ aaguid(16) ‖ …, so
 * the AAGUID is bytes 37..52 inclusive. Parsing it this way avoids decoding the
 * CBOR attestation object for one field.
 *
 * Returns null whenever the value is absent, too short, or anonymous — every one
 * of which means "we do not know", and the caller must treat them alike.
 */
export function aaguidFromRegistration(authenticatorDataB64Url?: string): string | null {
  if (!authenticatorDataB64Url) return null
  let bytes: Uint8Array
  try {
    const b64 = authenticatorDataB64Url.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))
    bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
  // 37 + 16: the AAGUID is only present when the attested-credential-data flag
  // is set, which it always is for a registration — but check the length rather
  // than assume, because a short buffer would otherwise read as all-zeroes.
  if (bytes.length < 53) return null
  const hex = Array.from(bytes.slice(37, 53), (b) => b.toString(16).padStart(2, '0')).join('')
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  return uuid === ANONYMOUS ? null : uuid
}

/** Look up what we know about an AAGUID. Null when we do not recognise it. */
export function profileForAaguid(aaguid: string | null): AuthenticatorProfile | null {
  if (!aaguid) return null
  return KNOWN[aaguid.toLowerCase()] ?? null
}

/**
 * The sentence shown when an authenticator completed a ceremony but returned no
 * PRF secret.
 *
 * Every variant says the same three things, because all three are what the user
 * needs: nothing was saved, WHY it failed, and what to do instead. The named
 * variants replace "this device" with the provider's own name, which is the
 * difference between a dead end and an instruction.
 */
export function prfUnsupportedMessage(profile: AuthenticatorProfile | null): string {
  const alternatives =
    'Try Touch ID or Face ID on a Mac or iPhone, Windows Hello on Windows 11 25H2 or later, ' +
    '1Password, or a YubiKey 5 with a PIN set.'

  if (!profile) {
    return (
      'That passkey provider did not give Ciphera the key material it needs to unlock your ' +
      `vault, so nothing was saved. ${alternatives}`
    )
  }
  if (profile.prf === 'no' || profile.prf === 'partial') {
    return `${profile.note ?? `${profile.name} cannot do this yet.`} Nothing was saved. ${alternatives}`
  }
  // Known-capable, still failed: the provider is not the story, the setup is.
  return (
    `${profile.name} supports this, but it did not return the key material this time, so nothing ` +
    `was saved. ${profile.note ? `${profile.note} ` : ''}${alternatives}`
  )
}
