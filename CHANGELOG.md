# Changelog

All notable changes to Pulse (frontend and product) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Pulse uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with a **0.x.y** version scheme while in initial development. The leading `0` indicates that the public API and behaviour may change until we release **1.0.0**.

## [Unreleased]

## [0.11.0-alpha] - 2026-02-22

### Changed

- **Smoother loading experience.** Pages now show a subtle preview of the layout while data loads instead of a blank screen or spinner. This applies everywhere — dashboards, settings, uptime, funnels, notifications, billing, and detail modals.
- **No more loading flicker.** Fast-loading pages no longer flash a loading state for a split second before showing content.
- **Clearer error messages.** When something goes wrong, the error message now tells you what failed (e.g. "Failed to load uptime monitors") instead of a generic "Failed to load data".
- **Faster favicon loading.** Site icons in the dashboard, referrers, and campaigns now use Next.js image optimization for better caching and lazy loading.
- **Better page titles.** Browser tabs now show which site and page you're on (e.g. "Uptime · example.com | Pulse") instead of the same generic title everywhere.
- **Link previews for public dashboards.** Sharing a public dashboard link on social media now shows a proper preview with the site name and description.
- **Faster login redirects.** If you're not signed in and try to open a dashboard or settings page, you're redirected to login immediately instead of seeing a blank page first. Already-signed-in users who visit the login page are sent straight to the dashboard.
- **Graceful error recovery.** If a page crashes, you now see a friendly error screen with a "Try again" button instead of a blank white page. Each section of the app has its own error message so you know exactly what went wrong.
- **Security headers.** All pages now include clickjacking protection, MIME-sniffing prevention, a strict referrer policy, and HSTS. Browser APIs like camera and microphone are explicitly disabled.
- **Better form experience.** Forms now auto-focus the first field when they open, text inputs enforce character limits with a visible counter when you're close, and the settings page warns you before navigating away with unsaved changes.
- **Tighter name limits.** Site, funnel, and monitor names are now capped at 100 characters instead of 255 — long enough for any real name, short enough to not break the UI.

### Fixed

- **Organization context switch.** Switching away from a deleted organization now stores the session correctly instead of using an insecure fallback.
- **Removed debug logs.** Auth and organization-switching details no longer leak into the browser console in production.

## [0.10.0-alpha] - 2026-02-21

### Changed

- **Design consistency (PULSE-59).** Pulse now feels more cohesive across all pages — headings, buttons, and layout are consistent.
- **Headings.** Marketing and integration pages use the same heading sizes for a clearer visual hierarchy.
- **Buttons.** Settings pages and the verification modal use consistent button styles. The Enterprise "Contact us" button on pricing now matches the rest.
- **Settings layout.** Profile settings, Organization Settings, and Site Settings now span the full width of the page, matching the dashboard.
- **Charts and maps.** Analytics charts, funnel views, and the uptime map now use Pulse's brand colors correctly in both light and dark mode.
- **Integration guides.** Code examples in the integration and installation guides look cleaner and work better in dark mode.
- **Dark mode.** Text and backgrounds across settings, pricing, and funnels are easier to read when you switch themes.
- **Cards and panels.** All cards use consistent padding for a more even layout.
- **Integration pages.** Integration setup guides have more comfortable spacing at the top.
- **Org slug.** The organization URL prefix correctly shows `pulse.ciphera.net/` instead of the wrong domain.

## [0.9.0-alpha] - 2026-02-21

### Added

- **Data retention settings (PULSE-58).** Site owners can choose how long raw event data is kept (1 month to 3 years depending on plan). Events older than the retention period are automatically deleted every 24 hours. Aggregated daily stats are preserved so historical charts remain intact.
- **Data Retention section in Site Settings.** Under Data & Privacy, a dropdown lets you set retention; options are capped by your plan (free: up to 6 months, solo: 1 year, team: 2 years, business: 3 years).
- **Privacy snippet includes retention.** The generated privacy policy text now mentions when raw data is automatically deleted.

