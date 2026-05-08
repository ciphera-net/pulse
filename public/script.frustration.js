/**
 * Pulse Frustration Tracking Add-on
 * Detects rage clicks and dead clicks. Requires the core Pulse script.
 * Opt-out: add data-no-rage or data-no-dead to either script tag.
 */
(function() {
  'use strict';

  // * Capture own script tag for opt-out attributes (must be at parse time)
  // * Fallback to querySelector for dynamic insertion (e.g. tag managers) where currentScript is null
  var addonScript = document.currentScript || document.querySelector('script[src*="script.frustration"]');

  var MAX_WAIT = 5000;
  var POLL_INTERVAL = 50;
  var waited = 0;

  function init() {
    var pulse = window.pulse;
    if (!pulse || typeof pulse.track !== 'function' || typeof pulse.cleanPath !== 'function') {
      waited += POLL_INTERVAL;
      if (waited < MAX_WAIT) {
        setTimeout(init, POLL_INTERVAL);
      } else {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('Pulse frustration add-on: core script not detected. Frustration tracking disabled.');
        }
      }
      return;
    }

    var trackCustomEvent = pulse.track;
    var cleanPath = pulse.cleanPath;

    // * Check opt-out attributes on both the add-on script tag and the core script tag
    var coreScript = document.querySelector('script[data-domain]');

    function hasOptOut(attr) {
      return (addonScript && addonScript.hasAttribute(attr)) ||
             (coreScript && coreScript.hasAttribute(attr));
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
    if (!hasOptOut('data-no-rage')) {
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
        var currentPath = cleanPath();

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
          // * Skip if user is selecting text (triple-click to select paragraph)
          try {
            var sel = window.getSelection();
            if (sel && sel.toString().trim().length > 0) {
              entry.times = [];
              return;
            }
          } catch (ex) {}

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
    if (!hasOptOut('data-no-dead')) {
      var INTERACTIVE_SELECTOR = 'a,button,input,select,textarea,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[onclick],[tabindex]:not([tabindex="-1"])';
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

        // * Skip form inputs — clicking to focus/interact is expected, not a dead click
        var tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        var selector = getElementIdentifier(target);
        if (!selector) return;

        var now = Date.now();

        // * Debounce: max one dead_click per element per 10 seconds
        if (deadClickDebounce[selector] && now - deadClickDebounce[selector] < DEAD_CLICK_DEBOUNCE) {
          return;
        }

        var currentPath = cleanPath();
        var clickX = String(Math.round(e.clientX));
        var clickY = String(Math.round(e.clientY));
        var effectDetected = false;
        var hrefBefore = location.href;
        var mutationObs = null;
        var perfObs = null;
        var cleanupTimer = null;
        var popstateHandler = null;
        var hashchangeHandler = null;

        function cleanup() {
          if (mutationObs) { try { mutationObs.disconnect(); } catch (ex) {} mutationObs = null; }
          if (perfObs) { try { perfObs.disconnect(); } catch (ex) {} perfObs = null; }
          if (cleanupTimer) { clearTimeout(cleanupTimer); cleanupTimer = null; }
          if (popstateHandler) { window.removeEventListener('popstate', popstateHandler); popstateHandler = null; }
          if (hashchangeHandler) { window.removeEventListener('hashchange', hashchangeHandler); hashchangeHandler = null; }
        }

        function onEffect() {
          effectDetected = true;
          cleanup();
        }

        // * Set up MutationObserver to detect DOM changes on the element, its parent, and body
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
            // * Also observe body for top-level DOM changes (modals, drawers, overlays, toasts)
            mutationObs.observe(document.body, { childList: true, attributes: true });
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

        // * Listen for SPA navigation events (popstate, hashchange)
        popstateHandler = function() { onEffect(); };
        hashchangeHandler = function() { onEffect(); };
        window.addEventListener('popstate', popstateHandler);
        window.addEventListener('hashchange', hashchangeHandler);

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
  }

  // * Start immediately — if core is already loaded, init succeeds on the first call
  init();
})();
