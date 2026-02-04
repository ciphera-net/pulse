/**
 * Pulse - Privacy-First Tracking Script
 * Lightweight, no cookies, GDPR compliant
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

  // * Memory cache for session ID (fallback if sessionStorage is unavailable)
  let cachedSessionId = null;

  // * Generate ephemeral session ID (not persistent)
  function getSessionId() {
    if (cachedSessionId) {
      return cachedSessionId;
    }

    // * Use a static key for session storage to ensure consistency across pages
    const key = 'ciphera_session_id';
    // * Legacy key support for migration (strip whitespace just in case)
    const legacyKey = 'plausible_session_' + (domain ? domain.trim() : '');

    try {
      // * Try to get existing session ID
      cachedSessionId = sessionStorage.getItem(key);

      // * If not found in new key, try legacy key and migrate
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
      cachedSessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      try {
        sessionStorage.setItem(key, cachedSessionId);
      } catch (e) {
        // * Storage full or unavailable - ignore, will use memory cache
      }
    }
    return cachedSessionId;
  }

  // * Track pageview
  function trackPageview() {
    var routeChangeTime = performance.now();
    var isSpaNav = !!currentEventId;

    if (currentEventId) {
        // * SPA nav: visibilitychange may not fire, so send previous page's metrics now
        sendMetrics();
    }

    metrics = { lcp: 0, cls: 0, inp: 0 };
    lcpObserved = false;
    clsObserved = false;
    currentEventId = null;

    const path = window.location.pathname + window.location.search;
    const referrer = document.referrer || '';
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
    }
  }
  new MutationObserver(onUrlChange).observe(document, { subtree: true, childList: true });
  var _push = history.pushState;
  var _replace = history.replaceState;
  history.pushState = function() { _push.apply(this, arguments); onUrlChange(); };
  history.replaceState = function() { _replace.apply(this, arguments); onUrlChange(); };

  // * Track popstate (browser back/forward)
  window.addEventListener('popstate', trackPageview);

  // * Custom events / goals: validate event name (letters, numbers, underscores only; max 64 chars)
  var EVENT_NAME_MAX = 64;
  var EVENT_NAME_REGEX = /^[a-zA-Z0-9_]+$/;

  function trackCustomEvent(eventName) {
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
    fetch(apiUrl + '/api/v1/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(function() {});
  }

  // * Expose pulse.track() for custom events (e.g. pulse.track('signup_click'))
  window.pulse = { track: trackCustomEvent };

})();
