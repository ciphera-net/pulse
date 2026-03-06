# Changelog

All notable changes to Pulse (frontend and product) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Pulse uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with a **0.x.y** version scheme while in initial development. The leading `0` indicates that the public API and behaviour may change until we release **1.0.0**.

## [Unreleased]

## [0.13.0-alpha] - 2026-03-02

### Added

- **AI traffic source identification.** Pulse now automatically recognizes visitors coming from AI tools — ChatGPT, Perplexity, Claude, Gemini, Copilot, DeepSeek, Grok, Meta AI, You.com, and Phind. These sources appear in your Top Referrers with proper brand icons and display names instead of raw domain URLs. If someone clicks a link in an AI chat to visit your site, you'll see exactly which AI tool sent them.
- **Automatic outbound link tracking.** Pulse now tracks when visitors click links that take them to other websites. These show up as "outbound link" events in your Goals & Events panel — no setup needed. You can turn this off in your tracking snippet settings if you prefer.
- **Automatic file download tracking.** When a visitor clicks a link to a downloadable file — PDF, ZIP, Excel, Word, MP3, and 20+ other formats — Pulse records it as a "file download" event. Like outbound links, this works automatically with no setup required.
- **Automatic 404 error page detection.** Pulse now detects when a visitor lands on a page that doesn't exist and records it as a "404" event. You'll see these in your Goals & Events panel so you can find and fix broken links. Works automatically — no setup needed.
- **Automatic scroll depth tracking.** Pulse now tracks how far visitors scroll down each page — at 25%, 50%, 75%, and 100% milestones. These show up as scroll events in your Goals & Events panel, helping you understand which content keeps people reading. Works automatically with no configuration required.

### Improved