## [0.8.0-alpha] - 2026-02-20

### Added

- **Renewal date and amount.** The dashboard and billing tab now show when your subscription renews and how much you'll be charged.
- **Invoice preview when changing plans.** Before you switch plans, you can see exactly what your next invoice will be (including prorations).
- **Pay now for open invoices.** Unpaid invoices show a clear "Pay now" button so you can settle them quickly.
- **Enterprise contact.** The pricing page Enterprise plan now links to email us directly instead of checkout.
- **Past due alert.** If your payment fails, a red banner appears with a link to update your payment method.
- **Pageview usage bar.** Your billing card shows a color-coded bar so you can see at a glance how close you are to your limit (green, then amber, then red).

### Changed

- **Change plan flow.** Cleaner plan selector with Solo, Team, and Business options. Shows which plan you're on and a preview of your next invoice. If the preview can't be calculated, you'll see a friendly message instead of a blank screen.
- **Billing tab layout.** Improved spacing, clearer headings, and better focus when using keyboard navigation.
- **Pricing page layout.** Updated spacing and typography. Slider and billing toggle are more accessible.
- **Billing Portal return.** After updating your payment method in Stripe's portal, you're taken back to the billing tab instead of the general settings page.

### Fixed

- **Theme toggle crash.** Fixed a crash that could occur when switching between light and dark mode on the pricing page and then opening organization settings.

## [0.7.0-alpha] - 2026-02-17

### Changed

- **ciphera-ui consolidation.** Migrated shared components and utilities to @ciphera-net/ui (v0.0.57): SwissFlagIcon, CodeBlock, Spinner, format utilities (formatNumber, formatDuration, formatDate, getDateRange, formatUpdatedAgo, formatRelativeTime), and auth error utilities (getAuthErrorMessage, authMessageFromStatus, authMessageFromErrorType). Removed 6 local duplicate files (LoadingOverlay, SwissFlagIcon, CodeBlock, authErrors.ts, format.ts).
- **Form card border radius.** Login, signup, invite accept, verify, reset-password, forgot-password, and organization create cards now use rounded-2xl to match design system.
- **Hardcoded brand colors.** Uptime page chart uses CSS variable var(--color-brand-orange) instead of #FD5E0F.
- **Selection styling.** Removed redundant selection:bg-brand-orange/20 from page wrappers; relies on ciphera-ui base styles.
- **Inline spinners.** Dashboard widgets (TopReferrers, Locations, TechSpecs, Campaigns, ContentStats), notifications page, and OrganizationSettings now use Spinner from ciphera-ui.
- **Footer layout.** Authenticated footer container aligned to max-w-6xl (matches site dashboard and page-container-app).

### Removed

- **Dead components.** LoadingOverlay.tsx (unused; all usage already from ciphera-ui).

## [0.6.0-alpha] - 2026-02-13

### Added

- **Notification settings.** New Notifications tab in organization settings lets owners and admins toggle billing and uptime notification categories. Disabling a category stops new notifications of that type from being created.
- **In-app notification center.** Bell icon in the header with dropdown of recent notifications. Uptime monitor status changes (down, degraded, recovered) create in-app notifications with links to the uptime page.
- **Notifications UX improvements.** Bell dropdown links to "Manage settings" and "View all" notifications page. Unread count polls every 90 seconds. Full notifications page at /notifications with pagination.
- **Notifications tab visibility.** Notifications tab in organization settings is hidden from members (owners and admins only).
- **Audit log for notification settings.** Changes to notification preferences are recorded in the organization audit log.
- **Payment failed notifications.** When Stripe sends `invoice.payment_failed`, owners and admins receive an in-app notification with a link to update payment method. Members do not see billing notifications.
- **Pageview limit notifications.** Owners and admins are notified when usage reaches 80%, 90%, or 100% of the plan limit (checked every 6 hours).
- **Trial ending soon.** When a trial ends within 7 days, owners and admins receive a notification. Triggered by Stripe webhooks and a periodic checker.
- **Subscription canceled.** When a subscription is canceled, owners and admins are notified with a link to billing.

