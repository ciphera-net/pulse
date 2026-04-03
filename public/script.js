/**
 * Pulse - Privacy-First Tracking Script
 * Lightweight, no cookies, no localStorage, no client-side identifiers. GDPR compliant.
 * Unique visitors are identified server-side via a daily-rotating hash of IP + UA + domain.
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
    || document.querySelector('script[src*="pulse.ciphera.net/script"]');

  const globalConfig = window.pulseConfig || {};

  // * Helper: read a config value from script data-* attribute or globalConfig
  function attr(name) {
    // * Support both "storage-ttl" (data-attr style) and "storageTtl" (camelCase config style)
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
  // * Session identification is now fully server-side (daily-rotating hash of IP + UA + domain).
  // * No client-side visitor ID storage — zero localStorage, zero sessionStorage, zero cookies.

  let currentEventId = null;

  // * Time-on-page tracking: records when the current pageview started
  var pageStartTime = 0;

  var metricsSent = false;

  var visibleStart = 0;
  var visibleTotal = 0;
  var hasVisibilityAPI = typeof document.hidden !== 'undefined';

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

  function sendMetrics() {
    if (!currentEventId || metricsSent) return;

    var durationSec = pageStartTime > 0 ? Math.round((Date.now() - pageStartTime) / 1000) : 0;
    if (durationSec <= 0) return;

    // * Finalize visible duration — add time since last visibility change if still visible
    // * In WebViews (Facebook/Instagram in-app browsers) where Page Visibility API isn't
    // * available, fall back to wall-clock duration (all time treated as visible)
    if (hasVisibilityAPI) {
      if (!document.hidden) visibleTotal += Date.now() - visibleStart;
    } else {
      visibleTotal = Date.now() - pageStartTime;
    }
    var visibleSec = Math.round(visibleTotal / 1000);

    metricsSent = true;

    var payload = { event_id: currentEventId, duration: durationSec, visible_duration: visibleSec };

    // * Include scroll depth if scroll tracking is enabled and user scrolled
    if (typeof maxScrollPct !== 'undefined' && maxScrollPct > 0) {
      payload.scroll_depth = maxScrollPct;
    }

    var data = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      navigator.sendBeacon(apiUrl + '/api/v1/metrics', new Blob([data], {type: 'application/json'}));
    } else {
      fetch(apiUrl + '/api/v1/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: data,
        keepalive: true
      }).catch(function() {});
    }
  }

  // * Accumulate visible time — pause when tab is hidden, resume when visible
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      visibleTotal += Date.now() - visibleStart;
    } else {
      visibleStart = Date.now();
      humanSignals |= 4;
    }
  });

  // * Send metrics when user leaves or hides the page
  // * visibilitychange is the primary signal, pagehide is the fallback
  // * for browsers/scenarios where visibilitychange doesn't fire (tab close, mobile app kill)
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') sendMetrics();
  });
  window.addEventListener('pagehide', sendMetrics);

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
      language: navigator.language || '',
      timezone: (function() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch(e) { return ''; } })(),
      hs: humanSignals,
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
        visibleStart = Date.now();
        visibleTotal = 0;
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
      // * Flush & reset scroll depth tracking for the new page
      if (trackScroll) { maxScrollPct = 0; }
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
    if (trackScroll) { maxScrollPct = 0; }
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