- **Cleaner internal API code.** The analytics data-fetching layer has been streamlined — 13 near-identical endpoint functions were consolidated using a shared pattern, cutting roughly half the code while keeping every feature working exactly as before. This makes it easier to add new analytics endpoints in the future and reduces the chance of inconsistencies between them.
- **Simpler endpoint management on the backend.** The backend previously required adding every new analytics endpoint in two separate places — one for public dashboards and one for authenticated users. A shared route table now handles both automatically, so new endpoints only need to be defined once. This reduces the chance of one side getting out of sync with the other.
- **Modern config loading for the app.** The app's configuration file now uses proper ES module imports instead of an older CommonJS pattern. This aligns with modern JavaScript standards and enables better tooling support.
- **Complete API documentation in the backend README.** The developer documentation now lists all 80+ endpoints organized by category — ingestion, public dashboard, sites, analytics, real-time, goals, funnels, uptime, billing, notifications, admin, and audit. Previously only 12 endpoints were documented, which understated the full scope of the system.
- **Login page now shows a loading screen while redirecting.** Previously, the login page briefly showed a blank white screen before redirecting you to the sign-in page. You'll now see the Pulse logo and a "Redirecting to log in..." message, matching the signup page experience.
- **More reliable duplicate detection for goals.** When creating or updating a goal with a name that already exists, Pulse now uses the database's built-in error codes instead of checking error message text. This means duplicate goal detection works reliably regardless of database version or language settings.
- **More consistent builds across environments.** The backend Docker image now uses a pinned operating system version instead of "latest," so builds produce identical results whether run today or months from now.
- **Cleaner internal code for cookie handling.** Cookie domain logic that was duplicated in two places is now shared, reducing the chance of the two copies drifting out of sync during future changes.
- **Smoother navigation across the app.** Switching pages, changing organizations, or signing in no longer triggers unnecessary background checks. Previously, an internal effect re-ran on every navigation because it watched the entire user object for changes — now it only reacts when your authentication state or organization actually changes. This makes page transitions faster and reduces redundant network requests.
- **Faster uptime data cleanup under heavy usage.** Old uptime check records are now removed in small batches instead of all at once. Previously, a single large deletion could briefly slow down database performance when months of monitoring data had accumulated. Cleanup now runs incrementally so your dashboard stays responsive throughout.
- **More reliable automated testing.** Backend tests that verify authentication and billing no longer rely on a fragile internal shortcut that could mask real bugs. If a code change accidentally reaches the database during a test, it now fails gracefully with a clear error instead of crashing silently.
- **Database queries are now verified automatically before every release.** A new step in our release process runs all database operations against a real PostgreSQL database — including applying all schema migrations — so we catch query errors, missing columns, and data-access bugs before they reach production.
- **Safer database schema changes.** The large migration that restructured how your analytics data is stored now has a documented rollback procedure. If anything goes wrong during a database upgrade, we can revert cleanly instead of requiring manual intervention.
- **Easier setup for new developers.** Building and testing Pulse no longer requires a specific directory layout on your machine. All builds use a pre-packaged snapshot of dependencies, so you can clone the project and start working immediately without extra setup steps.
- **Faster, smarter dashboard data loading.** Your dashboard now loads each section independently using an intelligent caching strategy. Data refreshes happen automatically in the background, and when you switch tabs the app pauses updates to save resources — resuming instantly when you return. This replaces the previous approach where everything loaded in one large batch, meaning your charts, visitor maps, and stats now appear faster and update more reliably.
- **Better data accuracy across the dashboard.** All data displayed on the dashboard — pages, locations, devices, referrers, performance metrics, and goals — is now fully typed end-to-end. This eliminates an entire class of potential display bugs where data could be misinterpreted between the server and your screen.
- **Dashboard stays fast under heavy traffic.** When many users view their dashboards at the same time, the backend now limits how many data queries run in parallel so it doesn't overwhelm the database. If you navigate away while the dashboard is loading, queries are cancelled immediately instead of continuing to run in the background.
- **Improved error visibility and debugging.** When something goes wrong behind the scenes, the backend now logs detailed, structured information about what happened — including exactly which site, page, or operation was affected. This means issues are diagnosed and fixed faster, reducing any downtime or data gaps you might experience.
- **Clearer error trails across the system.** Every database operation now includes context about what was happening when an error occurred. Instead of vague failures, support can trace problems back to their exact source — so if an issue affects your analytics, it gets identified and resolved much more quickly.
- **Clearer rate limiting for analytics tracking.** When your tracking script sends too many events from the same session, Pulse now tells the script explicitly that the request was rejected. Previously, these events were silently accepted but never recorded, which could make your visitor counts look lower than expected without any visible explanation.
- **Earlier detection of configuration problems.** The server now checks your email and internal integration settings at startup and warns you immediately if anything looks incomplete. Previously, you might not discover a misconfigured email setting until a billing alert or uptime notification failed to send.
- **Safer campaign date handling.** Campaign analytics now use the same date validation as the rest of the app, including checks for invalid ranges and a maximum span of one year. Previously, campaigns used separate date parsing that skipped these checks.
- **Full React 19 type coverage.** Upgraded TypeScript type definitions to match the React 19 runtime. Previously, the type definitions lagged behind at React 18, which could hide bugs and miss new React 19 APIs during development.
- **Lower resource usage under load.** The backend now uses a single shared connection to Redis instead of opening dozens of separate ones. Previously, each rate limiter and internal component created its own connection pool, which could waste resources and risk hitting connection limits during heavy traffic.
- **More reliable billing operations.** Billing actions like changing your plan, cancelling, and viewing invoices now benefit from the same automatic session refresh, request tracing, and error handling as the rest of the app. Previously, these used a separate internal path that could fail silently if your session expired mid-action.
- **Stronger browser protection with Content Security Policy.** The app now tells your browser exactly which resources it's allowed to load — scripts, styles, images, and API connections are restricted to trusted sources only. This adds an extra layer of defence against cross-site scripting (XSS) attacks.
- **Tighter cross-origin request handling.** The backend now only accepts requests from known Pulse and Ciphera origins instead of any website. This prevents other sites from making authenticated requests on your behalf.
- **Stricter environment security checks.** Staging and other non-development deployments now refuse to start if critical secrets haven't been configured, catching configuration mistakes before they reach users.
- **Billing configuration validated at startup.** Stripe payment keys are now checked when the server starts instead of when a billing request comes in. Misconfigured payment settings surface immediately during deployment rather than silently failing when you try to manage your subscription.
- **Faster real-time visitor cleanup.** The background process that keeps active visitor counts accurate no longer briefly blocks other operations while scanning for stale sessions. Cleanup now runs incrementally so your dashboard stays responsive at all times.
- **Stricter input validation on admin pages.** The internal admin panel now validates organisation identifiers before processing requests, preventing malformed data from reaching the database.
- **Error messages no longer reveal internal details.** When you submit an invalid form, the error message now says "Invalid request body" instead of exposing internal field names and validation rules. This makes error messages cleaner while keeping your data safer.
- **Better request cancellation for billing operations.** All billing-related database operations can now be properly cancelled if you navigate away or your connection drops. Previously, some operations would continue running in the background even after you left the page.
- **More resilient event processing.** The background system that processes your analytics events now automatically recovers from unexpected errors instead of silently stopping. If something goes wrong, it restarts itself and continues processing — so you never lose incoming analytics data.