## [0.5.1-alpha] - 2026-02-12

### Changed

- **Top Referrers: X icon instead of Twitter bird.** Referrers from x.com and t.co now show the X logo instead of the legacy bird.

## [0.5.0-alpha] - 2026-02-11

### Added

- **Live chart and KPIs.** Chart and stats refresh every 30 seconds. "Live · Xs ago" indicator with green dot in the chart corner counts in real time.
- **Polling indicator.** Shows when data was last updated (bottom-right of chart card).

### Changed

- **Analytics chart improvements.** Clearer labels, compare mode shows which period you're comparing against, mini trend lines on each stat, export chart as image, and a better experience on mobile.
- **Trend context for all date ranges.** "vs yesterday" or "vs previous 7 days" now shows for Today, 7 days, and 30 days.
- **Compare label shortened.** "Compare with previous period" → "Compare".
- **Chart axes layout.** Y-axis space matches X-axis; metric label moved above chart; compact duration format for axis ticks.

## [0.4.0-alpha] - 2026-02-11

### Changed

- **Campaigns block improvements (PULSE-53).** Sortable columns, favicons and friendly names for sources, pageviews column, and export to CSV. Full dashboard export now includes campaigns.

## [0.3.0-alpha] - 2026-02-11

### Changed

- **Top Referrers favicons and names (PULSE-52).** Real favicons (Google, ChatGPT, etc.) and friendly names instead of raw URLs. Same referrer from different URLs is merged into one row.

## [0.2.0-alpha] - 2026-02-11

### Added

- **Smarter unique visitor counts.** Visitors opening several tabs/windows are counted as one person.
- **Visitor count options.** Choose "one per tab" (more private) or "one per person" (default). Dashboard shows the right embed snippet for each.

## [0.1.0-alpha] - 2026-02-09

### Added

- Initial changelog and release process.

---

[Unreleased]: https://github.com/ciphera-net/pulse/compare/v0.11.0-alpha...HEAD
[0.11.0-alpha]: https://github.com/ciphera-net/pulse/compare/v0.10.0-alpha...v0.11.0-alpha
[0.10.0-alpha]: https://github.com/ciphera-net/pulse/compare/v0.9.0-alpha...v0.10.0-alpha
[0.9.0-alpha]: https://github.com/ciphera-net/pulse/compare/v0.8.0-alpha...v0.9.0-alpha
[0.8.0-alpha]: https://github.com/ciphera-net/pulse/compare/v0.7.0-alpha...v0.8.0-alpha
[0.7.0-alpha]: https://github.com/ciphera-net/pulse/compare/v0.6.0-alpha...v0.7.0-alpha
[0.6.0-alpha]: https://github.com/ciphera-net/pulse/compare/v0.5.1-alpha...v0.6.0-alpha
[0.5.1-alpha]: https://github.com/ciphera-net/pulse/compare/v0.5.0-alpha...v0.5.1-alpha
[0.5.0-alpha]: https://github.com/ciphera-net/pulse/compare/v0.4.0-alpha...v0.5.0-alpha
[0.4.0-alpha]: https://github.com/ciphera-net/pulse/compare/v0.3.0-alpha...v0.4.0-alpha
[0.3.0-alpha]: https://github.com/ciphera-net/pulse/compare/v0.2.0-alpha...v0.3.0-alpha
[0.2.0-alpha]: https://github.com/ciphera-net/pulse/compare/v0.1.0-alpha...v0.2.0-alpha
[0.1.0-alpha]: https://github.com/ciphera-net/pulse/releases/tag/v0.1.0-alpha
