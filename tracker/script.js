/**
 * Pulse Analytics - Privacy-First Tracking Script
 * Lightweight, no cookies, and nothing kept in the visitor's browser: the one exception is a
 * site owner's own opt-out flag, written only when they open their site with ?pulse-ignore=on
 * (cleared by ?pulse-ignore=off), and read from localStorage on every load so their own visits
 * are not counted.
 * Visits are recognised server-side, from the IP address and the browser string; the browser
 * holds no identifier.
 *
 * THIS script reads no page content. It records which page was seen, for how long, and how
 * far down it was scrolled — plus, where a link leaves the site or downloads a file, that
 * link's URL. Nothing about the text on the page enters a payload from here.
 *
 * ⚠️ script.interactions.js, the OPTIONAL companion, does read some: the visible label of a
 * clicked control, capped and redacted in the browser. This script loads it only when the
 * site owner has switched interactions on in the site's settings (before v1.9.0 it was a tag
 * of its own), it is absent otherwise, and its own header states exactly what it records and
 * what it never records. If you are auditing what Pulse collects, read both files — this one
 * is not the whole story once interactions are on.
 *
 * v1.10.0 (17-11-2026): a pageview or a custom event that cannot be delivered goes out again
 * while the page stays open, for up to 30 minutes (send, below), so a short outage or a dropped
 * connection no longer loses it. Each event carries its own random `idempotency_key`, made for
 * that one event, so the server stores a retried event once. It names an event, never a
 * visitor, and like everything else here it lives in this page's memory only. The bytes for it
 * came from tightening code elsewhere, so the script stays under its 3 KB ceiling.
 *
 * v1.9.0 (14-11-2026): every option is the SITE'S SETTINGS, sent by the server, never a flag
 * on the tag, so one tag serves every site and a setting applies without touching it. Most
 * browsers learn the settings from the answer to their first pageview; a browser sending Do
 * Not Track or Global Privacy Control asks for them first and sends nothing more unless the
 * site counts it. The settings live in this script's memory only.
 * Design: Pulse/docs/plans/14-11-2026-one-tag-settings-from-server-design.md
 *
 * v1.2.0 (04-09-2026): time on page is ENGAGED time — seconds the page was visible and the
 * visitor active — accumulated in bounded ticks, so a sleeping laptop, a frozen background
 * tab or a tab left open overnight can add at most one tick, never an hour. A pageview is a
 * person seeing a page: a document that loads hidden waits until it is shown, and a URL
 * rewrite that only changes the query string is state, not a navigation.
 * Audit: Pulse/docs/audits/04-09-2026-visit-duration-audit.md
 */

