import { ApiError } from '@/lib/api/client'

// Every failure on Sharing in the copy deck's words (§6.2 to §6.6). The server's own sentences never reach the page
// (copy deck §6.7 finding 3: "Failed to create the report", "…or fewer sections" where the form says slides): each
// failure is read from its status, its code, or, for the two refusals the deck names, the server's sentence, and is
// said in the page's words. Anything unrecognised gets the page's plain "Couldn't … Try again." words.

/** The longest report password the server takes (pulse-backend `MaxSharePasswordLen`, bytes). */
export const MAX_PASSWORD_BYTES = 512
/** The most people a schedule can go to (pulse-backend `reportScheduleMaxRecipients`). */
export const MAX_RECIPIENTS = 50

export const PASSWORD_TOO_LONG = 'Use 512 characters or fewer.'
export const TOO_MANY_PEOPLE = 'Pick 50 people or fewer.'

function serverSaid(err: ApiError): string | null {
  const said = err.data?.error
  return typeof said === 'string' ? said : null
}

/** The thing asked about is gone: deleted, stopped or never there. */
export function isGone(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404
}

export function makeReportError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 503) {
      return err.data?.code === 'report_too_large'
        ? 'This report took too long to make. Pick a shorter period or fewer slides.'
        : "Reports can't be made right now. Try again later."
    }
    if (err.status === 400 && serverSaid(err) === 'password too long') return PASSWORD_TOO_LONG
  }
  return "Couldn't make the report. Try again."
}

export function scheduleError(err: unknown): string {
  if (err instanceof ApiError && err.status === 400) {
    const said = serverSaid(err)
    if (said === "Every recipient must be a member of this site's team.") {
      return 'Someone you picked has left the team. Reload the page and pick again.'
    }
    if (said?.startsWith('a schedule goes to at most')) return TOO_MANY_PEOPLE
  }
  return "Couldn't schedule the emails. Try again."
}

export function pdfError(err: unknown): string {
  return isGone(err) ? 'This report no longer exists.' : "Couldn't make the PDF. Try again."
}

export function deleteError(err: unknown, name: string): string {
  return isGone(err) ? 'This report no longer exists.' : `Couldn't delete "${name}". Try again.`
}

export function stopError(err: unknown, name: string): string {
  return isGone(err) ? 'These emails are already stopped.' : `Couldn't stop "${name}" emails. Try again.`
}
