/**
 * Pulse Analytics - the note a site owner's own-visits links leave on their site (v1.8.0).
 *
 * script.js loads this ONLY when the page was opened with ?pulse-ignore=on or =off (the two links on
 * Settings → Privacy), so no visitor ever downloads it, and the core keeps its 3 KB budget.
 * It draws one line saying what the link did and removes itself after 8 seconds or a click. It
 * sends nothing and stores nothing: script.js has already written (or failed to write) the flag and
 * passes the outcome in data-note: on, off, refused or signal.
 *
 * The line sits in a shadow root, so the site's CSS can't restyle it, and is styled through the
 * CSSOM, which a strict CSP allows where it would block a style attribute or a <style> element.
 * Audit: Pulse/docs/audits/06-11-2026-exclude-own-visits.md
 */

(function() {
  'use strict';

  var tag = document.currentScript;
  var state = tag && tag.getAttribute('data-note');
  var host = location.hostname;
  var visits = ' your visits to ' + host;

  // * [what happened, whether this browser is counted now]. The dot is orange while it is counted
  // * and grey while it is not, as status dots are everywhere in Pulse's settings.
  var said = {
    on: ["Pulse won't count" + visits + ' in this browser.', false],
    off: ['Pulse counts' + visits + ' in this browser again.', true],
    refused: ["This browser didn't let Pulse save that, so" + visits + ' still count.', true],
    signal: ["This browser asks sites not to track it, so Pulse doesn't count it on " + host + '.', false]
  }[state];
  if (!said) return;

  var el = document.createElement('pulse-note');
  var box = document.createElement('div');
  var dot = document.createElement('span');
  var text = document.createElement('span');
  box.setAttribute('role', 'status');
  text.textContent = said[0];
  // * Facet's dark surface, its strong line and its sharp corners; the site's own font is unknown, so
  // * the system's.
  box.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;' +
    'box-sizing:border-box;display:flex;align-items:flex-start;gap:8px;width:max-content;max-width:calc(100% - 32px);' +
    'margin:0;padding:10px 14px;border:1px solid #242424;border-radius:0;background-color:#0f0f0f;color:#f4f4f4;' +
    'font:400 14px/20px system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:normal;text-align:left;' +
    'box-shadow:0 8px 24px rgba(0,0,0,.25);cursor:pointer';
  dot.style.cssText = 'flex:none;width:8px;height:8px;margin-top:6px;border-radius:50%;background-color:' +
    (said[1] ? '#FD5E0F' : '#8a8a8a');
  box.appendChild(dot);
  box.appendChild(text);
  el.attachShadow({ mode: 'open' }).appendChild(box);

  function remove() {
    if (el.parentNode) el.parentNode.removeChild(el);
  }
  box.addEventListener('click', remove);
  setTimeout(remove, 8000);
  (document.body || document.documentElement).appendChild(el);
})();
