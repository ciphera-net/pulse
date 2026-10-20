/**
 * Where the public pages (/demo and /share/<id>, PUL-34) send a visitor out of the page.
 *
 * Both open in the TOP window (`target="_top"`): the marketing home page frames /demo, and a
 * link that opened inside that frame would load a whole page inside the device.
 */

/** The marketing home page: the logo's destination on every public page. */
export const PULSE_HOME_URL = 'https://pulse.ciphera.net'

/** Sign-up: the demo's one action. Same origin as the demo, so a path. */
export const SIGNUP_HREF = '/signup'
