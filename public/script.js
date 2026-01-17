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
  
  // * Memory cache for session ID (fallback if sessionStorage is unavailable)
  let cachedSessionId = null;

  // * Generate ephemeral session ID (not persistent)
  function getSessionId() {
    if (cachedSessionId) {
      return cachedSessionId;
    }

    // * Use a static key for session storage to ensure consistency across pages
    // * We don't use the domain in the key to avoid issues with subdomains/casing
    const key = 'ciphera_session_id';
    
    try {
      cachedSessionId = sessionStorage.getItem(key);
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