(function() {
  'use strict';

  // * One tracker per document. A second copy (a theme AND a plugin both embedding the
  // * snippet, or a tag manager firing twice) would double every pageview and patch
  // * history twice.
  if (window.__pulseInstalled) return;
  window.__pulseInstalled = true;

  // * Get config from script tag, or fall back to window.pulseConfig for GTM / tag managers
  // * GTM Custom HTML tags may not preserve data-* attributes on the injected <script> element,
  // * so we also search by src URL and support a global config object.
  const script = document.currentScript
    || document.querySelector('script[data-domain]')
    || document.querySelector('script[src*="ciphera.net/script"]');

  const globalConfig = window.pulseConfig || {};

  // * The tag names the site and, if it wants, where to send: data-domain / data-api (domain / api
  // * in window.pulseConfig). Nothing else is read from it since v1.9.0. Every option is the site's
  // * saved settings, which the server sends (see `cfg` below), so the tag is the same for every site
  // * and a setting never needs a new one. The flags earlier tags carry (data-no-scroll,
  // * data-ignore-dnt, …) are ignored, and the server applies the dashboard's choice whatever a
  // * tag says.
  function attr(name) {
    return (script && script.getAttribute('data-' + name)) || globalConfig[name];
  }

  // * Self-traffic exclusion (v1.8.0): the site owner's two links on Privacy.
  // * ?pulse-ignore=on, or a bare ?pulse-ignore (the link before 1.8.0), stops counting this
  // * browser on this site; ?pulse-ignore=off counts it again. Each link does only that, so a
  // * reload, a bookmark or a restored tab can't undo it. Until 1.8.0 every open FLIPPED the
  // * flag, so every second open undid the first, and nothing said which way it went.
  // * Any other value does nothing. Audit: Pulse/docs/audits/06-11-2026-exclude-own-visits.md
  var IGNORE_KEY = 'pulse_ignore';
  var ignoreArg = null;
  try {
    ignoreArg = new URLSearchParams(location.search).get('pulse-ignore');
  } catch (e) {}
  var askedIgnore = ignoreArg === '' || ignoreArg === 'on' || ignoreArg === 'off';

  // * What happened is said on the page by script.note.js, loaded from beside this script only
  // * when a link was opened, so visitors never download it. It carries this tag's nonce for a
  // * CSP that requires one. If it can't load (a site serving this script from its own address
  // * without that file), the flag is still set; only the note is missing.
  // *
  // * 1.8.1: a CSP that enforces Trusted Types (require-trusted-types-for 'script') refuses a
  // * plain string as a script's src. 1.8.0 threw there, so the note never showed and the throw
  // * ended this run: a Count me again visit went uncounted. Now the URL goes through a policy
  // * named "pulse". The policy comes first because a refused plain assignment is itself a
  // * violation: the console shows it and the site's CSP reports it. A browser without Trusted
  // * Types, or a CSP that lists the policies it allows (trusted-types …) without pulse, gets the
  // * plain URL; where that is refused too, the file does not load. Nothing here throws.
  // *
  // * 1.9.0: the same loader brings the interactions companion when the site's settings turn it on
  // * (settings, below). The policy is created once, because a CSP that names pulse may refuse a
  // * second policy of the same name, and it can return only two URLs, the note or the companion
  // * beside this script, whatever it is handed.
  var base = ((script && script.src) || 'https://js.ciphera.net/script.js').replace(/[^/]*$/, '');
  var policy;
  function load(file, note) {
    var s = document.createElement('script');
    var src;
    try {
      policy = policy || trustedTypes.createPolicy('pulse', {
        createScriptURL: f => base + (f === 'script.interactions.js' ? f : 'script.note.js')
      });
      src = policy.createScriptURL(file);
    } catch (e) {
      src = base + file;
    }
    try {
      s.src = src;
    } catch (e) {
      return;
    }
    if (note) s.setAttribute('data-note', note);
    if (script && script.nonce) s.nonce = script.nonce;
    (document.head || document.documentElement).appendChild(s);
  }

  // * Skip headless browsers and automated tools (Puppeteer, Playwright, Selenium). First, so that
  // * automation never asks for a site's settings either.
  if (navigator.webdriver) {
    return;
  }

  // * Resolve domain: explicit config > data-domain > auto-detect from hostname
  // * Auto-detect enables zero-config GTM installs; the backend validates Origin anyway
  const domain = attr('domain') || location.hostname.replace(/^www\./, '');
  if (!domain) {
    return;
  }

  const apiUrl = attr('api') || 'https://pulse-api.ciphera.net';

  // * The site's settings (v1.9.0): scroll, outbound, downloads, interactions and its three kinds,
  // * and whether the site counts browsers that send a privacy signal. Held in this variable only,
  // * never in storage. Every pageview's answer carries them (`c`, settings() below); until the
  // * first answer arrives the defaults apply, and the server enforces the settings either way.
  var cfg = {};

  // * The owner's own-visits link, then their opt-out flag, then everything else (run).
  function begin() {
    if (askedIgnore) {
      var outcome = 'off';
      try {
        if (ignoreArg === 'off') {
          localStorage.removeItem(IGNORE_KEY);
        } else {
          localStorage.setItem(IGNORE_KEY, 'true');
          outcome = 'on';
        }
      } catch (e) {
        // * Storage refused (a privacy setting, a full quota): said, not swallowed. Off needs no
        // * warning: a browser that stores nothing can't hold the flag either.
        if (ignoreArg !== 'off') outcome = 'refused';
      }
      load('script.note.js', outcome);
    }
    try {
      if (localStorage.getItem(IGNORE_KEY)) {
        return;
      }
    } catch (e) {}
    run();
  }

  // * Privacy signals: HONOURED unless the SITE'S SETTINGS count them (v1.9.0; until then a
  // * data-ignore-dnt / data-ignore-gpc flag on the tag). Two switches on purpose: DNT has no legal
  // * force anywhere, while GPC is an opt-out signal under the CCPA, and counting one must never
  // * count the other.
  // *
  // * A browser sending either cannot send a pageview to find out whether the site counts it. It
  // * asks for the site's settings first, with the domain alone (no page, no title, no referrer;
  // * the server stores nothing), and sends nothing more unless the site counts it. A failed request
  // * (blocked, offline, an error) respects the signal. Not counted, storage stays untouched (as
  // * before 1.8.0), and the owner who opened a link is told why. begin() runs outside the failure
  // * handler, so a fault after a successful answer is never mistaken for a respected signal.
  // * 1.9.0 dropped two dead spellings: navigator.msDoNotTrack (IE 9 and 10, which cannot parse this
  // * script) and doNotTrack 'yes' (Firefox 31 and older, which has no fetch and so sends nothing).
  var dnt = navigator.doNotTrack === '1';
  var gpc = navigator.globalPrivacyControl === true;
  if (dnt || gpc) {
    fetch(apiUrl + '/api/v1/script-settings/' + domain, { referrerPolicy: 'no-referrer' })
      .then(r => r.json())
      .then(s => {
        if ((dnt && s.respect_dnt !== false) || (gpc && s.respect_gpc !== false)) throw 0;
        cfg = s;
      })
      .then(begin, () => {
        if (askedIgnore) load('script.note.js', 'signal');
      });
  } else {
    begin();
  }

  // * Everything that measures and sends: run only once begin() has let this browser through.
  function run() {
    // * Identity is server-side, from the IP address and the browser string: no cookie, nothing
    // * written to storage (the opt-out flag above is only read), no client-generated identifier
    // * of the visitor. (Since 1.10.0 each event carries its own random key, which names that one
    // * event so a retry is stored once; two events never share one. See eventPayload.)
    // *
    // * v1.7.0 writes NOTHING to the browser. Earlier versions kept two records in
    // * sessionStorage: the tab's last pageview, so a reload did not count twice, and from
    // * v1.4.0 the id of its most recent pageview, so the server could keep one visit together
    // * when the address changed between full page loads. Both now live in this document's
    // * memory only: custom events, single-page navigations and a page restored from the
    // * back-forward cache still name the anchor (`anchor_id`), and nothing survives a full
    // * page load. A reload is told to the server instead (`reload`, below), which applies the
    // * five-second rule itself.

    // * Engagement beacon path — deliberately NOT '/api/v1/metrics'.
    // * EasyPrivacy carries a bare, domain-agnostic substring rule for that path (written
    // * for an unrelated vendor), so uBlock Origin, Brave and anything else shipping that
    // * list cancel the beacon client-side with ERR_BLOCKED_BY_CLIENT while the pageview
    // * itself lands — the site records visits with no time-on-page and no scroll depth.
    // * The old path still answers server-side, for scripts already cached at the edge.
    // * See Pulse/docs/audits/26-08-2026-psi-err-blocked-by-client-metrics.md
    var ENGAGEMENT_PATH = '/api/v1/engagement';

    // * ─── Engagement accounting ───────────────────────────────────────────────────────
    // * The clock is a ledger, not a stopwatch. Every TICK_MS an accounting tick credits the
    // * time since the previous tick — capped at TICK_CAP_MS — and only while the document is
    // * visible and the visitor has been active within IDLE_PAUSE_MS. The cap is what makes a
    // * system sleep, a frozen tab or a throttled timer worth one tick instead of the whole
    // * gap; the idle window is what stops a tab left in front of an empty chair from
    // * counting. The wall-clock since load is still sent as `duration` — it is what the
    // * server's bot detection compares against visible time — but the product reads
    // * `engaged_duration`.
    var TICK_MS = 1000;
    var TICK_CAP_MS = 2000;
    var IDLE_PAUSE_MS = 120000;
    var HEARTBEAT_MS = 10000;
    var EARLY_BEACON_MS = 3500;

    var currentEventId = null;
    var pageStartTime = 0;
    var engagedMs = 0;
    var visibleMs = 0;
    var lastTick = Date.now();
    var lastActivity = 0;
    var lastSentEngaged = -1;
    var lastSentScroll = -1;
    var metricsSent = false;
    var pendingPath = null;
    var earlyBeaconTimer = null;
    var heartbeatInterval = null;
    var hasVisibilityAPI = typeof document.hidden !== 'undefined';

    function isVisible() {
      // * In WebViews (Facebook/Instagram in-app browsers) without the Page Visibility API
      // * every second is treated as visible, as before; the tick cap and idle window still bound it.
      return !hasVisibilityAPI || !document.hidden;
    }

    function tick() {
      var t = Date.now();
      var delta = t - lastTick;
      lastTick = t;
      if (!currentEventId) return;
      // * A negative delta is a clock that moved backwards (NTP, resume); a huge one is a
      // * machine that was asleep or a tab that was frozen. Neither is time anyone spent here.
      if (delta < 0) delta = 0;
      if (delta > TICK_CAP_MS) delta = TICK_CAP_MS;
      if (!isVisible()) return;
      visibleMs += delta;
      if (t - lastActivity <= IDLE_PAUSE_MS) engagedMs += delta;
    }
    // * One accounting interval for the document's whole life. Per-page timers are the ones
    // * below; this one never needs clearing, and cannot be leaked by a racing response.
    setInterval(tick, TICK_MS);

    function noteActivity() {
      lastActivity = Date.now();
    }

    // * Cerberus: human signal bitmask for bot detection
    // * Bit 8 is "not automation": always set, since automation never gets this far (the
    // * navigator.webdriver exit above).
    var humanSignals = 8;
    if (navigator.plugins && navigator.plugins.length > 0) humanSignals |= 16;
    if (navigator.languages && navigator.languages.length > 1) humanSignals |= 32;
    if (!document.hidden) humanSignals |= 4;

    // * Bit 1: a person's own input (a pointer moved, a touch, a key). The listeners stay for the
    // * page's life (1.10.0; they removed themselves before, which cost bytes and saved nothing:
    // * setting a bit that is already set is free, and the idle window below listens to the same
    // * events anyway).
    function onHumanInput() {
      humanSignals |= 1;
    }

    // * Activity for the idle window: anything a person does to a page. Scroll is added
    // * below where it is measured.
    ['mousemove', 'mousedown', 'pointerdown', 'keydown', 'touchstart', 'wheel', 'click'].forEach(function (name, i) {
      document.addEventListener(name, noteActivity, { passive: true, capture: true });
      // * mousemove, keydown and touchstart (0, 3, 4) are also the human-input signal above.
      if (!i || i > 2 && i < 5) document.addEventListener(name, onHumanInput, { passive: true });
    });

    // * Engagement goes out as a keepalive fetch, NOT sendBeacon (v1.6.1, PULSE-169). Browsers
    // * type a sendBeacon request as "ping", and EasyPrivacy's `*$ping,third-party` (on by
    // * default in uBlock Origin and Brave) cancels every third-party ping, whatever its path.
    // * It fails silently: sendBeacon reports success once queued, so no fallback ever ran. For
    // * every ad-blocking visitor that lost time on page and scroll depth, and Cerberus' delayed
    // * evaluator then convicted the visit as a zero-engagement bot. A keepalive fetch is typed
    // * "fetch", survives page unload the way a beacon does, and is what the pageview already
    // * uses. sendBeacon remains only for engines without fetch keepalive.
    // *
    // * Its CORS preflight is cached (Access-Control-Max-Age), and the first engagement send
    // * happens seconds into the page, so the one at unload reuses it.
    var FETCH_KEEPALIVE = (function() {
      try { return typeof Request !== 'undefined' && 'keepalive' in Request.prototype; } catch (e) { return false; }
    })();

    // * Every send goes out this one way: the pageview, a custom event, the engagement beacon.
    function post(path, body) {
      return fetch(apiUrl + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true
      });
    }

    // * A pageview or a custom event, sent again while the page stays open when it could not be
    // * delivered (v1.10.0, after the 17-11-2026 outage: for 23 minutes every send failed and each
    // * event was simply gone). A send that fails before an answer (offline, a dropped connection, an
    // * edge whose error page carries no CORS header) or is answered 408, 429 or 5xx goes out again
    // * after 2 s plus its age, at most every 5 minutes, so the gaps double (2 s, 4 s, 8 s ...), until
    // * it is 30 minutes old. Any other answer is final: a 4xx says the event itself was refused.
    // *
    // * 🔑 Only an event that carries its `idempotency_key` (eventPayload) is sent again. The server
    // * keeps the key of every event it accepted for an hour and answers a repeat with the same id
    // * without storing it, so a send that WAS stored but whose answer was lost is not counted twice.
    // * Without the key (no crypto.randomUUID: a page served over plain http, an old browser) a
    // * retry could double an event, so there is none, as before 1.10.0.
    // *
    // * In memory only, like everything else here: a page that closes with a send still pending
    // * loses it. Engagement is not retried: every report carries the whole page so far and the
    // * server keeps the largest, so the next one covers a lost one.
    function send(payload, done, first) {
      first = first || Date.now();
      post('/api/v1/events', JSON.stringify(payload)).then(function (res) {
        if (res.status > 499 || res.status === 429 || res.status === 408) throw 0;
        return res.json();
      }).then(done, function () {
        var age = Date.now() - first;
        if (payload.idempotency_key && age < 1800000) {
          setTimeout(function () { send(payload, done, first); }, Math.min(300000, 2000 + age));
        }
      });
    }

    function beacon(data) {
      if (FETCH_KEEPALIVE || !navigator.sendBeacon) {
        post(ENGAGEMENT_PATH, data).catch(function() {});
      } else {
        navigator.sendBeacon(apiUrl + ENGAGEMENT_PATH, new Blob([data], {type: 'application/json'}));
      }
    }

    function engagementPayload() {
      var wallSec = pageStartTime > 0 ? Math.round((Date.now() - pageStartTime) / 1000) : 0;
      var payload = {
        event_id: currentEventId,
        duration: wallSec,
        visible_duration: Math.round(visibleMs / 1000),
        engaged_duration: Math.round(engagedMs / 1000)
      };
      // * Scroll depth, unless the site's settings turn it off.
      if (cfg.scroll !== false && maxScrollPct > 0) {
        payload.scroll_depth = maxScrollPct;
      }
      return payload;
    }

    // * Send the page's engagement so far. `final` closes the page (SPA navigation,
    // * pagehide); a non-final send is a progress report and is skipped when nothing has
    // * advanced since the last one, so a hidden or idle tab sends nothing. `force` sends
    // * even without progress — used when the tab is hidden, because that may be the last
    // * chance to get the numbers out on a mobile app kill.
    function sendMetrics(final, force) {
      if (!currentEventId || metricsSent) return;
      tick();
      var payload = engagementPayload();
      if (payload.duration <= 0) return;

      // * Cerberus proof-of-engagement: only report a page that showed evidence of a person —
      // * engaged time, a scroll, or an input event. A bot that renders the page and leaves
      // * produces no beacon, exactly as before, and the delayed evaluator sees the silence.
      var engaged = payload.engaged_duration > 0 || maxScrollPct > 0 || (humanSignals & 1) !== 0;
      if (!engaged) return;

      var scroll = payload.scroll_depth || 0;
      if (!final && !force && payload.engaged_duration === lastSentEngaged && scroll === lastSentScroll) return;
      lastSentEngaged = payload.engaged_duration;
      lastSentScroll = scroll;

      if (final) {
        metricsSent = true;
        clearTimeout(earlyBeaconTimer);
        clearInterval(heartbeatInterval);
      }
      rememberPageview();
      beacon(JSON.stringify(payload));
    }

    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        // * Flush, do not close: the tab may come back, and the server keeps the largest
        // * value it has seen, so a later report can only extend this one.
        sendMetrics(false, true);
      } else {
        lastTick = Date.now();
        noteActivity();
        humanSignals |= 4;
        if (pendingPath !== null) {
          var path = pendingPath;
          pendingPath = null;
          sendPageview(path);
        }
      }
    });

    // * pagehide is the page's real end (navigation away, tab close, or entry into the
    // * back-forward cache). A restore from that cache is a new pageview, below.
    addEventListener('pagehide', function() { sendMetrics(true, true); });

    // * Normalize path: strip trailing slash, return pathname only.
    // * UTM extraction and query handling moved server-side.
    function cleanPath() {
      // * Strip one trailing slash, but keep the root /: the slash must follow a character.
      return location.pathname.replace(/([^])\/$/, '$1');
    }

    // * Refresh dedup: skip a pageview if this document tracked the same path within 5 seconds,
    // * and keep reporting against that one (a fast back-and-forth through the back-forward
    // * cache). The record carries the pageview's id and engagement so far. In memory only, so
    // * it cannot see across a reload; the server's own five-second rule covers that.
    var REFRESH_DEDUP_WINDOW = 5000;
    var lastPageview = null;

    // * The anchor: the most recent pageview id the server returned, in memory only. Most
    // * recent, not first, on purpose — a later pageview's identity was itself inherited, so
    // * continuity is transitive. Set where a pageview id is taken up (adoptPageview and the
    // * pageview's answer), both of which hold a real id by then.
    var anchorId = null;

    // * The browser's own verdict that this document is a reload, sent with its first pageview
    // * only: later pageviews in the same document are navigations.
    var reloaded = false;
    try { reloaded = performance.getEntriesByType('navigation')[0].type === 'reload'; } catch (e) {}

    function rememberPageview() {
      if (!currentEventId) return;
      lastPageview = {
        p: cleanPath(), t: pageStartTime, id: currentEventId,
        e: Math.round(engagedMs / 1000), v: Math.round(visibleMs / 1000)
      };
    }

    function adoptPageview(last) {
      currentEventId = anchorId = last.id;
      pageStartTime = last.t;
      engagedMs = (last.e || 0) * 1000;
      visibleMs = (last.v || 0) * 1000;
      startPageClocks();
    }

    function resetPage() {
      clearTimeout(earlyBeaconTimer);
      clearInterval(heartbeatInterval);
      currentEventId = null;
      pageStartTime = 0;
      engagedMs = 0;
      visibleMs = 0;
      lastSentEngaged = -1;
      lastSentScroll = -1;
      metricsSent = false;
      pendingPath = null;
      maxScrollPct = 0;
    }

    function startPageClocks() {
      lastTick = Date.now();
      noteActivity();
      metricsSent = false;
      lastSentEngaged = -1;
      lastSentScroll = -1;
      earlyBeaconTimer = setTimeout(function() { sendMetrics(false, false); }, EARLY_BEACON_MS);
      heartbeatInterval = setInterval(function() { if (isVisible()) sendMetrics(false, false); }, HEARTBEAT_MS);
    }

    var lastPath = null;

    // * Track pageview
    function trackPageview() {
      const path = cleanPath();
      lastPath = path;

      // * Skip if same path was just tracked (refresh dedup) — and keep reporting against it.
      // * A negative age is a clock that stepped backwards; treating it as "just tracked"
      // * would blackout every pageview until the clock caught up.
      var last = lastPageview;
      var age = last ? Date.now() - last.t : -1;
      if (last && last.p === path && last.id && age >= 0 && age < REFRESH_DEDUP_WINDOW) {
        if (currentEventId !== last.id) {
          if (currentEventId) sendMetrics(true, true);
          resetPage();
          adoptPageview(last);
        }
        return;
      }

      // * SPA nav: close the previous page with its engaged time now — visibilitychange
      // * will not fire for it.
      if (currentEventId) sendMetrics(true, true);
      resetPage();

      // * A document nobody can see is not a pageview yet: a background-tab restore, a tab
      // * that reloaded itself after a deploy, a prerender. Wait until it is shown; the
      // * clock starts then.
      if (hasVisibilityAPI && document.hidden) {
        pendingPath = path;
        return;
      }
      sendPageview(path);
    }

    // * iPadOS 13+ reports a Macintosh user-agent that is byte-identical to
    // * macOS desktop Safari — there is no way to tell them apart server-side.
    // * The only reliable client-side discriminator is navigator.maxTouchPoints:
    // * Macs always report 0 or 1 (there is no touchscreen Mac hardware), iPads
    // * report 5 or 10. Send an explicit hint so the backend parser can classify
    // * correctly as iOS+tablet instead of macOS+tablet (which would hit the
    // * impossible_device Cerberus rule and false-positive legitimate iPad users).
    // *
    // * 🔴 COMPUTED ONCE, FOR EVERY EVENT KIND (19-09-2026). It used to live inside
    // * sendPageview, so an iPad's PAGEVIEWS were stored as iOS while its clicks and
    // * every other custom event — which send no hint — were parsed from the same
    // * Macintosh user-agent and stored as macOS. One device, one session, two
    // * operating systems in the data. It is a device fact, not a pageview fact.
    // * The identity anchor is what surfaced it: its profile guard compares the
    // * stored browser/OS of the anchoring pageview against this request's, so an
    // * iPad refused its own anchor and split into two visitors.
    var clientOSHint = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 ? 'iPadOS' : '';

    // * The fields every event carries, a pageview and a custom event alike.
    function eventPayload() {
      var payload = {
        domain: domain,
        url: location.href,
        title: document.title,
        referrer: document.referrer || '',
        screen: { width: innerWidth || screen.width, height: innerHeight || screen.height },
        client_os_hint: clientOSHint,
      };
      if (anchorId) payload.anchor_id = anchorId;
      // * The event's own random id (v1.10.0), made fresh for every event and never reused, so the
      // * server can tell a retried send from a new event (send, above). It names one event, never a
      // * visitor: two events from the same person carry unrelated ids. The server stores it as the
      // * event's id. crypto.randomUUID exists only on https pages; elsewhere the event has no key
      // * and is not retried.
      try { payload.idempotency_key = crypto.randomUUID(); } catch (e) {}
      return payload;
    }

    function sendPageview(path) {
      const payload = eventPayload();
      // * Either one missing is left out of the JSON, which the server reads as an empty string.
      payload.language = navigator.language;
      try { payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
      payload.hs = humanSignals;
      if (reloaded) {
        payload.reload = true;
        reloaded = false;
      }

      var startedAt = Date.now();

      // * Send event (send() retries it while the page stays open; a final failure stays silent)
      send(payload, data => {
        // * Every answer carries the site's settings, so a change made in the dashboard reaches an
        // * open page with its next pageview.
        if (data && data.c) settings(data.c);
        // * The document navigated on while this was in flight (or being retried): that page is gone.
        if (cleanPath() !== path || currentEventId) return;
        if (data && data.id) {
          currentEventId = anchorId = data.id;
          pageStartTime = startedAt;
          rememberPageview();
          startPageClocks();
        }
      });
    }

    // * Track initial pageview (skip if page is being speculatively prerendered)
    if (document.prerendering) {
      document.addEventListener('prerenderingchange', function() {
        trackPageview();
      }, { once: true });
    } else {
      trackPageview();
    }

    // * A page restored from the back-forward cache was closed by pagehide; the person is
    // * looking at it again, so it is a pageview again (the refresh dedup absorbs a fast
    // * back-and-forth).
    addEventListener('pageshow', function(e) {
      if (e && e.persisted) trackPageview();
    });

    // * Track SPA navigation: MutationObserver (DOM updates) and history.pushState/replaceState
    // * (some SPAs change the URL without a DOM mutation we observe).
    // * A navigation is a PATH change. Query-string and hash rewrites — a dashboard writing
    // * ?metric=, a shop writing ?variant=, an in-page anchor — are state on the same page,
    // * and counting them minted a pageview per click on every SPA.
    function onUrlChange() {
      if (cleanPath() !== lastPath) {
        trackPageview();
      }
    }
    new MutationObserver(onUrlChange).observe(document, { subtree: true, childList: true });
    ['pushState', 'replaceState'].forEach(function (name) {
      var original = history[name];
      history[name] = function () { original.apply(this, arguments); onUrlChange(); };
    });

    // * Track popstate (browser back/forward)
    addEventListener('popstate', onUrlChange);

    // * Custom events / goals
    function trackCustomEvent(eventName, props, revenue) {
      if (typeof eventName !== 'string' || !eventName.trim()) return;
      var payload = eventPayload();
      payload.name = eventName.trim().toLowerCase();
      if (props && typeof props === 'object' && !Array.isArray(props)) {
        payload.props = props;
      }
      if (typeof revenue === 'number' && isFinite(revenue) && revenue >= 0) {
        payload.revenue = revenue;
      }
      send(payload);
    }

    // * Expose pulse.track() for custom events (e.g. pulse.track('signup_click'))
    var api = window.pulse = window.pulse || {};
    api.track = trackCustomEvent;
    api.cleanPath = cleanPath;

    // * Scroll depth, measured on every page and sent with the engagement beacon unless the site's
    // * settings turn it off (engagementPayload). Measured either way: the settings arrive with the
    // * first answer, and the depth is also evidence that a person was there (sendMetrics).
    var maxScrollPct = 0;
    var scrollTicking = false;

    function checkScroll() {
      var docHeight = document.documentElement.scrollHeight;
      var viewHeight = innerHeight;
      if (docHeight <= viewHeight) {
        maxScrollPct = 100;
        scrollTicking = false;
        return;
      }
      var scrollTop = scrollY;
      var pct = Math.min(100, Math.round((scrollTop + viewHeight) / docHeight * 100));
      if (pct > maxScrollPct) maxScrollPct = pct;
      humanSignals |= 2;
      scrollTicking = false;
    }

    addEventListener('scroll', function() {
      noteActivity();
      if (!scrollTicking) {
        scrollTicking = true;
        requestAnimationFrame(checkScroll);
      }
    }, { passive: true });

    // * Outbound link clicks and file downloads, each unless the site's settings turn it off. Read at
    // * click time, because the settings arrive with the first answer.
    // * Tested against url.pathname, which never holds a query or a fragment, so the extension ends
    // * the string (1.10.0 dropped a `($|\?|#)` that could never match the last two ways).
    var FILE_EXT_REGEX = /\.(pdf|zip|gz|tar|xlsx?|csv|docx?|pptx?|mp[34]|wav|avi|mov|exe|dmg|pkg|deb|rpm|iso|7z|rar)$/i;

    document.addEventListener('click', function(e) {
      var el = e.target;
      // * Walk up from clicked element to find nearest <a> tag
      while (el && el.tagName !== 'A') el = el.parentElement;
      if (!el || !el.href) return;

      try {
        var url = new URL(el.href, location.href);
        // * Skip non-http links (mailto:, tel:, javascript:, etc.)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

        // * Check file download first (download attribute or known file extension)
        if (cfg.downloads !== false && (el.hasAttribute('download') || FILE_EXT_REGEX.test(url.pathname))) {
          trackCustomEvent('file_download', { url: url.href, page_path: cleanPath() });
          return;
        }

        // * Check outbound link (different hostname)
        if (cfg.outbound !== false && url.hostname && url.hostname !== location.hostname) {
          trackCustomEvent('outbound_link', { url: url.href, page_path: cleanPath() });
        }
      } catch (err) {
        // * Invalid URL - skip silently
      }
    }, true); // * Capture phase: fires before default navigation

    // * The site's settings from a pageview's answer. Interactions capture is the optional companion,
    // * loaded from beside this script once the settings turn it on, and once per page. The settings
    // * are also published as window.pulse.c, which the companion reads each time it fires: it skips
    // * a kind they switch off, and so does a copy loaded by the companion's own older tag.
    var companion;
    function settings(c) {
      cfg = api.c = c;
      if (c.interactions && !companion) {
        companion = 1;
        load('script.interactions.js');
      }
    }
  }

})();
