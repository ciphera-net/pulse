# Changelog

All notable changes to Pulse (frontend and product) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Pulse uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with a **0.x.y** version scheme while in initial development. The leading `0` indicates that the public API and behaviour may change until we release **1.0.0**.

## [Unreleased]

### Added

- **App Switcher in User Menu.** Click your profile in the top right and you'll now see a "Ciphera Apps" section. Expand it to quickly jump between Pulse, Drop (file sharing), and your Ciphera Account settings. This makes it easier to discover and navigate between Ciphera products without signing in again.
- **Session synchronization across tabs.** When you sign out in one browser tab, you're now automatically signed out in all other tabs of the same app. This prevents situations where you might still appear signed in on another tab after logging out. The same applies to signing in — when you sign in on one tab, other tabs will update to reflect your authenticated state.
- **Faster billing page loading.** Your subscription details now load much quicker when you visit the billing page. Previously, several requests to our payment provider were made one after another, which could add 1-2 seconds to the page load. Now these happen simultaneously, cutting the wait time significantly. If any request takes too long, we gracefully continue so you always see your billing information without frustrating delays.
- **Faster funnel analysis for multi-step conversions.** We've significantly improved how conversion funnels are calculated. Instead of scanning your data multiple times for each step in a funnel, we now do it in a single efficient pass. This means complex funnels with multiple steps load almost instantly instead of taking seconds—or even timing out. We've also added a reasonable limit of 5 steps per funnel to ensure optimal performance.
- **More reliable database connections under heavy load.** We've optimized how Pulse manages its database connections to handle much higher traffic without issues. By increasing the connection pool size and improving how connections are reused, your dashboard stays responsive even when thousands of users are viewing analytics simultaneously. We also added better monitoring so we can detect and address connection issues before they affect you.
- **Better support for growing teams and traffic.** We've added infrastructure improvements that allow Pulse to run smoothly across multiple servers. When you scale up to handle more traffic, our background processes—like daily analytics calculations and data cleanup—will coordinate automatically so they don't conflict with each other. This ensures reliable performance as your team and data grow.
- **Smarter protection for heavy dashboard operations.** We've implemented a new tiered rate limiting system that treats complex dashboard queries differently from simple requests. Expensive operations—like loading your full dashboard with all its charts and data—now have their own dedicated limits to prevent anyone from accidentally overwhelming the system with too many rapid refreshes. This keeps everything running smoothly for everyone, especially during busy periods.
- **Smarter caching for faster dashboard loading.** We've added intelligent caching headers to our API responses, so your browser can remember recently loaded data and show it instantly when you navigate between pages. This works alongside our existing server-side caching to make your dashboard feel even more responsive—especially when switching between different date ranges or sections.
- **More flexible uptime monitoring.** We've made our uptime checker more adaptable to different needs. Instead of a fixed limit on how many websites we can check simultaneously, you can now configure this based on your requirements. This means faster uptime checks for busy sites with many monitors, while keeping things efficient for smaller setups.
- **Smarter data cleanup for better performance.** We've improved how old analytics data is cleaned up to keep everything running smoothly. Instead of deleting large amounts of data all at once—which could slow things down—we now remove old data in small, efficient batches. This ensures your dashboard stays fast and responsive even as we clean up months of historical data behind the scenes.
- **Faster analytics processing for all sites.** We've upgraded how your daily analytics are calculated behind the scenes. Instead of processing sites one by one, we now analyze multiple sites simultaneously using a smart parallel system. This means your daily stats—like visitor counts and page views—are updated more quickly and consistently, even as we handle data from thousands of websites.
- **Lighter dashboard data transfers.** Your dashboard now loads data in smaller, focused pieces instead of one massive bundle. This means faster loading times—especially on slower connections—and your analytics appear section by section as they become ready, rather than making you wait for everything at once.
- **Smarter data fetching.** Your dashboard now automatically prevents duplicate requests when multiple components ask for the same data at the same time. It also briefly caches recent responses, so switching between pages feels instant while still keeping everything up to date. This reduces server load and makes the app feel snappier.
- **Smarter dashboard updates.** Your dashboard now knows when you're actively viewing it versus when it's in the background. When you switch to another tab, we intelligently slow down data refreshes to save resources, then instantly catch up when you return. This keeps your analytics current without putting unnecessary load on the system.
- **Instant real-time visitor counts.** Your dashboard's "current visitors" counter now updates lightning-fast using an optimized tracking system. Instead of scanning your entire database, we maintain a live session index that shows active visitors in milliseconds—even when thousands of people are browsing your sites simultaneously.
- **Faster event tracking.** Your analytics data is now captured instantly without slowing down your website. We've switched to asynchronous processing that collects events in batches of 100, so your visitors' page views and interactions are recorded with zero impact on their browsing experience, even during traffic spikes.
- **Faster dashboard loading.** Your site analytics now load almost instantly, even during busy periods. Behind the scenes, we've added intelligent caching that remembers your dashboard data for 30 seconds and refreshes it automatically in the background. Real-time visitor counts are updated every 5 seconds so you always see current activity without waiting.
- **Better data management for long-term performance.** We've restructured how your analytics data is stored so the app stays fast even as you collect months of data. Old data is now automatically organized by month and cleaned up efficiently based on your retention settings, keeping everything running smoothly no matter how much traffic you get.
- **Smarter database indexing.** We've optimized how your analytics data is indexed, making common queries—like loading your dashboard or filtering by date—significantly faster. This also reduces storage overhead, keeping the app lean as your data grows.
- **Faster dashboard statistics.** Loading stats for any date range is now much quicker. Instead of recalculating from scratch every time, we use pre-computed daily summaries so your analytics appear instantly, even for months of data.
- **Performance insights. Track how fast your site loads with Core Web Vitals (page load speed, layout shifts, responsiveness). Turn it on in Site Settings → Data & Privacy to see a performance widget on your dashboard.
- **Goals & Events.** Define custom goals (e.g. signup, purchase) and track them with `pulse.track()` in your snippet. Counts appear on your dashboard once you add goals in Site Settings → Goals & Events.
- **2FA recovery codes backup.** When you enable 2FA, you receive recovery codes. You can now regenerate new codes (with password confirmation) from Settings and download them as a `.txt` file. Regenerating invalidates all existing codes.

