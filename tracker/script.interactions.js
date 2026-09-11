/**
 * Pulse — interaction capture (optional companion to script.js).
 *
 * Records what a visitor DID on a page: clicked a control, copied something,
 * submitted a form. Loaded with its own <script> tag, beside the core:
 *
 *   <script defer data-domain="example.com" src="https://js.ciphera.net/script.js"></script>
 *   <script defer src="https://js.ciphera.net/script.interactions.js"></script>
 *
 * 🔴 WHY A SECOND FILE AND NOT PART OF script.js. The core has an ENFORCED 3 KB
 * gzip budget (scripts/build-scripts.mjs), which is also a published claim —
 * ciphera.net states "2.6 KB gzipped · GA 145 KB" and "under 3 KB gzipped" on
 * six surfaces, and the build failing is what makes that claim un-staleable.
 * Click capture alone measured +294 gzipped bytes against 382 bytes of
 * headroom; copies and form submits would not fit at all. Splitting keeps the
 * core byte-identical, keeps every published claim true, and means a site that
 * does not want interaction capture pays NOTHING for it.
 *
 * 🔑 IT CARRIES NO IDENTITY AND NO TRANSPORT OF ITS OWN. Everything goes through
 * the core's public API (window.pulse.track / window.pulse.cleanPath), so there
 * is no second session concept, no second endpoint, and no duplicated payload
 * construction. Calls are guarded at fire time rather than at load time, so the
 * two tags work in either order — and if the core never loads, nothing is sent,
 * which is correct: no core means no analytics at all.
 *
 * WHAT IT NEVER CAPTURES, by design:
 *   - anything typed. No input values, no field names, no keystrokes. Rybbit's
 *     "Input Change" event type is deliberately absent and is not a later phase.
 *   - the text a visitor copied. Only how many characters, and from what kind of
 *     element. People very often copy their OWN data back out of a page.
 *   - any element under [data-pulse-ignore], or inside an input or a
 *     contenteditable region.
 *
 * Opt-outs, on THIS tag: data-no-clicks, data-no-copy, data-no-forms.
 */
