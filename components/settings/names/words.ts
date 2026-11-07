/**
 * Team names, the words (copy deck §14, decided 07-11-2026: R64, C1 W2, C2 W2, C3 W1, C4 W1) and how a person is
 * written where only text fits. Every string a team-names surface shows is here, word for word.
 */

export const NAMES_WORDS = {
  // Pulse's own words where a person goes (§14.1), drawn apart from names (P2 A: the grey ink).
  you: 'You',
  youLower: 'you',
  pulse: 'Pulse',
  teammate: 'Teammate',
  teammateLower: 'teammate',
  formerTeammate: 'Former teammate',
  formerTeammateLower: 'former teammate',
  former: 'former',

  // The three lines a page shows once (§14.6).
  notYet: "A teammate's name shows after their next visit to Pulse, if they've set one.",
  lockedTitle: "Your teammates' names are locked",
  lockedLine: 'Unlock your profile on Account to see them in this browser.',
  lockedButton: 'Unlock on Account',
  lockedSendTo: 'Unlock your profile on Account to see their names.',
  stepTitle: 'Set up team names?',
  stepLine: "See your teammates' names and share yours. Pulse asks for your password once.",
  stepButton: 'Set up',
  stepBusy: 'Setting up…',
  stepSendTo: 'Set up team names on the Team page to see their names.',
  password: 'Your password',
  passwordCaption: "Once for your account. Your other devices won't ask.",
  cancel: 'Cancel',
  stepDone: 'Team names set up',

  // The password step's failures (§14.6, Account's own words where they are Account's, §12.9).
  emptyPassword: 'Enter your password.',
  wrongPassword: "That password didn't match. Try again.",
  notConfirmed: "Couldn't confirm your password. Try again.",
  setUpFailed: "Couldn't set up team names. Try again.",

  // Account (§14.7).
  notice: "Shown in your account menu and to your teammates. Pulse encrypts it for each of them and can't read it.",
  noName: 'Set a name and your teammates see it instead of your id.',
  tooLong: 'Too long to share with your teammates. Shorten it to 100 characters or fewer.',
  brokenLabel: "Team names can't be opened on this device",
  brokenCaption: "Your teammates' names stay hidden here, and yours isn't shared. Reset them with your password.",
  brokenButton: 'Reset',
  resetTitle: 'Reset team names?',
  resetLine: 'Your teammates see your name again at once. You see theirs after their next visit to Pulse.',
  resetGoes: 'The names your teammates shared with you, and every copy of your name in your teams, including teams you left.',
  resetStays: 'Your account and your name.',
  resetHold: 'Hold to reset',
  resetFailed: "Couldn't reset team names. Nothing changed. Try again.",
  resetDone: 'Team names reset',
} as const

/**
 * A person, as this browser can say who they are (design §7, copy deck §14.1):
 *   you          the signed-in person
 *   pulse        nobody acted (the activity log)
 *   name         the name their browser shared; `showId` when it must carry the id everywhere (a former member, a
 *                name another person has, a name equal to one of Pulse's own words)
 *   teammate     a current member whose name has not reached this browser
 *   former-none  a former member whose name never reached this browser
 */
export type PersonWho =
  | { kind: 'you' }
  | { kind: 'pulse' }
  | { kind: 'name'; name: string; former: boolean; showId: boolean }
  | { kind: 'teammate' }
  | { kind: 'former-none' }

/** The start of an id, the part every surface shows. */
export const shortId = (userId: string) => userId.slice(0, 8)

/**
 * A person in plain text, where Facet takes text only (an Undo bar, a toast): a name carries its id in brackets, so
 * the id stays apart from the name without being drawn as code (§14.8).
 */
export function plainName(who: PersonWho, userId: string): string {
  if (who.kind === 'you') return NAMES_WORDS.you
  if (who.kind === 'name') return `${who.name} (${shortId(userId)})`
  return `${NAMES_WORDS.teammate} ${shortId(userId)}`
}

/** The name alone, for a dialog's title and its line: the person row under them carries the id (§14.3). */
export function titleName(who: PersonWho, userId: string): string {
  if (who.kind === 'you') return NAMES_WORDS.you
  if (who.kind === 'name') return who.name
  return `${NAMES_WORDS.teammate} ${shortId(userId)}`
}
