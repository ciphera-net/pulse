/**
 * Maps Google/Deque documentation URLs to ciphera.net/learn articles.
 * Keys are normalized URLs (no protocol, no trailing slash, no query/hash).
 * Add entries as new /learn articles are published on ciphera.net.
 */
const LEARN_URL_MAP: Record<string, string> = {
  // Performance Metrics
  'developer.chrome.com/docs/lighthouse/performance/first-contentful-paint': 'https://ciphera.net/learn/pulse/first-contentful-paint',
  'developer.chrome.com/docs/lighthouse/performance/lighthouse-largest-contentful-paint': 'https://ciphera.net/learn/pulse/largest-contentful-paint',
  'developer.chrome.com/docs/lighthouse/performance/lighthouse-total-blocking-time': 'https://ciphera.net/learn/pulse/total-blocking-time',
  'web.dev/articles/cls': 'https://ciphera.net/learn/pulse/cumulative-layout-shift',
  'developer.chrome.com/docs/lighthouse/performance/speed-index': 'https://ciphera.net/learn/pulse/speed-index',
  'web.dev/articles/inp': 'https://ciphera.net/learn/pulse/interaction-to-next-paint',
  'developer.chrome.com/docs/lighthouse/performance/interactive': 'https://ciphera.net/learn/pulse/time-to-interactive',
  'developer.chrome.com/docs/lighthouse/performance/lighthouse-max-potential-fid': 'https://ciphera.net/learn/pulse/max-potential-first-input-delay',

  // Performance Insights
  'developer.chrome.com/docs/performance/insights/cache': 'https://ciphera.net/learn/pulse/cache-insight',
  'developer.chrome.com/docs/performance/insights/cls-culprit': 'https://ciphera.net/learn/pulse/cls-culprits-insight',
  'developer.chrome.com/docs/performance/insights/document-latency': 'https://ciphera.net/learn/pulse/document-latency-insight',
  'developer.chrome.com/docs/performance/insights/dom-size': 'https://ciphera.net/learn/pulse/dom-size-insight',
  'developer.chrome.com/docs/performance/insights/duplicated-javascript': 'https://ciphera.net/learn/pulse/duplicated-javascript-insight',
  'developer.chrome.com/docs/performance/insights/font-display': 'https://ciphera.net/learn/pulse/font-display-insight',
  'developer.chrome.com/docs/performance/insights/forced-reflow': 'https://ciphera.net/learn/pulse/forced-reflow-insight',
  'developer.chrome.com/docs/performance/insights/image-delivery': 'https://ciphera.net/learn/pulse/image-delivery-insight',
  'developer.chrome.com/docs/performance/insights/inp-breakdown': 'https://ciphera.net/learn/pulse/inp-breakdown-insight',
  'developer.chrome.com/docs/performance/insights/lcp-breakdown': 'https://ciphera.net/learn/pulse/lcp-breakdown-insight',
  'developer.chrome.com/docs/performance/insights/lcp-discovery': 'https://ciphera.net/learn/pulse/lcp-discovery-insight',
  'developer.chrome.com/docs/performance/insights/legacy-javascript': 'https://ciphera.net/learn/pulse/legacy-javascript-insight',
  'developer.chrome.com/docs/performance/insights/modern-http': 'https://ciphera.net/learn/pulse/modern-http-insight',
  'developer.chrome.com/docs/performance/insights/network-dependency-tree': 'https://ciphera.net/learn/pulse/network-dependency-tree-insight',
  'developer.chrome.com/docs/performance/insights/render-blocking': 'https://ciphera.net/learn/pulse/render-blocking-insight',
  'developer.chrome.com/docs/performance/insights/third-parties': 'https://ciphera.net/learn/pulse/third-parties-insight',
  'developer.chrome.com/docs/performance/insights/viewport': 'https://ciphera.net/learn/pulse/viewport-insight',

  // Performance Diagnostics
  'developer.chrome.com/docs/lighthouse/performance/unminified-css': 'https://ciphera.net/learn/pulse/unminified-css',
  'developer.chrome.com/docs/lighthouse/performance/unminified-javascript': 'https://ciphera.net/learn/pulse/unminified-javascript',
  'developer.chrome.com/docs/lighthouse/performance/unused-css-rules': 'https://ciphera.net/learn/pulse/unused-css-rules',
  'developer.chrome.com/docs/lighthouse/performance/unused-javascript': 'https://ciphera.net/learn/pulse/unused-javascript',
  'developer.chrome.com/docs/lighthouse/performance/total-byte-weight': 'https://ciphera.net/learn/pulse/total-byte-weight',
  'developer.chrome.com/docs/lighthouse/performance/user-timings': 'https://ciphera.net/learn/pulse/user-timings',
  'developer.chrome.com/docs/lighthouse/performance/bootup-time': 'https://ciphera.net/learn/pulse/bootup-time',
  'developer.chrome.com/docs/lighthouse/performance/mainthread-work-breakdown': 'https://ciphera.net/learn/pulse/mainthread-work-breakdown',
  'web.dev/articles/optimize-long-tasks': 'https://ciphera.net/learn/pulse/long-tasks',
  'developer.chrome.com/docs/lighthouse/performance/non-composited-animations': 'https://ciphera.net/learn/pulse/non-composited-animations',
  'web.dev/articles/optimize-cls': 'https://ciphera.net/learn/pulse/unsized-images',
  'developer.chrome.com/docs/lighthouse/performance/bf-cache': 'https://ciphera.net/learn/pulse/bf-cache',

  // Performance Hidden
  'developer.chrome.com/docs/lighthouse/performance/redirects': 'https://ciphera.net/learn/pulse/redirects',
  'developer.chrome.com/docs/lighthouse/performance/time-to-first-byte': 'https://ciphera.net/learn/pulse/server-response-time',

  // SEO
  'developer.chrome.com/docs/lighthouse/seo/is-crawlable': 'https://ciphera.net/learn/pulse/is-crawlable',
  'developer.chrome.com/docs/lighthouse/seo/http-status-code': 'https://ciphera.net/learn/pulse/http-status-code',
  'developer.chrome.com/docs/lighthouse/seo/invalid-robots-txt': 'https://ciphera.net/learn/pulse/robots-txt',
  'developer.chrome.com/docs/lighthouse/seo/meta-description': 'https://ciphera.net/learn/pulse/meta-description',
  'developer.chrome.com/docs/lighthouse/seo/link-text': 'https://ciphera.net/learn/pulse/link-text',
  'developer.chrome.com/docs/lighthouse/seo/hreflang': 'https://ciphera.net/learn/pulse/hreflang',
  'developer.chrome.com/docs/lighthouse/seo/canonical': 'https://ciphera.net/learn/pulse/canonical',
  'developer.chrome.com/docs/lighthouse/seo/structured-data': 'https://ciphera.net/learn/pulse/structured-data',

  // Best Practices
  'developer.chrome.com/docs/lighthouse/pwa/is-on-https': 'https://ciphera.net/learn/pulse/is-on-https',
  'developer.chrome.com/docs/lighthouse/pwa/redirects-http': 'https://ciphera.net/learn/pulse/redirects-http',
  'developer.chrome.com/docs/lighthouse/best-practices/geolocation-on-start': 'https://ciphera.net/learn/pulse/geolocation-on-start',
  'developer.chrome.com/docs/lighthouse/best-practices/notification-on-start': 'https://ciphera.net/learn/pulse/notification-on-start',
  'developer.chrome.com/docs/lighthouse/best-practices/csp-xss': 'https://ciphera.net/learn/pulse/csp-xss',
  'developer.chrome.com/docs/lighthouse/best-practices/has-hsts': 'https://ciphera.net/learn/pulse/has-hsts',
  'web.dev/articles/why-coop-coep': 'https://ciphera.net/learn/pulse/origin-isolation',
  'developer.chrome.com/docs/lighthouse/best-practices/clickjacking-mitigation': 'https://ciphera.net/learn/pulse/clickjacking-mitigation',
  'developer.chrome.com/docs/lighthouse/best-practices/paste-preventing-inputs': 'https://ciphera.net/learn/pulse/paste-preventing-inputs',
  'developer.chrome.com/docs/lighthouse/best-practices/image-aspect-ratio': 'https://ciphera.net/learn/pulse/image-aspect-ratio',
  'web.dev/articles/serve-responsive-images': 'https://ciphera.net/learn/pulse/image-size-responsive',
  'developer.chrome.com/docs/lighthouse/best-practices/doctype': 'https://ciphera.net/learn/pulse/doctype',
  'developer.chrome.com/docs/lighthouse/best-practices/charset': 'https://ciphera.net/learn/pulse/charset',

  // Accessibility
  'dequeuniversity.com/rules/axe/4.11/aria-allowed-attr': 'https://ciphera.net/learn/pulse/aria-allowed-attr',
  'dequeuniversity.com/rules/axe/4.11/aria-command-name': 'https://ciphera.net/learn/pulse/aria-command-name',
  'dequeuniversity.com/rules/axe/4.11/aria-conditional-attr': 'https://ciphera.net/learn/pulse/aria-conditional-attr',
  'dequeuniversity.com/rules/axe/4.11/aria-deprecated-role': 'https://ciphera.net/learn/pulse/aria-deprecated-role',
  'dequeuniversity.com/rules/axe/4.11/aria-dialog-name': 'https://ciphera.net/learn/pulse/aria-dialog-name',
  'dequeuniversity.com/rules/axe/4.11/aria-hidden-body': 'https://ciphera.net/learn/pulse/aria-hidden-body',
  'dequeuniversity.com/rules/axe/4.11/aria-hidden-focus': 'https://ciphera.net/learn/pulse/aria-hidden-focus',
  'dequeuniversity.com/rules/axe/4.11/aria-input-field-name': 'https://ciphera.net/learn/pulse/aria-input-field-name',
  'dequeuniversity.com/rules/axe/4.11/aria-meter-name': 'https://ciphera.net/learn/pulse/aria-meter-name',
  'dequeuniversity.com/rules/axe/4.11/aria-progressbar-name': 'https://ciphera.net/learn/pulse/aria-progressbar-name',
  'dequeuniversity.com/rules/axe/4.11/aria-prohibited-attr': 'https://ciphera.net/learn/pulse/aria-prohibited-attr',
  'dequeuniversity.com/rules/axe/4.11/aria-required-attr': 'https://ciphera.net/learn/pulse/aria-required-attr',
  'dequeuniversity.com/rules/axe/4.11/aria-required-children': 'https://ciphera.net/learn/pulse/aria-required-children',
  'dequeuniversity.com/rules/axe/4.11/aria-required-parent': 'https://ciphera.net/learn/pulse/aria-required-parent',
  'dequeuniversity.com/rules/axe/4.11/aria-roles': 'https://ciphera.net/learn/pulse/aria-roles',
  'dequeuniversity.com/rules/axe/4.11/aria-text': 'https://ciphera.net/learn/pulse/aria-text',
  'dequeuniversity.com/rules/axe/4.11/aria-toggle-field-name': 'https://ciphera.net/learn/pulse/aria-toggle-field-name',
  'dequeuniversity.com/rules/axe/4.11/aria-tooltip-name': 'https://ciphera.net/learn/pulse/aria-tooltip-name',
  'dequeuniversity.com/rules/axe/4.11/aria-treeitem-name': 'https://ciphera.net/learn/pulse/aria-treeitem-name',
  'dequeuniversity.com/rules/axe/4.11/aria-valid-attr-value': 'https://ciphera.net/learn/pulse/aria-valid-attr-value',
  'dequeuniversity.com/rules/axe/4.11/aria-valid-attr': 'https://ciphera.net/learn/pulse/aria-valid-attr',
  'dequeuniversity.com/rules/axe/4.11/duplicate-id-aria': 'https://ciphera.net/learn/pulse/duplicate-id-aria',
  'dequeuniversity.com/rules/axe/4.11/button-name': 'https://ciphera.net/learn/pulse/button-name',
  'dequeuniversity.com/rules/axe/4.11/document-title': 'https://ciphera.net/learn/pulse/document-title',
  'dequeuniversity.com/rules/axe/4.11/form-field-multiple-labels': 'https://ciphera.net/learn/pulse/form-field-multiple-labels',
  'dequeuniversity.com/rules/axe/4.11/frame-title': 'https://ciphera.net/learn/pulse/frame-title',
  'dequeuniversity.com/rules/axe/4.11/image-alt': 'https://ciphera.net/learn/pulse/image-alt',
  'dequeuniversity.com/rules/axe/4.11/input-button-name': 'https://ciphera.net/learn/pulse/input-button-name',
  'dequeuniversity.com/rules/axe/4.11/input-image-alt': 'https://ciphera.net/learn/pulse/input-image-alt',
  'dequeuniversity.com/rules/axe/4.11/label': 'https://ciphera.net/learn/pulse/label',
  'dequeuniversity.com/rules/axe/4.11/link-name': 'https://ciphera.net/learn/pulse/link-name',
  'dequeuniversity.com/rules/axe/4.11/object-alt': 'https://ciphera.net/learn/pulse/object-alt',
  'dequeuniversity.com/rules/axe/4.11/select-name': 'https://ciphera.net/learn/pulse/select-name',
  'dequeuniversity.com/rules/axe/4.11/skip-link': 'https://ciphera.net/learn/pulse/skip-link',
  'dequeuniversity.com/rules/axe/4.11/image-redundant-alt': 'https://ciphera.net/learn/pulse/image-redundant-alt',
  'dequeuniversity.com/rules/axe/4.11/color-contrast': 'https://ciphera.net/learn/pulse/color-contrast',
  'dequeuniversity.com/rules/axe/4.11/link-in-text-block': 'https://ciphera.net/learn/pulse/link-in-text-block',
  'dequeuniversity.com/rules/axe/4.11/accesskeys': 'https://ciphera.net/learn/pulse/accesskeys',
  'dequeuniversity.com/rules/axe/4.11/bypass': 'https://ciphera.net/learn/pulse/bypass',
  'dequeuniversity.com/rules/axe/4.11/heading-order': 'https://ciphera.net/learn/pulse/heading-order',
  'dequeuniversity.com/rules/axe/4.11/tabindex': 'https://ciphera.net/learn/pulse/tabindex',
  'dequeuniversity.com/rules/axe/4.11/definition-list': 'https://ciphera.net/learn/pulse/definition-list',
  'dequeuniversity.com/rules/axe/4.11/dlitem': 'https://ciphera.net/learn/pulse/dlitem',
  'dequeuniversity.com/rules/axe/4.11/list': 'https://ciphera.net/learn/pulse/list',
  'dequeuniversity.com/rules/axe/4.11/listitem': 'https://ciphera.net/learn/pulse/listitem',
  'dequeuniversity.com/rules/axe/4.11/td-headers-attr': 'https://ciphera.net/learn/pulse/td-headers-attr',
  'dequeuniversity.com/rules/axe/4.11/th-has-data-cells': 'https://ciphera.net/learn/pulse/th-has-data-cells',
  'dequeuniversity.com/rules/axe/4.11/meta-refresh': 'https://ciphera.net/learn/pulse/meta-refresh',
  'dequeuniversity.com/rules/axe/4.11/meta-viewport': 'https://ciphera.net/learn/pulse/meta-viewport',
  'dequeuniversity.com/rules/axe/4.11/target-size': 'https://ciphera.net/learn/pulse/target-size',
  'dequeuniversity.com/rules/axe/4.11/empty-heading': 'https://ciphera.net/learn/pulse/empty-heading',
  'dequeuniversity.com/rules/axe/4.11/html-has-lang': 'https://ciphera.net/learn/pulse/html-has-lang',
  'dequeuniversity.com/rules/axe/4.11/html-lang-valid': 'https://ciphera.net/learn/pulse/html-lang-valid',
  'dequeuniversity.com/rules/axe/4.11/html-xml-lang-mismatch': 'https://ciphera.net/learn/pulse/html-xml-lang-mismatch',
  'dequeuniversity.com/rules/axe/4.11/valid-lang': 'https://ciphera.net/learn/pulse/valid-lang',
  'dequeuniversity.com/rules/axe/4.11/video-caption': 'https://ciphera.net/learn/pulse/video-caption',

  // Best Practices General (batch 2)
  'developer.chrome.com/docs/lighthouse/best-practices/trusted-types-xss': 'https://ciphera.net/learn/pulse/trusted-types-xss',
  'developer.chrome.com/docs/lighthouse/best-practices/deprecations': 'https://ciphera.net/learn/pulse/deprecations',
  'developer.chrome.com/docs/lighthouse/best-practices/errors-in-console': 'https://ciphera.net/learn/pulse/errors-in-console',
  'developer.chrome.com/docs/lighthouse/best-practices/js-libraries': 'https://ciphera.net/learn/pulse/js-libraries',
  'developer.chrome.com/docs/devtools/javascript/source-maps': 'https://ciphera.net/learn/pulse/valid-source-maps',

  // Accessibility Best Practices (batch 2)
  'dequeuniversity.com/rules/axe/4.11/aria-allowed-role': 'https://ciphera.net/learn/pulse/aria-allowed-role',
  'dequeuniversity.com/rules/axe/4.11/identical-links-same-purpose': 'https://ciphera.net/learn/pulse/identical-links-same-purpose',
  'dequeuniversity.com/rules/axe/4.11/landmark-one-main': 'https://ciphera.net/learn/pulse/landmark-one-main',
  'dequeuniversity.com/rules/axe/4.11/table-duplicate-name': 'https://ciphera.net/learn/pulse/table-duplicate-name',

  // Accessibility Experimental (batch 2)
  'dequeuniversity.com/rules/axe/4.11/label-content-name-mismatch': 'https://ciphera.net/learn/pulse/label-content-name-mismatch',
  'dequeuniversity.com/rules/axe/4.11/table-fake-caption': 'https://ciphera.net/learn/pulse/table-fake-caption',
  'dequeuniversity.com/rules/axe/4.11/td-has-header': 'https://ciphera.net/learn/pulse/td-has-header',

  // Accessibility Manual Audits
  'developer.chrome.com/docs/lighthouse/accessibility/focusable-controls': 'https://ciphera.net/learn/pulse/focusable-controls',
  'developer.chrome.com/docs/lighthouse/accessibility/interactive-element-affordance': 'https://ciphera.net/learn/pulse/interactive-element-affordance',
  'developer.chrome.com/docs/lighthouse/accessibility/logical-tab-order': 'https://ciphera.net/learn/pulse/logical-tab-order',
  'developer.chrome.com/docs/lighthouse/accessibility/visual-order-follows-dom': 'https://ciphera.net/learn/pulse/visual-order-follows-dom',
  'developer.chrome.com/docs/lighthouse/accessibility/focus-traps': 'https://ciphera.net/learn/pulse/focus-traps',
  'developer.chrome.com/docs/lighthouse/accessibility/managed-focus': 'https://ciphera.net/learn/pulse/managed-focus',
  'developer.chrome.com/docs/lighthouse/accessibility/use-landmarks': 'https://ciphera.net/learn/pulse/use-landmarks',
  'developer.chrome.com/docs/lighthouse/accessibility/offscreen-content-hidden': 'https://ciphera.net/learn/pulse/offscreen-content-hidden',
  'developer.chrome.com/docs/lighthouse/accessibility/custom-controls-labels': 'https://ciphera.net/learn/pulse/custom-controls-labels',
  'developer.chrome.com/docs/lighthouse/accessibility/custom-control-roles': 'https://ciphera.net/learn/pulse/custom-controls-roles',
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    return (u.host + u.pathname).replace(/\/+$/, '')
  } catch {
    return url
  }
}

export function remapLearnUrl(url: string): string {
  const normalized = normalizeUrl(url)
  return LEARN_URL_MAP[normalized] || url
}