### Fixed

- **Shopify and embedded site tracking.** The Pulse tracking script now loads correctly when embedded on third-party sites like Shopify stores, WooCommerce, or custom storefronts. Previously, tracking failed because the script was redirected to the login page instead of loading.
- **Opening Pulse from the Ciphera hub.** Clicking Pulse on the auth apps page (auth.ciphera.net/apps) now signs you in correctly instead of showing "Invalid state". Previously, leftover OAuth data from a past login attempt could block the session flow; the callback now detects redirects from the hub (no `state` in the URL), clears stale PKCE storage, and completes token exchange.
- **Admin organizations list.** Organizations that created a site but never subscribed now appear in the admin list. Previously only orgs with a billing row were shown.
- **Sign in after inactivity.** Clicking "Sign in" after a period of inactivity no longer does nothing. Previously, stale refresh cookies caused the middleware to redirect away from the login page; now only a valid access token triggers that redirect, so you can complete OAuth sign-in when your session has expired.
- **Frequent re-login.** You no longer have to sign in multiple times a day. When the access token expires after 15 minutes of inactivity, the app now automatically refreshes it using your refresh token on the next page load, so you stay logged in for up to 30 days.
- **2FA disable now requires password confirmation.** Disabling 2FA sends the derived password to the backend for verification. This prevents an attacker with a hijacked session from stripping 2FA.
- **More accurate visitor tracking.** We fixed rare edge cases where visitor counts could be slightly off during busy traffic spikes. Previously, the timestamp-based session ID generation could occasionally create overlapping identifiers. Every visitor now gets a truly unique UUID that never overlaps with others, ensuring your analytics are always precise.

## [0.11.1-alpha] - 2026-02-23

### Changed

- **Safer sign-in from the Ciphera hub.** When you open Pulse from the Ciphera Apps page, your credentials are no longer visible in the browser address bar. Sign-in now uses a secure one-time code that expires in seconds, so your session stays private even if someone sees your screen or browser history.

## [0.11.0-alpha] - 2026-02-22

### Added

