# Pulse Polish Audit

**Date:** 2026-03-16
**Version:** 0.15.0-alpha

## Current State

Pulse is a mature product — 55+ routes, 156 API handlers, 50 migrations, 8 background workers, 3 third-party integrations. The codebase is clean with zero TODO/FIXME comments. Recent work has focused on UX refinements: empty state CTAs, animated number transitions, inline bar charts, and mobile responsiveness fixes.

## Polish Opportunities

### High Impact

#### ~~1. Custom 404 Page~~ ✅ Already Done
- Branded 404 page exists at `app/not-found.tsx` with "Go back home" and "View FAQ" CTAs

#### 2. Rate Limit (429) UX Feedback
- **Issue:** When rate limited, API requests fail silently with no user feedback
- **Effort:** Low
- **Action:** Catch 429 responses in the API client and show a toast with retry timing (`Retry-After` header)

### Medium Impact

#### 3. Export Progress Indicator
- **Issue:** PDF/Excel exports have no progress bar and can appear frozen on large datasets
- **Effort:** Low
- **Action:** Add a determinate or indeterminate progress bar inside `ExportModal.tsx`

#### 4. Filter Application Feedback
- **Issue:** Applying filters has no loading/transition indicator
- **Effort:** Low
- **Action:** Show a subtle loading state on the dashboard when filters change and data is refetching

#### 5. Inline Form Validation
- **Issue:** All validation errors go to toasts only; no inline field-level error messages
- **Effort:** Medium
- **Action:** Add inline error messages below form fields (funnel creation, goal creation, site settings)

#### 6. Accessibility: Modal Focus Trapping
- **Issue:** Modals don't trap focus, breaking keyboard-only navigation
- **Effort:** Medium
- **Action:** Implement focus trapping in modal components (VerificationModal, ExportModal, settings modals)

#### 7. Accessibility: ARIA Live Regions
- **Issue:** Real-time visitor count updates aren't announced to screen readers
- **Effort:** Low
- **Action:** Add `aria-live="polite"` to `RealtimeVisitors.tsx` and other auto-updating elements

#### 8. Table Pagination Loading
- **Issue:** No loading indicator when paginating through table data
- **Effort:** Low
- **Action:** Show a loading spinner or skeleton overlay when fetching the next page of results

### Low Impact

#### 9. Remove Unused `axios` Dependency
- **Issue:** `apiRequest` is the actual HTTP client; `axios` is dead weight in the bundle
- **Effort:** Trivial
- **Action:** `npm uninstall axios` and verify no imports reference it

#### 10. PWA Service Worker Caching
- **Issue:** `@ducanh2912/next-pwa` is configured but no offline caching strategy exists
- **Effort:** Medium
- **Action:** Define a caching strategy for static assets and API responses, or remove the PWA dependency

#### 11. Image Lazy Loading
- **Issue:** Table/list images (favicons, flags) don't use `loading="lazy"`
- **Effort:** Low
- **Action:** Add `loading="lazy"` to images in referrer lists, country tables, and similar components

#### 12. OpenAPI Specification
- **Issue:** Backend has no Swagger/OpenAPI doc; README serves as the only API documentation
- **Effort:** High
- **Action:** Generate an OpenAPI spec from Go handler annotations or write one manually

## Additional Notes

- **No i18n** — English only. Worth planning if expanding to international markets.
- **Test coverage** — 16 backend test files cover core logic well, but GSC/BunnyCDN sync and report delivery e2e are gaps.
- **Chart.tsx is 35KB** — A candidate for splitting into sub-components eventually.
