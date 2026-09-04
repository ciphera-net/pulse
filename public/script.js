/**
 * Pulse - Privacy-First Tracking Script
 * Lightweight, no cookies, no localStorage, no client-side identifiers. GDPR compliant.
 * Visits and visitors are identified server-side: a daily-rotating session hash and a
 * monthly-rotating visitor hash of IP + UA + domain, salted on the site's own calendar.
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

  // * Respect Do Not Track
  if (navigator.doNotTrack === '1' || navigator.doNotTrack === 'yes' || navigator.msDoNotTrack === '1') {
    return;
  }

  // * Respect Global Privacy Control (legally binding under CCPA, recognized by EU regulators)
  if (navigator.globalPrivacyControl === true) {
    return;
  }

  // * Skip headless browsers and automated tools (Puppeteer, Playwright, Selenium)
  if (navigator.webdriver) {
    return;
  }

  // * Self-traffic exclusion: site owners can exclude themselves via ?pulse-ignore
  // * Visit any page with ?pulse-ignore to toggle the exclusion flag on/off
  var IGNORE_KEY = 'pulse_ignore';
  try {
    if (location.search.indexOf('pulse-ignore') !== -1) {
      if (localStorage.getItem(IGNORE_KEY)) {
        localStorage.removeItem(IGNORE_KEY);
      } else {
        localStorage.setItem(IGNORE_KEY, 'true');
      }
    }
    if (localStorage.getItem(IGNORE_KEY)) {
      return;
    }
  } catch (e) {}

  // * Get config from script tag, or fall back to window.pulseConfig for GTM / tag managers
  // * GTM Custom HTML tags may not preserve data-* attributes on the injected <script> element,
  // * so we also search by src URL and support a global config object.
  const script = document.currentScript
    || document.querySelector('script[data-domain]')
    || document.querySelector('script[src*="js.ciphera.net/script"]')
    || document.querySelector('script[src*="pulse.ciphera.net/script"]');

  const globalConfig = window.pulseConfig || {};

  // * Helper: read a config value from script data-* attribute or globalConfig
  function attr(name) {
    // * Support both data-attr style ("some-name") and camelCase config style ("someName")
    var camel = name.replace(/-([a-z])/g, function(_, c) { return c.toUpperCase(); });
    return (script && script.getAttribute('data-' + name)) || globalConfig[name] || globalConfig[camel] || null;
  }
  function hasAttr(name) {
    // * Support both "no-scroll" (data-attr style) and "noScroll" (camelCase config style)
    var camel = name.replace(/-([a-z])/g, function(_, c) { return c.toUpperCase(); });
    return (script && script.hasAttribute('data-' + name)) || globalConfig[name] === true || globalConfig[camel] === true;
  }

  // * Resolve domain: explicit config > data-domain > auto-detect from hostname
  // * Auto-detect enables zero-config GTM installs; the backend validates Origin anyway
  var explicitDomain = attr('domain');
  const domain = explicitDomain || location.hostname.replace(/^www\./, '');
  if (!domain) {
    return;
  }

  const apiUrl = attr('api') || 'https://pulse-api.ciphera.net';

  // * Identity is fully server-side: a daily-rotating session hash and a monthly-rotating
  // * visitor hash of IP + UA + domain, salted on the site's own calendar. No client-side
  // * visitor ID storage — zero localStorage, zero identifying sessionStorage, zero cookies.

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
  var humanSignals = 0;
  if (!navigator.webdriver) humanSignals |= 8;
  if (navigator.plugins && navigator.plugins.length > 0) humanSignals |= 16;
  if (navigator.languages && navigator.languages.length > 1) humanSignals |= 32;
  if (!document.hidden) humanSignals |= 4;

  function onHumanInput() {
    humanSignals |= 1;
    document.removeEventListener('mousemove', onHumanInput);
    document.removeEventListener('touchstart', onHumanInput);
    document.removeEventListener('keydown', onHumanInput);
  }
  document.addEventListener('mousemove', onHumanInput, { passive: true });
  document.addEventListener('touchstart', onHumanInput, { passive: true });
  document.addEventListener('keydown', onHumanInput, { passive: true });

  // * Activity for the idle window: anything a person does to a page. Scroll is added
  // * below where it is measured.
  var ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'pointerdown', 'keydown', 'touchstart', 'wheel', 'click'];
  for (var ai = 0; ai < ACTIVITY_EVENTS.length; ai++) {
    document.addEventListener(ACTIVITY_EVENTS[ai], noteActivity, { passive: true, capture: true });
  }

  function beacon(data) {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(apiUrl + ENGAGEMENT_PATH, new Blob([data], {type: 'application/json'}));
    } else {
      fetch(apiUrl + ENGAGEMENT_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: data,
        keepalive: true
      }).catch(function() {});
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
    // * Include scroll depth if scroll tracking is enabled and user scrolled
    if (typeof maxScrollPct !== 'undefined' && maxScrollPct > 0) {
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
    var engaged = payload.engaged_duration > 0 ||
                  (typeof maxScrollPct !== 'undefined' && maxScrollPct > 0) ||
                  (humanSignals & 1) !== 0;
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
  window.addEventListener('pagehide', function() { sendMetrics(true, true); });

  // * Session ID is computed server-side from a daily-rotating hash of IP + UA + domain.
  // * No client-side visitor ID storage needed.

  // * Normalize path: strip trailing slash, return pathname only.
  // * UTM extraction and query handling moved server-side.
  function cleanPath() {
    var pathname = window.location.pathname;
    // * Strip trailing slash (but keep root /)
    if (pathname.length > 1 && pathname.charAt(pathname.length - 1) === '/') {
      pathname = pathname.slice(0, -1);
    }
    return pathname;
  }

  // * Refresh dedup: skip pageview if the same path was tracked within 5 seconds
  // * Prevents inflated pageview counts from F5/refresh while allowing genuine revisits.
  // * The record also carries the pageview's id and engagement so far, so the reloaded
  // * document can carry on reporting against the same pageview instead of going dark.
  var REFRESH_DEDUP_WINDOW = 5000;
  var DEDUP_STORAGE_KEY = 'ciphera_last_pv';

  function readLastPageview() {
    try {
      var raw = sessionStorage.getItem(DEDUP_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function rememberPageview() {
    if (!currentEventId) return;
    try {
      sessionStorage.setItem(DEDUP_STORAGE_KEY, JSON.stringify({
        p: cleanPath(), t: pageStartTime, id: currentEventId,
        e: Math.round(engagedMs / 1000), v: Math.round(visibleMs / 1000)
      }));
    } catch (e) {}
  }

  function adoptPageview(last) {
    currentEventId = last.id;
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
    if (trackScroll) { maxScrollPct = 0; }
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
    var last = readLastPageview();
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

  function sendPageview(path) {
    const screenSize = {
      width: window.innerWidth || window.screen.width,
      height: window.innerHeight || window.screen.height,
    };

    // * iPadOS 13+ reports a Macintosh user-agent that is byte-identical to
    // * macOS desktop Safari — there is no way to tell them apart server-side.
    // * The only reliable client-side discriminator is navigator.maxTouchPoints:
    // * Macs always report 0 or 1 (there is no touchscreen Mac hardware), iPads
    // * report 5 or 10. Send an explicit hint so the backend parser can classify
    // * correctly as iOS+tablet instead of macOS+tablet (which would hit the
    // * impossible_device Cerberus rule and false-positive legitimate iPad users).
    var clientOSHint = '';
    try {
      if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
        clientOSHint = 'iPadOS';
      }
    } catch (e) {}

    const payload = {
      domain: domain,
      url: location.href,
      title: document.title,
      referrer: document.referrer || '',
      screen: screenSize,
      language: navigator.language || '',
      timezone: (function() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch(e) { return ''; } })(),
      hs: humanSignals,
      client_os_hint: clientOSHint,
    };

    var startedAt = Date.now();

    // * Send event
    fetch(apiUrl + '/api/v1/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      keepalive: true,
    }).then(res => res.json())
    .then(data => {
      // * The document navigated on while this was in flight: that page is gone.
      if (cleanPath() !== path || currentEventId) return;
      if (data && data.id) {
        currentEventId = data.id;
        pageStartTime = startedAt;
        rememberPageview();
        startPageClocks();
      }
    }).catch(() => {
      // * Silently fail - don't interrupt user experience
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
  window.addEventListener('pageshow', function(e) {
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
  var _push = history.pushState;
  var _replace = history.replaceState;
  history.pushState = function() { _push.apply(this, arguments); onUrlChange(); };
  history.replaceState = function() { _replace.apply(this, arguments); onUrlChange(); };

  // * Track popstate (browser back/forward)
  window.addEventListener('popstate', onUrlChange);

  // * Custom events / goals
  function trackCustomEvent(eventName, props, revenue) {
    if (typeof eventName !== 'string' || !eventName.trim()) return;
    var payload = {
      domain: domain,
      url: location.href,
      title: document.title,
      referrer: document.referrer || '',
      screen: { width: window.innerWidth || window.screen.width, height: window.innerHeight || window.screen.height },
      name: eventName.trim().toLowerCase(),
    };
    if (props && typeof props === 'object' && !Array.isArray(props)) {
      payload.props = props;
    }
    if (typeof revenue === 'number' && isFinite(revenue) && revenue >= 0) {
      payload.revenue = revenue;
    }
    fetch(apiUrl + '/api/v1/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(function() {});
  }

  // * Expose pulse.track() for custom events (e.g. pulse.track('signup_click'))
  window.pulse = window.pulse || {};
  window.pulse.track = trackCustomEvent;
  window.pulse.cleanPath = cleanPath;

  // * Auto-track exact scroll depth percentage (on by default)
  // * Scroll depth is sent as part of the metrics payload on page exit
  // * Opt-out: add data-no-scroll to the script tag
  var trackScroll = !hasAttr('no-scroll');
  var maxScrollPct = 0;

  if (trackScroll) {
    var scrollTicking = false;

    function checkScroll() {
      var docHeight = document.documentElement.scrollHeight;
      var viewHeight = window.innerHeight;
      if (docHeight <= viewHeight) {
        maxScrollPct = 100;
        scrollTicking = false;
        return;
      }
      var scrollTop = window.scrollY;
      var pct = Math.min(100, Math.round((scrollTop + viewHeight) / docHeight * 100));
      if (pct > maxScrollPct) maxScrollPct = pct;
      humanSignals |= 2;
      scrollTicking = false;
    }

    window.addEventListener('scroll', function() {
      noteActivity();
      if (!scrollTicking) {
        scrollTicking = true;
        requestAnimationFrame(checkScroll);
      }
    }, { passive: true });
  }

  // * Auto-track outbound link clicks and file downloads (on by default)
  // * Opt-out: add data-no-outbound or data-no-downloads to the script tag
  var trackOutbound = !hasAttr('no-outbound');
  var trackDownloads = !hasAttr('no-downloads');

  if (trackOutbound || trackDownloads) {
    var FILE_EXT_REGEX = /\.(pdf|zip|gz|tar|xlsx|xls|csv|docx|doc|pptx|ppt|mp4|mp3|wav|avi|mov|exe|dmg|pkg|deb|rpm|iso|7z|rar)($|\?|#)/i;

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
        if (trackDownloads && (el.hasAttribute('download') || FILE_EXT_REGEX.test(url.pathname))) {
          trackCustomEvent('file_download', { url: url.href, page_path: cleanPath() });
          return;
        }

        // * Check outbound link (different hostname)
        if (trackOutbound && url.hostname && url.hostname !== location.hostname) {
          trackCustomEvent('outbound_link', { url: url.href, page_path: cleanPath() });
        }
      } catch (err) {
        // * Invalid URL - skip silently
      }
    }, true); // * Capture phase: fires before default navigation
  }

})();