- **Better page titles.** Browser tabs now show which site and page you're on (e.g. "Uptime · example.com | Pulse") instead of the same generic title everywhere.
- **Link previews for public dashboards.** Sharing a public dashboard link on social media now shows a proper preview with the site name and description.
- **Faster login redirects.** If you're not signed in and try to open a dashboard or settings page, you're redirected to login immediately instead of seeing a blank page first. Already-signed-in users who visit the login page are sent straight to the dashboard.
- **Graceful error recovery.** If a page crashes, you now see a friendly error screen with a "Try again" button instead of a blank white page. Each section of the app has its own error message so you know exactly what went wrong.
- **Security headers.** All pages now include clickjacking protection, MIME-sniffing prevention, a strict referrer policy, and HSTS. Browser APIs like camera and microphone are explicitly disabled.
- **Better form experience.** Forms now auto-focus the first field when they open, text inputs enforce character limits with a visible counter when you're close, and the settings page warns you before navigating away with unsaved changes.
- **Accessibility improvements.** The notification bell, workspace switcher, and all dashboard tabs are now fully keyboard-navigable. Screen readers announce unread counts, active organizations, and tab changes correctly. Decorative icons are hidden from assistive technology.
- **Smooth organization switching.** Switching between organizations now shows a branded loading screen instead of a blank flash while the page reloads.
- **Graceful server shutdown.** Deployments no longer kill in-flight requests or interrupt background tasks. The server finishes ongoing work before shutting down, so your active sessions aren't cut off mid-action.
- **Database connection pooling.** The backend now limits and recycles database connections, preventing exhaustion under load and keeping queries fast even with many concurrent users.
- **Date range validation.** Analytics, funnel, and uptime queries now reject invalid date ranges (end before start, or spans longer than a year) and show a clear error instead of empty or confusing results.
- **Excluded paths limit.** Sites can now have up to 50 excluded paths. Previously there was no cap, which could slow down event processing; the limit keeps things fast while still giving you flexibility.

### Changed

- **Smoother loading experience.** Pages now show a subtle preview of the layout while data loads instead of a blank screen or spinner. This applies everywhere — dashboards, settings, uptime, funnels, notifications, billing, and detail modals.
- **Clearer error messages.** When something goes wrong, the error message now tells you what failed (e.g. "Failed to load uptime monitors") instead of a generic "Failed to load data".
- **Faster favicon loading.** Site icons in the dashboard, referrers, and campaigns now use Next.js image optimization for better caching and lazy loading.
- **Tighter name limits.** Site, funnel, and monitor names are now capped at 100 characters instead of 255 — long enough for any real name, short enough to not break the UI.
- **Stricter type safety.** Eliminated all `any` types and `@ts-ignore` suppressions across the codebase, so the TypeScript compiler catches more bugs at build time and fewer edge cases slip through.
- **Smaller page downloads.** Icon imports are now tree-shaken so only the icons actually used are included in the bundle, reducing download size and speeding up page loads.
- **Removed debug logs.** Auth and organization-switching details no longer leak into the browser console in production. Error logs are now also suppressed in production and only appear during development.

### Fixed

- **Landing page dashboard preview.** The homepage now shows a realistic preview of the Pulse dashboard instead of an empty placeholder.
- **Logout redirect loop.** Signing out no longer bounces you straight to Ciphera Auth. You now land on the Pulse homepage where you can choose to sign back in.
- **No more loading flicker.** Fast-loading pages no longer flash a loading state for a split second before showing content.
- **Organization context switch.** Switching away from a deleted organization now stores the session correctly instead of using an insecure fallback.
- **Dark mode uptime chart.** The response time chart on the uptime page now correctly follows your dark mode preference instead of always showing a white tooltip background.
- **Onboarding form limits.** The welcome page now enforces the same character limits as the rest of the app.
- **Audit log reliability.** Failed audit log writes are now logged to the server instead of being silently ignored, so gaps in the audit trail are detectable.
- **Safer error messages.** Server errors no longer expose internal details (database errors, stack traces) to the browser. You see a clear message like "Failed to create site" while the full error is logged server-side for debugging.
- **Content Security Policy.** The backend CSP header was being overwritten by a duplicate, and the captcha service was incorrectly whitelisted under image sources instead of connection sources. Both are now fixed.
- **Logout redirect loop.** Signing out no longer bounces you straight to Ciphera Auth. You now land on the Pulse homepage where you can choose to sign back in.
- **Date range edge case.** The maximum date range check could be off by a day due to an internal time adjustment. It now compares calendar days accurately.

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

[Unreleased]: https://github.com/ciphera-net/pulse/compare/v0.11.1-alpha...HEAD
[0.11.1-alpha]: https://github.com/ciphera-net/pulse/compare/v0.11.0-alpha...v0.11.1-alpha
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
