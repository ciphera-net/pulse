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

  // * Skip headless browsers and automated tools (Puppeteer, Playwright, Selenium)
  if (navigator.webdriver) {
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

  let currentEventId = null;

  // * Time-on-page tracking: records when the current pageview started
  var pageStartTime = 0;

  var metricsSent = false;

  function sendMetrics() {
    if (!currentEventId || metricsSent) return;

    // * Calculate time-on-page in seconds
    var durationSec = pageStartTime > 0 ? Math.round((Date.now() - pageStartTime) / 1000) : 0;

    // * Skip if nothing to send (no duration)
    if (durationSec <= 0) return;

    metricsSent = true;

    var data = JSON.stringify({ event_id: currentEventId, duration: durationSec });

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

  // * Send metrics when user leaves or hides the page
  // * visibilitychange is the primary signal, pagehide is the fallback
  // * for browsers/scenarios where visibilitychange doesn't fire (tab close, mobile app kill)
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') sendMetrics();
  });
  window.addEventListener('pagehide', sendMetrics);

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
    const path = cleanPath();

    // * Skip if same path was just tracked (refresh dedup)
    if (isDuplicatePageview(path)) {
      return;
    }

    if (currentEventId) {
        // * SPA nav: visibilitychange may not fire, so send previous page's metrics + duration now
        sendMetrics();
    }

    currentEventId = null;
    pageStartTime = 0;

    const screenSize = {
      width: window.innerWidth || window.screen.width,
      height: window.innerHeight || window.screen.height,
    };

    const payload = {
      domain: domain,
      url: location.href,
      title: document.title,
      referrer: document.referrer || '',
      screen: screenSize,
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
        pageStartTime = Date.now();
        metricsSent = false;
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

  // * Track SPA navigation: MutationObserver (DOM updates) and history.pushState/replaceState
  // * (some SPAs change the URL without a DOM mutation we observe)
  let lastUrl = location.href;
  function onUrlChange() {
    var url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      trackPageview();
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
    var url = location.href;
    if (url === lastUrl) return;
    lastUrl = url;
    trackPageview();
    if (trackScroll) scrollFired = {};
  });

  // * Custom events / goals
  function trackCustomEvent(eventName, props) {
    if (typeof eventName !== 'string' || !eventName.trim()) return;
    var payload = {
      domain: domain,
      url: location.href,
      title: document.title,
      referrer: document.referrer || '',
      screen: { width: window.innerWidth || window.screen.width, height: window.innerHeight || window.screen.height },
      session_id: getSessionId(),
      name: eventName.trim().toLowerCase(),
    };
    if (props && typeof props === 'object' && !Array.isArray(props)) {
      payload.props = props;
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
          trackCustomEvent('file_download', { url: url.href });
          return;
        }

        // * Check outbound link (different hostname)
        if (trackOutbound && url.hostname && url.hostname !== location.hostname) {
          trackCustomEvent('outbound_link', { url: url.href });
        }
      } catch (err) {
        // * Invalid URL - skip silently
      }
    }, true); // * Capture phase: fires before default navigation
  }

})();
