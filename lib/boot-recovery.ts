/**
 * A page that loaded without its files recovers by itself (27-11-2026).
 *
 * The dashboard draws everything with JavaScript, and its stylesheets and scripts come from the
 * static host (static.ciphera.net). A load at a moment that host cannot be reached (a
 * Mac waking, a reconnect, a flaky network) left the page showing only the skip link, and
 * nothing retried: Pulse/docs/audits/16-11-2026-blank-dashboard-and-performance-reports.md §7.
 *
 * bootRecoveryScript() is inline and blocking in <head> (app/layout.tsx), so it runs when every
 * file failed. It notes any of the page's own static files that fails to load before the page
 * settles, and once the page has loaded it also asks whether the styles applied (the body's
 * background comes from them, `bg-background`). If a file failed or the styles are missing, it
 * waits until the browser is online and a fresh request to that file answers, then reloads.
 *
 * Bounded: at most BOOT_RELOAD_LIMIT reloads in BOOT_RELOAD_WINDOW_MS, counted in sessionStorage.
 * Without sessionStorage it never reloads, so it cannot loop. A failure after the page settled (a
 * chunk a later client-side navigation asks for) is left to the app's own error page.
 *
 * The helpers below are embedded with Function.prototype.toString (as themeBootScript does), so
 * each must be self-contained: no imports, no outer variables.
 */

export const BOOT_RELOAD_KEY = 'pulse_boot_reloads'
export const BOOT_RELOAD_LIMIT = 3
export const BOOT_RELOAD_WINDOW_MS = 10 * 60 * 1000
/** After the load event: Next's scripts have run by then, so a failure has been reported. */
export const BOOT_CHECK_AFTER_LOAD_MS = 1500
/** When the load event never comes (a request that hangs), the check runs this long after the script. */
export const BOOT_CHECK_LATEST_MS = 20000
export const BOOT_PROBE_FIRST_WAIT_MS = 2000
export const BOOT_PROBE_MAX_WAIT_MS = 30000
export const BOOT_PROBE_MAX_TRIES = 40

/** One of the page's own build files (Next writes them under /_next/static/, on any host). */
export function isStaticFile(url: string): boolean {
  return typeof url === 'string' && url.indexOf('/_next/static/') !== -1
}

/**
 * The styles did not apply: the body's background is set by them alone. A body without one
 * computes to a colour whose alpha is zero (four parts, the last one 0), or to `transparent`.
 */
export function stylesMissing(bodyBackground: string): boolean {
  if (!bodyBackground || bodyBackground === 'transparent') return true
  const alpha = /,\s*([0-9.]+)\s*\)$/.exec(bodyBackground)
  return alpha !== null && bodyBackground.split(',').length === 4 && Number(alpha[1]) === 0
}

/** The reload times still inside the window; anything unreadable counts as none. */
export function recentReloads(stored: string | null, now: number, windowMs: number): number[] {
  let list: unknown
  try {
    list = JSON.parse(stored || '[]')
  } catch {
    return []
  }
  if (!Array.isArray(list)) return []
  return list.filter((t) => typeof t === 'number' && now - t >= 0 && now - t < windowMs)
}

/** The same file, fresh: a query no cache holds, so neither the browser nor the service worker answers it. */
export function probeUrl(url: string, now: number): string {
  return url + (url.indexOf('?') === -1 ? '?' : '&') + 'boot-probe=' + now
}

export function bootRecoveryScript(): string {
  return `(function(){try{
var KEY=${JSON.stringify(BOOT_RELOAD_KEY)},LIMIT=${BOOT_RELOAD_LIMIT},WINDOW=${BOOT_RELOAD_WINDOW_MS};
var isStatic=${isStaticFile.toString()};
var missing=${stylesMissing.toString()};
var recent=${recentReloads.toString()};
var fresh=${probeUrl.toString()};
var failed='',settled=false,loaded=false;
window.addEventListener('error',function(e){if(settled)return;var t=e&&e.target;if(!t||t===window||!t.tagName)return;
var u=t.tagName==='LINK'?t.href:(t.tagName==='SCRIPT'?t.src:'');if(u&&isStatic(u)&&!failed)failed=u;},true);
function firstStatic(){var els=document.querySelectorAll('link[rel="stylesheet"],script[src]');for(var i=0;i<els.length;i++){var u=els[i].href||els[i].src||'';if(isStatic(u))return u;}return '';}
function check(){if(settled)return;settled=true;var bg='';try{bg=getComputedStyle(document.body).backgroundColor;}catch(x){}
if(!failed&&!missing(bg))return;var store,done;try{store=window.sessionStorage;done=recent(store.getItem(KEY),Date.now(),WINDOW);}catch(x){return;}
if(done.length>=LIMIT)return;var target=failed||firstStatic()||(location.origin+'/manifest.json');var wait=${BOOT_PROBE_FIRST_WAIT_MS},tries=0;
function attempt(){if(++tries>${BOOT_PROBE_MAX_TRIES})return;if(navigator.onLine===false){window.addEventListener('online',attempt,{once:true});return;}
fetch(fresh(target,Date.now()),{mode:'no-cors',cache:'no-store'}).then(function(){try{done.push(Date.now());store.setItem(KEY,JSON.stringify(done));}catch(x){return;}location.reload();},
function(){wait=Math.min(wait*2,${BOOT_PROBE_MAX_WAIT_MS});setTimeout(attempt,wait);});}
setTimeout(attempt,wait);}
window.addEventListener('load',function(){loaded=true;setTimeout(check,${BOOT_CHECK_AFTER_LOAD_MS});});
setTimeout(function(){if(!loaded)check();},${BOOT_CHECK_LATEST_MS});
}catch(e){}})();`
}
