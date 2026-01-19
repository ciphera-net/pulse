/**
 * Pulse - Privacy-First Tracking Script
 * Lightweight, no cookies, GDPR compliant
 * Includes optional session replay with privacy controls
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
  let performanceInsightsEnabled = false;

  // * Session Replay State
  let replayEnabled = false;
  let replayMode = 'disabled';
  let replayId = null;
  let replaySettings = null;
  let rrwebStopFn = null;
  let replayEvents = [];
  let chunkInterval = null;
  const CHUNK_SIZE = 50;
  const CHUNK_INTERVAL_MS = 10000;

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
    // * Only send metrics if performance insights are enabled
    if (!performanceInsightsEnabled || !currentEventId || (metrics.lcp === 0 && metrics.cls === 0 && metrics.inp === 0)) return;

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

  // * Start observing metrics immediately (buffered observers will capture early metrics)
  // * Metrics will only be sent if performance insights are enabled (checked in sendMetrics)
  observeMetrics();

  // * Send metrics when user leaves or hides the page
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      sendMetrics();
      // Also flush replay data
      if (replayEnabled) {
        sendReplayChunk();
        endReplaySession();
      }
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

  // ==========================================
  // * SESSION REPLAY FUNCTIONALITY
  // ==========================================

  // * Fetch replay settings from API
  async function fetchReplaySettings() {
    try {
      const res = await fetch(apiUrl + '/api/v1/replay-settings/' + encodeURIComponent(domain));
      if (res.ok) {
        replaySettings = await res.json();
        replayMode = replaySettings.replay_mode;
        
        // * Set performance insights enabled flag
        performanceInsightsEnabled = replaySettings.enable_performance_insights === true;

        // Check sampling rate
        if (replayMode !== 'disabled') {
          const shouldRecord = Math.random() * 100 < replaySettings.replay_sampling_rate;
          if (!shouldRecord) {
            replayMode = 'disabled';
            return;
          }
        }

        // Auto-start for anonymous_skeleton mode (no consent needed)
        if (replayMode === 'anonymous_skeleton') {
          startReplay(true);
        }
      }
    } catch (e) {
      // Silent fail - replay not critical
    }
  }

  // * Initialize replay session on server
  async function initReplaySession(isSkeletonMode) {
    try {
      const res = await fetch(apiUrl + '/api/v1/replays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domain,
          session_id: getSessionId(),
          entry_page: window.location.pathname,
          is_skeleton_mode: isSkeletonMode,
          consent_given: !isSkeletonMode,
          device_type: detectDeviceType(),
          browser: detectBrowser(),
          os: detectOS()
        })
      });

      if (res.ok) {
        const data = await res.json();
        replayId = data.id;
        return true;
      }
    } catch (e) {
      // Silent fail
    }
    return false;
  }

  // * Load rrweb library dynamically
  function loadRrweb() {
    return new Promise((resolve, reject) => {
      if (typeof window.rrweb !== 'undefined') {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/rrweb@2.0.0-alpha.11/dist/rrweb.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // * Start recording session
  async function startReplay(isSkeletonMode) {
    if (replayEnabled) return;

    // Load rrweb if not already loaded
    try {
      await loadRrweb();
    } catch (e) {
      console.warn('[Ciphera] Failed to load rrweb library');
      return;
    }

    if (typeof window.rrweb === 'undefined') return;

    // Initialize session on server first
    const initialized = await initReplaySession(isSkeletonMode);
    if (!initialized) return;

    replayEnabled = true;

    // Configure masking based on mode and settings
    const maskConfig = {
      // Always mask sensitive inputs
      maskInputOptions: {
        password: true,
        email: true,
        tel: true,
        // In skeleton mode, mask all text inputs
        text: isSkeletonMode,
        textarea: isSkeletonMode,
        select: isSkeletonMode
      },
      // Mask all text in skeleton mode
      maskAllText: isSkeletonMode || (replaySettings && replaySettings.replay_mask_all_text),
      // Mask all inputs by default (can be overridden in settings)
      maskAllInputs: replaySettings ? replaySettings.replay_mask_all_inputs : true,
      // Custom classes for masking
      maskTextClass: 'ciphera-mask',
      blockClass: 'ciphera-block',
      // Mask elements with data-ciphera-mask attribute
      maskTextSelector: '[data-ciphera-mask]',
      // Block elements with data-ciphera-block attribute
      blockSelector: '[data-ciphera-block]',
      // Custom input masking function for credit cards
      maskInputFn: (text, element) => {
        // Mask credit card patterns
        if (/^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/.test(text)) {
          return '****-****-****-****';
        }
        // Mask email patterns
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
          return '***@***.***';
        }
        return text;
      }
    };

    try {
      rrwebStopFn = window.rrweb.record({
        emit(event) {
          replayEvents.push(event);

          // Send chunk when threshold reached
          if (replayEvents.length >= CHUNK_SIZE) {
            sendReplayChunk();
          }
        },
        ...maskConfig,
        // Privacy: Don't record external resources
        recordCanvas: false,
        collectFonts: false,
        // Sampling for mouse movement (reduce data)
        sampling: {
          mousemove: true,
          mouseInteraction: true,
          scroll: 150,
          input: 'last'
        },
        // Inline styles for replay accuracy
        inlineStylesheet: true,
        // Slim snapshot to reduce size
        slimDOMOptions: {
          script: true,
          comment: true,
          headFavicon: true,
          headWhitespace: true,
          headMetaDescKeywords: true,
          headMetaSocial: true,
          headMetaRobots: true,
          headMetaHttpEquiv: true,
          headMetaAuthorship: true,
          headMetaVerification: true
        }
      });

      // Set up periodic chunk sending
      chunkInterval = setInterval(sendReplayChunk, CHUNK_INTERVAL_MS);
    } catch (e) {
      replayEnabled = false;
      replayId = null;
    }
  }

  // * Redact common PII-like URL query/fragment parameters in replay JSON before sending
  function redactPiiInReplayJson(jsonStr) {
    return jsonStr.replace(
      /([?&])(email|token|session|auth|password|secret|api_key|apikey|access_token|refresh_token)=[^&"'\s]*/gi,
      '$1$2=***'
    );
  }

  // * Send chunk of events to server
  async function sendReplayChunk() {
    if (!replayId || replayEvents.length === 0) return;

    const chunk = replayEvents.splice(0, CHUNK_SIZE);
    const eventsCount = chunk.length;
    let data = JSON.stringify(chunk);
    data = redactPiiInReplayJson(data);

    try {
      // Try to compress if available
      let body;
      let headers = { 'X-Events-Count': eventsCount.toString() };

      if (typeof CompressionStream !== 'undefined') {
        const blob = new Blob([data]);
        const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
        body = await new Response(stream).blob();
        headers['Content-Encoding'] = 'gzip';
        headers['Content-Type'] = 'application/octet-stream';
      } else {
        body = new Blob([data], { type: 'application/json' });
        headers['Content-Type'] = 'application/json';
      }

      await fetch(apiUrl + '/api/v1/replays/' + replayId + '/chunks', {
        method: 'POST',
        headers: headers,
        body: body,
        keepalive: true
      });
    } catch (e) {
      // Re-queue events on failure
      replayEvents.unshift(...chunk);
    }
  }

  // * End replay session
  function endReplaySession() {
    if (!replayEnabled || !replayId) return;

    // Clear interval
    if (chunkInterval) {
      clearInterval(chunkInterval);
      chunkInterval = null;
    }

    // Stop recording
    if (rrwebStopFn) {
      rrwebStopFn();
      rrwebStopFn = null;
    }

    // Send remaining events
    if (replayEvents.length > 0) {
      const chunk = replayEvents.splice(0);
      let data = JSON.stringify(chunk);
      data = redactPiiInReplayJson(data);
      navigator.sendBeacon(
        apiUrl + '/api/v1/replays/' + replayId + '/chunks',
        new Blob([data], { type: 'application/json' })
      );
    }

    // Mark session as ended
    navigator.sendBeacon(apiUrl + '/api/v1/replays/' + replayId + '/end');

    replayEnabled = false;
    replayId = null;
  }

  // * Device detection helpers
  function detectDeviceType() {
    const ua = navigator.userAgent.toLowerCase();
    if (/mobile|android|iphone|ipod/.test(ua)) return 'mobile';
    if (/tablet|ipad/.test(ua)) return 'tablet';
    return 'desktop';
  }

  function detectBrowser() {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('chrome') && !ua.includes('edg')) return 'Chrome';
    if (ua.includes('firefox')) return 'Firefox';
    if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
    if (ua.includes('edg')) return 'Edge';
    if (ua.includes('opera')) return 'Opera';
    return null;
  }

  function detectOS() {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('windows')) return 'Windows';
    if (ua.includes('mac os') || ua.includes('macos')) return 'macOS';
    if (ua.includes('linux')) return 'Linux';
    if (ua.includes('android')) return 'Android';
    if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
    return null;
  }

  // * Public API for replay control
  window.ciphera = window.ciphera || function(cmd) {
    if (cmd === 'disableReplay') {
      endReplaySession();
    } else if (cmd === 'getReplayMode') {
      return replayMode;
    } else if (cmd === 'isReplayEnabled') {
      return replayEnabled;
    }
  };

  // * Track initial pageview
  trackPageview();

  // * Fetch replay settings (async, doesn't block pageview)
  fetchReplaySettings();

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

  // * Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (replayEnabled) {
      sendReplayChunk();
      endReplaySession();
    }
  });
})();
