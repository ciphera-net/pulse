// ─── Visitor pseudonyms (owner decisions D9 + D10) ──────────────────
//
// A row's name is derived CLIENT-SIDE from the visitor key. The wire carries the
// key; it never carries a name. That is not an optimisation — a server-assigned
// name would be a second identifier travelling with the row, and this feature's
// whole claim is that the row carries one month-expiring pseudonymous key and
// nothing else.
//
// D9: adjective + persona, not Rybbit's colour + animal.
// D10: ONE mixed pool drawing on both vocabularies the owner reviewed — "ways of
// reading" and "quiet occupations". Keep the tone calm and warm; these name
// real people's sessions, and a mocking or cute vocabulary would read as
// contempt on a screen a site owner shows to colleagues.
//
// Collisions are accepted (Rybbit's animals collide too). The hash is the true
// key and is always visible on the detail page, so two "Quiet Readers" are
// distinguishable wherever it matters.

const ADJ = [
  'Quiet', 'Curious', 'Patient', 'Midnight', 'Loyal', 'Brisk',
  'Distant', 'Careful', 'Early', 'Fleeting', 'Steady', 'Gentle',
  'Sunday', 'Restless', 'Thoughtful', 'Wandering', 'Sudden', 'Faithful',
  'Idle', 'Attentive', 'Familiar', 'Passing', 'Deliberate', 'Unhurried',
  'Returning', 'Watchful', 'Solitary', 'Frequent', 'Autumn', 'Northern',
  'Wintry', 'Kindly',
] as const

const PERSONA = [
  'Reader', 'Explorer', 'Scholar', 'Wanderer', 'Regular', 'Skimmer',
  'Passerby', 'Student', 'Riser', 'Guest', 'Gardener', 'Baker',
  'Cartographer', 'Archivist', 'Clockmaker', 'Librarian', 'Typesetter',
  'Beekeeper', 'Lamplighter', 'Bookbinder', 'Stonemason', 'Weaver',
  'Locksmith', 'Botanist', 'Ferryman', 'Watchmaker', 'Printer', 'Potter',
  'Surveyor', 'Glazier', 'Cooper', 'Navigator',
] as const

/**
 * visitorPseudonym derives the display name from a visitor key.
 *
 * The two 4-hex-digit slices are disjoint so the adjective and the persona vary
 * independently; taking both from the same slice would correlate them and
 * shrink the effective pool.
 *
 * A key that is not the expected 32-hex shape still gets a stable name rather
 * than a crash — parseInt on a non-hex slice yields NaN, so it is guarded. A row
 * the server sent is a row the page shows.
 */
export function visitorPseudonym(visitorKey: string): string {
  const slice = (from: number) => {
    const n = parseInt(visitorKey.slice(from, from + 4), 16)
    return Number.isFinite(n) ? n : 0
  }
  return `${ADJ[slice(0) % ADJ.length]} ${PERSONA[slice(4) % PERSONA.length]}`
}

/** The pool sizes, exported so a test can state what the collision odds are. */
export const PSEUDONYM_POOL = { adjectives: ADJ.length, personas: PERSONA.length }
