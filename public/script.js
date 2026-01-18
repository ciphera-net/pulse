/**
 * Ciphera Analytics - Privacy-First Tracking Script
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
  const apiUrl = script.getAttribute('data-api') || 'https://analytics-api.ciphera.net';
  
  // * Performance Monitoring (Core Web Vitals) State
  let currentEventId = null;
  let metrics = { lcp: 0, cls: 0, inp: 0 };

  // * Minimal Web Vitals Observer
  function observeMetrics() {
    try {
      if (typeof PerformanceObserver === 'undefined') return;

      // * LCP (Largest Contentful Paint)
      new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
            metrics.lcp = lastEntry.startTime;
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });

      // * CLS (Cumulative Layout Shift)
      new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (!entry.hadRecentInput) {
            metrics.cls += entry.value;
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
    if (!currentEventId || (metrics.lcp === 0 && metrics.cls === 0 && metrics.inp === 0)) return;

    // * Use sendBeacon if available for reliability on unload
    const data = JSON.stringify({
      event_id: currentEventId,
      lcp: metrics.lcp,
      cls: metrics.cls,
      inp: metrics.inp
    });

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

  // * Start observing immediately
  observeMetrics();

  // * Send metrics when user leaves or hides the page
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      sendMetrics();
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
    // * Reset metrics for new pageview (SPA navigation)
    // * We don't reset immediately on the first run, but for subsequent calls we should
    // * However, for the very first call, metrics are already 0. 
    // * The issue is if we reset metrics here, we might lose early captured metrics (e.g. LCP) if this runs late?
    // * No, trackPageview runs early. 
    // * BUT for SPA navigation, we want to reset.
    if (currentEventId) {
        // If we already had an event ID, it means this is a subsequent navigation
        // We should try to send metrics for the *previous* page before resetting?
        // Ideally visibilitychange handles this, but for SPA nav it might not trigger visibilitychange.
        sendMetrics();
    }
    
    metrics = { lcp: 0, cls: 0, inp: 0 };
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
      }
    }).catch(() => {
      // * Silently fail - don't interrupt user experience
    });
  }

  // * Track initial pageview
  trackPageview();

  // * Track SPA navigation (history API)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      trackPageview();
    }
  }).observe(document, { subtree: true, childList: true });

  // * Track popstate (browser back/forward)
  window.addEventListener('popstate', trackPageview);
})();
