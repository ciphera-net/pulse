/**
 * Pulse - Content Interaction Tracking
 * Auto-tracks copy, print, and video engagement events.
 * Opt-out: data-no-copy, data-no-print, data-no-video on the script tag.
 */

(function() {
  'use strict';

  var pulse, trackCustomEvent, cleanPath;
  var retries = 0;
  var interval = setInterval(function() {
    pulse = window.pulse;
    if (pulse && typeof pulse.track === 'function') {
      clearInterval(interval);
      trackCustomEvent = pulse.track;
      cleanPath = pulse.cleanPath;
      init();
    }
    if (++retries > 100) clearInterval(interval);
  }, 50);

  function init() {
    var script = document.currentScript
      || document.querySelector('script[src*="script.interactions"]');
    var globalConfig = window.pulseConfig || {};

    function hasAttr(name) {
      var camel = name.replace(/-([a-z])/g, function(_, c) { return c.toUpperCase(); });
      return (script && script.hasAttribute('data-' + name))
        || globalConfig[name] === true || globalConfig[camel] === true;
    }

    var trackCopy = !hasAttr('no-copy');
    var trackPrint = !hasAttr('no-print');
    var trackVideo = !hasAttr('no-video');

    var copiedThisPage = false;
    var printedThisPage = false;

    // * Reset per-page flags on SPA navigation
    var lastHref = location.href;
    function onNavChange() {
      if (location.href !== lastHref) {
        lastHref = location.href;
        copiedThisPage = false;
        printedThisPage = false;
      }
    }

    var _push = history.pushState;
    var _replace = history.replaceState;
    history.pushState = function() { _push.apply(this, arguments); onNavChange(); };
    history.replaceState = function() { _replace.apply(this, arguments); onNavChange(); };
    window.addEventListener('popstate', onNavChange);

    // * Content copy — fires once per page to avoid spam
    if (trackCopy) {
      document.addEventListener('copy', function() {
        if (copiedThisPage) return;
        copiedThisPage = true;
        trackCustomEvent('content_copy', { page_path: cleanPath() });
      });
    }

    // * Content print — fires once per page
    if (trackPrint) {
      window.addEventListener('beforeprint', function() {
        if (printedThisPage) return;
        printedThisPage = true;
        trackCustomEvent('content_print', { page_path: cleanPath() });
      });
    }

    // * Video engagement — play, pause, complete
    if (trackVideo) {
      var attachedVideos = typeof WeakSet !== 'undefined' ? new WeakSet() : null;

      function getVideoMeta(video) {
        return {
          page_path: cleanPath(),
          video_src: (video.currentSrc || video.src || '').slice(0, 200),
          video_title: (video.title || video.getAttribute('aria-label') || '').slice(0, 200)
        };
      }

      function attachVideoListeners(video) {
        if (attachedVideos) {
          if (attachedVideos.has(video)) return;
          attachedVideos.add(video);
        }

        video.addEventListener('play', function() {
          trackCustomEvent('video_play', getVideoMeta(video));
        });

        video.addEventListener('pause', function() {
          if (video.ended) return;
          var meta = getVideoMeta(video);
          var dur = video.duration;
          if (dur && isFinite(dur) && dur > 0) {
            meta.video_progress = String(Math.round((video.currentTime / dur) * 100));
          }
          trackCustomEvent('video_pause', meta);
        });

        video.addEventListener('ended', function() {
          trackCustomEvent('video_complete', getVideoMeta(video));
        });
      }

      // * Attach to videos already in DOM
      var existing = document.querySelectorAll('video');
      for (var i = 0; i < existing.length; i++) attachVideoListeners(existing[i]);

      // * Watch for dynamically added videos (React, Vue, SPA)
      if (typeof MutationObserver !== 'undefined') {
        new MutationObserver(function(mutations) {
          for (var m = 0; m < mutations.length; m++) {
            var added = mutations[m].addedNodes;
            for (var n = 0; n < added.length; n++) {
              var node = added[n];
              if (node.nodeType !== 1) continue;
              if (node.tagName === 'VIDEO') attachVideoListeners(node);
              if (node.querySelectorAll) {
                var vids = node.querySelectorAll('video');
                for (var v = 0; v < vids.length; v++) attachVideoListeners(vids[v]);
              }
            }
          }
        }).observe(document.body || document.documentElement, {
          childList: true,
          subtree: true
        });
      }
    }
  }
})();