### Fixed

- **Rate limiting now works correctly for all visitors.** A bug in the backend meant that IP-based rate limiting — which protects against abuse on public dashboards and the tracking script — was treating all visitors as the same person. A single heavy user could hit the limit for everyone. Rate limiting now correctly identifies individual visitors, so one bad actor can't affect others.
- **More reliable list rendering across the dashboard.** Pages, referrers, locations, devices, funnels, and other data lists now use stable identifiers (like page paths and referrer URLs) instead of array positions as their React keys. This prevents potential display glitches — such as stale data appearing in the wrong row — when lists are filtered, sorted, or updated in real time.
- **Deleting a site now fully cleans up all its data.** Previously, deleting a site removed the site record but could leave behind orphaned analytics events in the database, slowly accumulating unused data. Now all events are cleaned up automatically in small batches before the site is removed, keeping your database tidy.
- **Team members can now view real-time visitor data.** Previously, only the person who originally created a site could see live visitors and session details. Now any team member in the same organization can access real-time data for all their shared sites — the same way the rest of the dashboard already works.
- **Consistent date handling across all analytics.** Funnel analytics now use the same date format (`YYYY-MM-DD`) as every other part of Pulse. Previously, funnels required a different, more technical date format, which meant date range pickers and bookmarked links didn't always work correctly between funnels and the rest of the dashboard.
- **Tracking script now works on all tracked websites.** Page views were silently failing to record when the tracking script ran on your website. Two issues were at play: the backend was rejecting analytics data sent from tracked sites, and even after that was resolved, events were silently dropped during processing because they were missing a required identifier. Both are now fixed — your dashboard receives visits from all registered domains as expected.
- **Real-time visitor count no longer stops updating.** The dashboard's live visitor counter would quickly hit a rate limit and stop refreshing, showing "Site not found" errors. The limit was too low for normal polling, especially with multiple tabs open. It now has enough headroom for typical usage.
- **Funnel details now load correctly.** Opening a funnel showed "Unable to load funnel" with a server error. An internal query was referencing data that no longer existed at that stage of processing, causing it to fail every time. Funnels now load and display step-by-step conversion data as expected.
- **App switcher and site icons now load correctly.** The Pulse, Drop, and Auth logos in the app switcher — and site favicons on the dashboard — were blocked by the browser's Content Security Policy. The policy now allows images from Ciphera's own domain and Google's favicon service, so all icons display as expected.
- **Better crash protection in goals and real-time views.** Fixed an issue where the backend could crash under rare conditions when checking permissions for goals or real-time visitor data. The app now handles unexpected values gracefully instead of crashing.
- **More reliable service health reporting.** The backend health check no longer falsely reports the service as unhealthy after sustained traffic. Previously, an internal counter grew over time and would eventually cross a fixed threshold — even under normal load — causing orchestrators to unnecessarily restart the service.
- **Session list now correctly highlights your current session.** The active sessions list in settings now properly identifies which session you're currently using. Previously, the "current session" marker never appeared due to an internal mismatch in how sessions were identified.
- **Notifications no longer fail to load on sign-in.** The notification bell now loads correctly even when the app is still setting up your workspace context. Previously, it could briefly show an error right after signing in.
- **Fixed a service worker error on first visit.** Removed leftover icon files with invalid filenames that caused a caching error in the background. This had no visible effect but produced console warnings.
- **More reliable database migrations.** The migration system no longer silently skips partially failed database updates. If an update fails, it stops immediately so the issue can be identified and fixed — rather than marking it as complete and moving on with missing changes.

### Removed

- **Cleaned up unused files.** Removed six leftover component and utility files that were no longer used anywhere in the app, along with dead backend code. This reduces clutter and keeps the codebase easier to navigate.
- **Removed unused backend code.** Deleted an old CORS middleware that was never wired up, and an 80-line legacy funnel query that had been superseded by a faster implementation. Less code means fewer things to maintain and audit.

## [0.12.0-alpha] - 2026-03-01

### Added

