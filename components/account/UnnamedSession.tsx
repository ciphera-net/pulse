/**
 * What the account menu says when this browser cannot name you.
 *
 * 🔴 IT IS PULSE'S SENTENCE, NOT FACET'S. `UserMenu` renders nothing at all in
 * this state unless a consumer supplies words, and that is deliberate: only
 * this app knows WHY it cannot name somebody (the address lives in a vault this
 * browser holds no key for) and what they can do about it (unlock in Settings,
 * which is the item directly below this one in the menu).
 *
 * 🔑 IT KEEPS THE NAMED STATE'S SHAPE — a muted label over one foreground line,
 * exactly like "Signed in as" over an address — so the menu does not change
 * height or rhythm between a browser that can name you and one that cannot.
 *
 * ⚠️ NO CALL TO ACTION, ON PURPOSE. "Unlock in Settings" would be a fourth
 * instruction in a menu that already lists Settings two rows down, and an
 * instruction is the part of a sentence that goes stale when a route moves. The
 * fact is durable; the route is not.
 */
export function UnnamedSession() {
  return (
    <>
      Signed in
      <br />
      <span className="font-medium text-foreground truncate block">
        Encrypted on this device
      </span>
    </>
  )
}

export default UnnamedSession
