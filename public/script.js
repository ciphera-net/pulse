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
  
  // * Generate ephemeral session ID (not persistent)
  function getSessionId() {
    const key = 'plausible_session_' + domain;
    let sessionId = sessionStorage.getItem(key);
    if (!sessionId) {
      sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem(key, sessionId);
    }
    return sessionId;
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