- **Automated testing for improved reliability.** Pulse now has a comprehensive test suite that verifies critical parts of the app work correctly before every release. This covers login and session protection, error tracking, online/offline detection, and background data refreshing. These checks run automatically so regressions are caught before they reach you.
- **App Switcher in User Menu.** Click your profile in the top right and you'll now see a "Ciphera Apps" section. Expand it to quickly jump between Pulse, Drop (file sharing), and your Ciphera Account settings. This makes it easier to discover and navigate between Ciphera products without signing in again.
- **Session synchronization across tabs.** When you sign out in one browser tab, you're now automatically signed out in all other tabs of the same app. This prevents situations where you might still appear signed in on another tab after logging out. The same applies to signing in — when you sign in on one tab, other tabs will update to reflect your authenticated state.
- **Session expiration warning.** You'll now see a heads-up banner 3 minutes before your session expires, giving you time to click "Stay signed in" to extend your session. If you ignore it or dismiss it, your session will end naturally after the 15-minute timeout for security. If you interact with the app (click, type, scroll) while the warning is showing, it automatically extends your session.
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

### Changed

- **Request ID tracing for debugging.** All API requests now include a unique Request ID header (`X-Request-ID`) that helps trace requests across frontend and backend services. When errors occur, the Request ID is included in the response, making it easy to find the exact request in server logs for debugging.
- **App Switcher now shows consistent order.** The Ciphera Apps menu now always displays apps in the same order: Pulse, Drop, Auth — regardless of which app you're currently using. Previously, the current app was shown first, causing the order to change depending on context. This creates a more predictable navigation experience.

### Fixed

- **Shopify and embedded site tracking.** The Pulse tracking script now loads correctly when embedded on third-party sites like Shopify stores, WooCommerce, or custom storefronts. Previously, tracking failed because the script was redirected to the login page instead of loading.
- **Opening Pulse from the Ciphera hub.** Clicking Pulse on the auth apps page (auth.ciphera.net/apps) now signs you in correctly instead of showing "Invalid state". Previously, leftover OAuth data from a past login attempt could block the session flow; the callback now detects redirects from the hub (no `state` in the URL), clears stale PKCE storage, and completes token exchange.
- **Admin organizations list.** Organizations that created a site but never subscribed now appear in the admin list. Previously only orgs with a billing row were shown.
- **Sign in after inactivity.** Clicking "Sign in" after a period of inactivity no longer does nothing. Previously, stale refresh cookies caused the middleware to redirect away from the login page; now only a valid access token triggers that redirect, so you can complete OAuth sign-in when your session has expired.
- **Frequent re-login.** You no longer have to sign in multiple times a day. When the access token expires after 15 minutes of inactivity, the app now automatically refreshes it using your refresh token on the next page load, so you stay logged in for up to 30 days.
- **2FA disable now requires password confirmation.** Disabling 2FA sends the derived password to the backend for verification. This prevents an attacker with a hijacked session from stripping 2FA.
- **More accurate visitor tracking.** We fixed rare edge cases where visitor counts could be slightly off during busy traffic spikes. Previously, the timestamp-based session ID generation could occasionally create overlapping identifiers. Every visitor now gets a truly unique UUID that never overlaps with others, ensuring your analytics are always precise.
- **More reliable background processing.** When multiple Pulse servers are running, background tasks like daily analytics calculations and data cleanup now coordinate more safely. Previously, under rare timing conditions, two servers could accidentally run the same task at the same time, which could lead to slightly inaccurate stats. Each server now holds a unique token that prevents one from interfering with another's work.
- **Cross-tab sign-out cleanup.** Signing out in one tab now fully clears your session data in all other tabs. Previously, some session-related entries were left behind, which could briefly show stale state before the redirect completed.
- **Settings sidebar highlight.** The "Manage Account" section in Settings now stays highlighted when you're viewing Trusted Devices or Security Activity. Previously, navigating to a sub-page removed the highlight from the parent section, making it unclear which group you were in.
- **More accurate readiness checks.** The service health endpoint now actively verifies that the cache and real-time tracker are reachable, not just configured. Previously, the readiness check only confirmed these services were set up—not that they were actually responding—so the API could report "ready" even when Redis or the tracker was down.

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

[Unreleased]: https://github.com/ciphera-net/pulse/compare/v0.13.0-alpha...HEAD
[0.13.0-alpha]: https://github.com/ciphera-net/pulse/compare/v0.12.0-alpha...v0.13.0-alpha
[0.12.0-alpha]: https://github.com/ciphera-net/pulse/compare/v0.11.1-alpha...v0.12.0-alpha
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
