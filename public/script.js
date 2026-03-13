/**
 * Pulse - Privacy-First Tracking Script
 * Lightweight, no cookies, GDPR compliant.
 * Default: cross-tab visitor ID (localStorage), optional data-storage-ttl in hours.
 * Optional: data-storage="session" for per-tab (ephemeral) counting.
 */

(function() {
  'use strict';

  // * Respect Do Not Track
  if (navigator.doNotTrack === '1' || navigator.doNotTrack === 'yes' || navigator.msDoNotTrack === '1') {
    return;
  }

  // * Get domain from script tag
  const script = document.currentScript || document.querySelector('script[data-domain]');
  if (!script || !script.getAttribute('data-domain')) {
    return;
  }

  const domain = script.getAttribute('data-domain');
  const apiUrl = script.getAttribute('data-api') || 'https://pulse-api.ciphera.net';
  // * Visitor ID storage: "local" (default, cross-tab) or "session" (ephemeral per-tab)
  const storageMode = (script.getAttribute('data-storage') || 'local').toLowerCase() === 'session' ? 'session' : 'local';
  // * When storage is "local", optional TTL in hours; after TTL the ID is regenerated (e.g. 24 = one day)
  const ttlHours = storageMode === 'local' ? parseFloat(script.getAttribute('data-storage-ttl') || '24') : 0;
  const ttlMs = ttlHours > 0 ? ttlHours * 60 * 60 * 1000 : 0;

  // * Performance Monitoring (Core Web Vitals) State
  let currentEventId = null;
  let metrics = { lcp: 0, cls: 0, inp: 0 };
  let lcpObserved = false;
  let clsObserved = false;
  let performanceInsightsEnabled = false;

  // * Minimal Web Vitals Observer
  function observeMetrics() {
    try {
      if (typeof PerformanceObserver === 'undefined') return;

      // * LCP (Largest Contentful Paint) - fires when the browser has determined the LCP element (often 2–4s+ after load)
      new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          metrics.lcp = lastEntry.startTime;
          lcpObserved = true;
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });

      // * CLS (Cumulative Layout Shift) - accumulates when elements shift after load
      new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (!entry.hadRecentInput) {
            metrics.cls += entry.value;
            clsObserved = true;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });

      // * INP (Interaction to Next Paint) - Simplified (track max duration)
      new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        for (const entry of entries) {
           // * Track longest interaction
           if (entry.duration > metrics.inp) metrics.inp = entry.duration;
        }
      }).observe({ type: 'event', buffered: true, durationThreshold: 16 });

    } catch (e) {
      // * Browser doesn't support PerformanceObserver or specific entry types
    }
  }

  function sendMetrics() {
    if (!performanceInsightsEnabled || !currentEventId) return;

    // * Only include LCP/CLS when the browser actually reported them. Sending 0 overwrites
    // * the DB before LCP/CLS have fired (they fire late). The backend does partial updates
    // * and leaves unset fields unchanged.
    const payload = { event_id: currentEventId, inp: metrics.inp };
    if (lcpObserved) payload.lcp = metrics.lcp;
    if (clsObserved) payload.cls = metrics.cls;

    const data = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      navigator.sendBeacon(apiUrl + '/api/v1/metrics', new Blob([data], {type: 'application/json'}));
    } else {
      fetch(apiUrl + '/api/v1/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: data,
        keepalive: true
      }).catch(() => {});
    }
  }

  // * Start observing metrics immediately (buffered observers will capture early metrics)
  // * Metrics will only be sent if performance insights are enabled (checked in sendMetrics)
  observeMetrics();

  // * Send metrics when user leaves or hides the page
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // * Delay metrics slightly so in-flight LCP/CLS callbacks can run before we send
      setTimeout(sendMetrics, 150);
    }
  });

  // * Memory cache for session ID (fallback if storage is unavailable)
  let cachedSessionId = null;

  function generateId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // * Returns session/visitor ID. Default: persistent (localStorage, cross-tab), optional TTL in hours.
  // * With data-storage="session": ephemeral (sessionStorage, per-tab).
  function getSessionId() {
    if (cachedSessionId) {
      return cachedSessionId;
    }

    const key = 'ciphera_session_id';
    const legacyKey = 'plausible_session_' + (domain ? domain.trim() : '');

    if (storageMode === 'local') {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.id === 'string') {
              const hasValidCreated = typeof parsed.created === 'number';
              const expired = ttlMs > 0 && (!hasValidCreated || (Date.now() - parsed.created > ttlMs));
              if (!expired) {
                cachedSessionId = parsed.id;
                return cachedSessionId;
              }
            }
          } catch (e) {
            // * Invalid JSON: migrate legacy plain-string ID to { id, created } format
            if (typeof raw === 'string' && raw.trim().length > 0) {
              cachedSessionId = raw.trim();
              try {
                localStorage.setItem(key, JSON.stringify({ id: cachedSessionId, created: Date.now() }));
              } catch (e2) {}
              return cachedSessionId;
            }
          }
        }
        cachedSessionId = generateId();
        // * Race fix: re-read before writing; if another tab wrote in the meantime, use that ID instead
        var rawAgain = localStorage.getItem(key);
        if (rawAgain) {
          try {
            var parsedAgain = JSON.parse(rawAgain);
            if (parsedAgain && typeof parsedAgain.id === 'string') {
              var hasValidCreatedAgain = typeof parsedAgain.created === 'number';
              var expiredAgain = ttlMs > 0 && (!hasValidCreatedAgain || (Date.now() - parsedAgain.created > ttlMs));
              if (!expiredAgain) {
                cachedSessionId = parsedAgain.id;
                return cachedSessionId;
              }
            }
          } catch (e2) {
            if (typeof rawAgain === 'string' && rawAgain.trim().length > 0) {
              cachedSessionId = rawAgain.trim();
              return cachedSessionId;
            }
          }
        }
        // * Final re-read immediately before write to avoid overwriting a fresher ID from another tab
        var rawBeforeWrite = localStorage.getItem(key);
        if (rawBeforeWrite) {
          try {
            var parsedBefore = JSON.parse(rawBeforeWrite);
            if (parsedBefore && typeof parsedBefore.id === 'string') {
              var hasValidCreatedBefore = typeof parsedBefore.created === 'number';
              var expBefore = ttlMs > 0 && (!hasValidCreatedBefore || (Date.now() - parsedBefore.created > ttlMs));
              if (!expBefore) {
                cachedSessionId = parsedBefore.id;
                return cachedSessionId;
              }
            }
          } catch (e3) {
            if (typeof rawBeforeWrite === 'string' && rawBeforeWrite.trim().length > 0) {
              cachedSessionId = rawBeforeWrite.trim();
              return cachedSessionId;
            }
          }
        }
        // * Best-effort only: another tab could write between here and setItem; without locks perfect sync is not achievable
        localStorage.setItem(key, JSON.stringify({ id: cachedSessionId, created: Date.now() }));
      } catch (e) {
        cachedSessionId = generateId();
      }
      return cachedSessionId;
    }

    // * data-storage="session": session storage (ephemeral, per-tab)
    try {
      cachedSessionId = sessionStorage.getItem(key);
      if (!cachedSessionId && legacyKey) {
        cachedSessionId = sessionStorage.getItem(legacyKey);
        if (cachedSessionId) {
          sessionStorage.setItem(key, cachedSessionId);
          sessionStorage.removeItem(legacyKey);
        }
      }
    } catch (e) {
      // * Access denied or unavailable - ignore
    }

    if (!cachedSessionId) {
      cachedSessionId = generateId();
      try {
        sessionStorage.setItem(key, cachedSessionId);
      } catch (e) {
        // * Storage full or unavailable - ignore, will use memory cache
      }
    }
    return cachedSessionId;
  }

  // * Refresh dedup: skip pageview if the same path was tracked within 5 seconds
  // * Prevents inflated pageview counts from F5/refresh while allowing genuine revisits
  var REFRESH_DEDUP_WINDOW = 5000;
  var DEDUP_STORAGE_KEY = 'ciphera_last_pv';

  function isDuplicatePageview(path) {
    try {
      var raw = sessionStorage.getItem(DEDUP_STORAGE_KEY);
      if (raw) {
        var last = JSON.parse(raw);
        if (last.p === path && Date.now() - last.t < REFRESH_DEDUP_WINDOW) {
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  function recordPageview(path) {
    try {
      sessionStorage.setItem(DEDUP_STORAGE_KEY, JSON.stringify({ p: path, t: Date.now() }));
    } catch (e) {}
  }

  // * Track pageview
  function trackPageview() {
    var routeChangeTime = performance.now();
    var isSpaNav = !!currentEventId;

    const path = window.location.pathname + window.location.search;

    // * Skip if same path was just tracked (refresh dedup)
    if (isDuplicatePageview(path)) {
      return;
    }

    if (currentEventId) {
        // * SPA nav: visibilitychange may not fire, so send previous page's metrics now
        sendMetrics();
    }

    metrics = { lcp: 0, cls: 0, inp: 0 };
    lcpObserved = false;
    clsObserved = false;
    currentEventId = null;
    // * Strip self-referrals: don't send referrer if it matches the current site domain
    var rawReferrer = document.referrer || '';
    var referrer = '';
    if (rawReferrer) {
      try {
        var refHost = new URL(rawReferrer).hostname.replace(/^www\./, '');
        var siteHost = domain.replace(/^www\./, '');
        if (refHost !== siteHost) referrer = rawReferrer;
      } catch (e) {
        referrer = rawReferrer;
      }
    }
    const screen = {
      width: window.innerWidth || screen.width,
      height: window.innerHeight || screen.height,
    };

    const payload = {
      domain: domain,
      path: path,
      referrer: referrer,
      screen: screen,
      session_id: getSessionId(),
    };

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
      recordPageview(path);
      if (data && data.id) {
        currentEventId = data.id;
        // * For SPA navigations the browser never emits a new largest-contentful-paint
        // * (LCP is only for full document loads). After the new view has had time to
        // * paint, we record time-from-route-change as an LCP proxy so /products etc.
        // * get a value. If the user navigates away before the delay, we leave LCP unset.
        if (isSpaNav) {
          var thatId = data.id;
          // * Run soon so we set lcpObserved before the user leaves; 500ms was too long
          // * and we often sent metrics (next nav or visibilitychange+150ms) before it ran.
          setTimeout(function() {
            if (!lcpObserved && currentEventId === thatId) {
              metrics.lcp = Math.round(performance.now() - routeChangeTime);
              lcpObserved = true;
            }
          }, 100);
        }
      }
    }).catch(() => {
      // * Silently fail - don't interrupt user experience
    });
  }

  // * Track initial pageview
  trackPageview();

  // * Track SPA navigation: MutationObserver (DOM updates) and history.pushState/replaceState
  // * (some SPAs change the URL without a DOM mutation we observe)
  let lastUrl = location.href;
  function onUrlChange() {
    var url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      trackPageview();
      // * Check for 404 after SPA navigation (deferred so title updates first)
      setTimeout(check404, 100);
      // * Reset scroll depth tracking for the new page
      if (trackScroll) scrollFired = {};
    }
  }
  new MutationObserver(onUrlChange).observe(document, { subtree: true, childList: true });
  var _push = history.pushState;
  var _replace = history.replaceState;
  history.pushState = function() { _push.apply(this, arguments); onUrlChange(); };
  history.replaceState = function() { _replace.apply(this, arguments); onUrlChange(); };

  // * Track popstate (browser back/forward)
  window.addEventListener('popstate', function() {
    trackPageview();
    setTimeout(check404, 100);
    if (trackScroll) scrollFired = {};
  });

  // * Custom events / goals: validate event name (letters, numbers, underscores only; max 64 chars)
  var EVENT_NAME_MAX = 64;
  var EVENT_NAME_REGEX = /^[a-zA-Z0-9_]+$/;

  function trackCustomEvent(eventName, props) {
    if (typeof eventName !== 'string' || !eventName.trim()) return;
    var name = eventName.trim().toLowerCase();
    if (name.length > EVENT_NAME_MAX || !EVENT_NAME_REGEX.test(name)) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('Pulse: event name must contain only letters, numbers, and underscores (max ' + EVENT_NAME_MAX + ' chars).');
      }
      return;
    }
    var path = window.location.pathname + window.location.search;
    var referrer = document.referrer || '';
    var screenSize = { width: window.innerWidth || 0, height: window.innerHeight || 0 };
    var payload = {
      domain: domain,
      path: path,
      referrer: referrer,
      screen: screenSize,
      session_id: getSessionId(),
      name: name,
    };
    // * Attach custom properties if provided (max 30 props, key max 200 chars, value max 2000 chars)
    if (props && typeof props === 'object' && !Array.isArray(props)) {
      var sanitized = {};
      var count = 0;
      for (var key in props) {
        if (!props.hasOwnProperty(key)) continue;
        if (count >= 30) break;
        var k = String(key).substring(0, 200);
        var v = String(props[key]).substring(0, 2000);
        sanitized[k] = v;
        count++;
      }
      if (count > 0) payload.props = sanitized;
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

  // * Auto-track 404 error pages (on by default)
  // * Detects pages where document.title contains "404" or "not found"
  // * Opt-out: add data-no-404 to the script tag
  var track404 = !script.hasAttribute('data-no-404');
  var sent404ForUrl = '';

  function check404() {
    if (!track404) return;
    // * Only fire once per URL
    var currentUrl = location.href;
    if (sent404ForUrl === currentUrl) return;
    if (/404|not found/i.test(document.title)) {
      sent404ForUrl = currentUrl;
      trackCustomEvent('404');
    }
  }

  // * Check on initial load (deferred so SPAs can set title)
  setTimeout(check404, 0);

  // * Auto-track scroll depth at 25%, 50%, 75%, and 100% (on by default)
  // * Each threshold fires once per pageview; resets on SPA navigation
  // * Opt-out: add data-no-scroll to the script tag
  var trackScroll = !script.hasAttribute('data-no-scroll');

  if (trackScroll) {
    var scrollThresholds = [25, 50, 75, 100];
    var scrollFired = {};
    var scrollTicking = false;

    function checkScroll() {
      var docHeight = document.documentElement.scrollHeight;
      var viewHeight = window.innerHeight;
      // * Page fits in viewport — nothing to scroll
      if (docHeight <= viewHeight) return;
      var scrollTop = window.scrollY;
      var scrollPercent = Math.round((scrollTop + viewHeight) / docHeight * 100);

      for (var i = 0; i < scrollThresholds.length; i++) {
        var t = scrollThresholds[i];
        if (!scrollFired[t] && scrollPercent >= t) {
          scrollFired[t] = true;
          trackCustomEvent('scroll_' + t);
        }
      }
      scrollTicking = false;
    }

    window.addEventListener('scroll', function() {
      if (!scrollTicking) {
        scrollTicking = true;
        requestAnimationFrame(checkScroll);
      }
    }, { passive: true });
  }

  // * Strip HTML tags from a string (used for sanitizing attribute values)
  function stripHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/<[^>]*>/g, '').trim();
  }

  // * Build a compact element identifier string for frustration tracking
  // * Format: tag#id.class1.class2[href="/path"]
  function getElementIdentifier(el) {
    if (!el || !el.tagName) return '';
    var result = el.tagName.toLowerCase();

    // * Add #id if present
    if (el.id) {
      result += '#' + stripHtml(el.id);
    }

    // * Add classes (handle SVG elements where className is SVGAnimatedString)
    var rawClassName = el.className;
    if (rawClassName && typeof rawClassName !== 'string' && rawClassName.baseVal !== undefined) {
      rawClassName = rawClassName.baseVal;
    }
    if (typeof rawClassName === 'string' && rawClassName.trim()) {
      var classes = rawClassName.trim().split(/\s+/);
      var filtered = [];
      for (var ci = 0; ci < classes.length && filtered.length < 5; ci++) {
        var cls = classes[ci];
        if (cls.length > 50) continue;
        if (/^(ng-|js-|is-|has-|animate)/.test(cls)) continue;
        filtered.push(cls);
      }
      if (filtered.length > 0) {
        result += '.' + filtered.join('.');
      }
    }

    // * Add key attributes
    var attrs = ['href', 'role', 'type', 'name', 'data-action'];
    for (var ai = 0; ai < attrs.length; ai++) {
      var attrName = attrs[ai];
      var attrVal = el.getAttribute(attrName);
      if (attrVal !== null && attrVal !== '') {
        var sanitized = stripHtml(attrVal);
        if (sanitized.length > 50) sanitized = sanitized.substring(0, 50);
        result += '[' + attrName + '="' + sanitized + '"]';
      }
    }

    // * Truncate to max 200 chars
    if (result.length > 200) {
      result = result.substring(0, 200);
    }

    return result;
  }

  // * Auto-track rage clicks (rapid repeated clicks on the same element)
  // * Fires rage_click when same element is clicked 3+ times within 800ms
  // * Opt-out: add data-no-rage to the script tag
  if (!script.hasAttribute('data-no-rage')) {
    var rageClickHistory = {};  // * selector -> { times: [timestamps], lastFired: 0 }
    var RAGE_CLICK_THRESHOLD = 3;
    var RAGE_CLICK_WINDOW = 800;
    var RAGE_CLICK_DEBOUNCE = 5000;
    var RAGE_CLEANUP_INTERVAL = 10000;

    // * Cleanup stale rage click entries every 10 seconds
    setInterval(function() {
      var now = Date.now();
      for (var key in rageClickHistory) {
        if (!rageClickHistory.hasOwnProperty(key)) continue;
        var entry = rageClickHistory[key];
        // * Remove if last click was more than 10 seconds ago
        if (entry.times.length === 0 || now - entry.times[entry.times.length - 1] > RAGE_CLEANUP_INTERVAL) {
          delete rageClickHistory[key];
        }
      }
    }, RAGE_CLEANUP_INTERVAL);

    document.addEventListener('click', function(e) {
      var el = e.target;
      if (!el || !el.tagName) return;

      var selector = getElementIdentifier(el);
      if (!selector) return;

      var now = Date.now();
      var currentPath = window.location.pathname + window.location.search;

      if (!rageClickHistory[selector]) {
        rageClickHistory[selector] = { times: [], lastFired: 0 };
      }

      var entry = rageClickHistory[selector];

      // * Add current click timestamp
      entry.times.push(now);

      // * Remove clicks outside the time window
      while (entry.times.length > 0 && now - entry.times[0] > RAGE_CLICK_WINDOW) {
        entry.times.shift();
      }

      // * Check if rage click threshold is met
      if (entry.times.length >= RAGE_CLICK_THRESHOLD) {
        // * Debounce: max one rage_click per element per 5 seconds
        if (now - entry.lastFired >= RAGE_CLICK_DEBOUNCE) {
          var clickCount = entry.times.length;
          trackCustomEvent('rage_click', {
            selector: selector,
            click_count: String(clickCount),
            page_path: currentPath,
            x: String(Math.round(e.clientX)),
            y: String(Math.round(e.clientY))
          });
          entry.lastFired = now;
        }
        // * Reset tracker after firing or debounce skip
        entry.times = [];
      }
    }, true); // * Capture phase
  }

  // * Auto-track dead clicks (clicks on interactive elements that produce no effect)
  // * Fires dead_click when an interactive element is clicked but no DOM change, navigation,
  // * or network request occurs within 1 second
  // * Opt-out: add data-no-dead to the script tag
  if (!script.hasAttribute('data-no-dead')) {
    var INTERACTIVE_SELECTOR = 'a,button,input,select,textarea,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[onclick],[tabindex]';
    var DEAD_CLICK_DEBOUNCE = 10000;
    var DEAD_CLEANUP_INTERVAL = 30000;
    var deadClickDebounce = {}; // * selector -> lastFiredTimestamp

    // * Cleanup stale dead click debounce entries every 30 seconds
    setInterval(function() {
      var now = Date.now();
      for (var key in deadClickDebounce) {
        if (!deadClickDebounce.hasOwnProperty(key)) continue;
        if (now - deadClickDebounce[key] > DEAD_CLEANUP_INTERVAL) {
          delete deadClickDebounce[key];
        }
      }
    }, DEAD_CLEANUP_INTERVAL);

    // * Polyfill check for Element.matches
    var matchesFn = (function() {
      var ep = Element.prototype;
      return ep.matches || ep.msMatchesSelector || ep.webkitMatchesSelector || null;
    })();

    // * Find the nearest interactive element by walking up max 3 levels
    function findInteractiveElement(el) {
      if (!matchesFn) return null;
      var depth = 0;
      var current = el;
      while (current && depth <= 3) {
        if (current.nodeType === 1 && matchesFn.call(current, INTERACTIVE_SELECTOR)) {
          return current;
        }
        current = current.parentElement;
        depth++;
      }
      return null;
    }

    document.addEventListener('click', function(e) {
      var target = findInteractiveElement(e.target);
      if (!target) return;

      var selector = getElementIdentifier(target);
      if (!selector) return;

      var now = Date.now();

      // * Debounce: max one dead_click per element per 10 seconds
      if (deadClickDebounce[selector] && now - deadClickDebounce[selector] < DEAD_CLICK_DEBOUNCE) {
        return;
      }

      var currentPath = window.location.pathname + window.location.search;
      var clickX = String(Math.round(e.clientX));
      var clickY = String(Math.round(e.clientY));
      var effectDetected = false;
      var hrefBefore = location.href;
      var mutationObs = null;
      var perfObs = null;
      var cleanupTimer = null;

      function cleanup() {
        if (mutationObs) { try { mutationObs.disconnect(); } catch (ex) {} mutationObs = null; }
        if (perfObs) { try { perfObs.disconnect(); } catch (ex) {} perfObs = null; }
        if (cleanupTimer) { clearTimeout(cleanupTimer); cleanupTimer = null; }
      }

      function onEffect() {
        effectDetected = true;
        cleanup();
      }

      // * Set up MutationObserver to detect DOM changes on the element and its parent
      if (typeof MutationObserver !== 'undefined') {
        try {
          mutationObs = new MutationObserver(function() {
            onEffect();
          });
          var mutOpts = { childList: true, attributes: true, characterData: true, subtree: true };
          mutationObs.observe(target, mutOpts);
          var parent = target.parentElement;
          if (parent && parent.tagName !== 'HTML' && parent.tagName !== 'BODY') {
            mutationObs.observe(parent, { childList: true });
          }
        } catch (ex) {
          mutationObs = null;
        }
      }

      // * Set up PerformanceObserver to detect network requests
      if (typeof PerformanceObserver !== 'undefined') {
        try {
          perfObs = new PerformanceObserver(function() {
            onEffect();
          });
          perfObs.observe({ type: 'resource' });
        } catch (ex) {
          perfObs = null;
        }
      }

      // * After 1 second, check if any effect was detected
      cleanupTimer = setTimeout(function() {
        cleanup();
        // * Also check if navigation occurred
        if (effectDetected || location.href !== hrefBefore) return;

        deadClickDebounce[selector] = Date.now();
        trackCustomEvent('dead_click', {
          selector: selector,
          page_path: currentPath,
          x: clickX,
          y: clickY
        });
      }, 1000);
    }, true); // * Capture phase
  }

  // * Auto-track outbound link clicks and file downloads (on by default)
  // * Opt-out: add data-no-outbound or data-no-downloads to the script tag
  var trackOutbound = !script.hasAttribute('data-no-outbound');
  var trackDownloads = !script.hasAttribute('data-no-downloads');

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
          trackCustomEvent('file_download');
          return;
        }

        // * Check outbound link (different hostname)
        if (trackOutbound && url.hostname && url.hostname !== location.hostname) {
          trackCustomEvent('outbound_link');
        }
      } catch (err) {
        // * Invalid URL - skip silently
      }
    }, true); // * Capture phase: fires before default navigation
  }

})();