(function () {
  'use strict';

  var me = document.currentScript;
  function off(name) {
    return !!me && me.hasAttribute('data-no-' + name);
  }
  var doClicks = !off('clicks');
  var doCopy = !off('copy');
  var doForms = !off('forms');
  if (!doClicks && !doCopy && !doForms) return;

  // * Guarded at FIRE time, not load time: the tags may be in either order, and
  // * the core may legitimately never arrive (blocked, 404, opted out).
  function track(name, props) {
    var p = window.pulse;
    if (p && typeof p.track === 'function') p.track(name, props);
  }
  function pagePath() {
    var p = window.pulse;
    return p && typeof p.cleanPath === 'function' ? p.cleanPath() : location.pathname;
  }

  // * Redaction runs IN THE BROWSER, so the raw string never leaves it. A
  // * control's label can carry a person's name, an email, an order number.
  // * The server caps and re-redacts too — this endpoint is public.
  var EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
  var DIGITS_RE = /\d[\d\s-]{5,}\d/g;
  var TEXT_MAX = 60;

  function redact(s) {
    return String(s).replace(/\s+/g, ' ').trim()
      .replace(EMAIL_RE, '[email]')
      .replace(DIGITS_RE, '[number]');
  }
  function cap(s) {
    return s.length > TEXT_MAX ? s.slice(0, TEXT_MAX) + '…' : s;
  }

  /**
   * The label of an activatable control.
   *
   * 🔴 NOT `textContent`. It concatenates every descendant text node with NO
   * separator, so a card-shaped link — one that wraps a tag, a read time and a
   * title — records as a single welded word. Measured on ciphera.net/blog,
   * 11-09-2026, and it is what every card link on every site does:
   *
   *     text: "Privacy7 min readPulse Is Free for Open-Source Projects and \u2026"
   *
   * That is not a label. It is three labels with the spaces removed, and then cut
   * at 60 characters. It was invisible while events rendered as property chips
   * and became unmissable the moment the trail started reading them as sentences.
   *
   * 🔴 NOT `innerText` either, which WOULD insert the breaks — jsdom does not
   * implement it, so the guard could not be tested. That is exactly the
   * `isContentEditable` trap (see the note in `suppressed` below): a rule about
   * data leaving a browser must be testable, and cosmetics is not a good enough
   * reason to repeat it.
   *
   * So: walk the descendants and join their text with a space. `redact` collapses
   * the whitespace runs afterwards, so the join never leaves a double space.
   */
  function controlLabel(el) {
    var aria = el.getAttribute('aria-label');
    if (aria) return aria;
    var parts = [];
    (function walk(node) {
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) parts.push(c.data);
        else if (c.nodeType === 1) walk(c);
      }
    })(el);
    return parts.join(' ');
  }

  /**
   * True when this element, or anything above it, must never be recorded.
   * Also the place the "nothing typed" rule is enforced — walking up means a
   * click on a label inside a form control is caught too.
   */
  function suppressed(el) {
    while (el && el.nodeType === 1) {
      if (el.hasAttribute('data-pulse-ignore')) return true;
      var t = el.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return true;
      // 🔴 THE ATTRIBUTE, NOT ONLY THE PROPERTY. `isContentEditable` is
      // computed from rendering and jsdom does not implement it — it is
      // `undefined` even on the element carrying the attribute — so a guard
      // written on the property alone is not merely untested here, it is
      // UNTESTABLE, which is not an acceptable state for the rule that keeps
      // typed text out of the payload. Checking the attribute as we walk up
      // also covers inherited editability, which is what the property gave us.
      // Any value except an explicit "false" means editable, per the spec.
      if (el.isContentEditable) return true;
      if (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false') return true;
      el = el.parentElement;
    }
    return false;
  }

  // ── Clicks ───────────────────────────────────────────────────────────
  // Only an element a visitor can actually ACTIVATE carries a label worth
  // recording. A click on page prose is not an interaction, and capturing the
  // paragraph it landed in would be capturing the page's content.
  if (doClicks) {
    document.addEventListener(
      'click',
      function (e) {
        var el = e.target;
        if (suppressed(el)) return;
        var hit = null;
        while (el && el.nodeType === 1) {
          var t = el.tagName;
          if (t === 'BUTTON' || t === 'A' || el.getAttribute('role') === 'button') { hit = el; break; }
          el = el.parentElement;
        }
        if (!hit) return;
        // 🔑 An <a> that leaves the site is already recorded by the core as
        // outbound_link or file_download. Recording it here as well would
        // double-count one click as two events.
        if (hit.tagName === 'A' && hit.href) {
          try {
            var u = new URL(hit.href, location.href);
            if ((u.protocol === 'http:' || u.protocol === 'https:') && u.hostname !== location.hostname) return;
          } catch (err) { /* unparseable: treat as an ordinary control */ }
        }
        var label = cap(redact(controlLabel(hit)));
        if (!label) return; // * an unlabelled control describes nothing
        var props = { text: label, tag: hit.tagName.toLowerCase(), page_path: pagePath() };
        if (hit.id) props.id = hit.id;
        track('pulse_click', props);
      },
      true, // * capture phase: fires before default navigation
    );
  }

  // ── Copies ───────────────────────────────────────────────────────────
  // 🔴 THE TEXT IS NOT SENT, AND MUST NEVER BE. Its LENGTH is read here to
  // report a count and is never put in the payload. "Did they copy the pricing?"
  // is answered by the count and the source element; "what did they copy?" is
  // not a question an analytics product should be able to answer.
  if (doCopy) {
    document.addEventListener('copy', function (e) {
      var sel = window.getSelection ? window.getSelection() : null;
      if (!sel || sel.isCollapsed) return;
      var node = sel.anchorNode;
      var el = node && node.nodeType === 1 ? node : node && node.parentElement;
      if (suppressed(el)) return;
      var n = String(sel).length;
      if (!n) return;
      track('pulse_copy', {
        chars: String(n),
        source_tag: el ? el.tagName.toLowerCase() : 'unknown',
        page_path: pagePath(),
      });
    });
  }

  // ── Form submits ─────────────────────────────────────────────────────
  // Structure only: which form, and how many fields it had. 🔴 Never a field
  // VALUE and never a field NAME — on a short form a field name can be as
  // telling as its value.
  if (doForms) {
    document.addEventListener('submit', function (e) {
      var f = e.target;
      if (!f || f.tagName !== 'FORM') return;
      // Not suppressed(f): a form contains inputs by definition, so the
      // "nothing typed" walk would reject every form. The ignore attribute is
      // still honoured, on the form or above it.
      var el = f;
      while (el && el.nodeType === 1) {
        if (el.hasAttribute('data-pulse-ignore')) return;
        el = el.parentElement;
      }
      var props = { fields: String(f.elements ? f.elements.length : 0), page_path: pagePath() };
      var id = f.getAttribute('id');
      var name = f.getAttribute('name');
      if (id) props.form_id = redact(id).slice(0, TEXT_MAX);
      if (name) props.form_name = redact(name).slice(0, TEXT_MAX);
      track('pulse_form_submit', props);
    });
  }
})();
