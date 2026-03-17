# Changelog

All notable changes to Pulse (frontend and product) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Pulse uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with a **0.x.y** version scheme while in initial development. The leading `0` indicates that the public API and behaviour may change until we release **1.0.0**.

## [Unreleased]

### Added

- **BunnyCDN integration.** Connect your BunnyCDN account in Settings > Integrations to monitor your CDN performance right alongside your analytics. A new "CDN" tab on your dashboard shows total bandwidth served, request volume, cache hit rate, origin response time, and error counts — each with percentage changes compared to the previous period. Charts show bandwidth trends (total vs cached), daily request volume, and error breakdowns over time. A geographic breakdown shows which countries consume the most bandwidth. When connecting, Pulse automatically filters your pull zones to only show ones matching your site's domain. Pulse only stores your API key encrypted and only reads statistics — it never modifies anything in your BunnyCDN account. You can disconnect and fully remove all CDN data at any time.
- **Google Search Console integration.** Connect your Google Search Console account in Settings > Integrations to see which search queries bring visitors to your site. A new "Search" tab on your dashboard shows total clicks, impressions, average CTR, and average ranking position — with percentage changes compared to the previous period. Browse your top search queries and top pages in sortable, paginated tables. Click any query to see which pages rank for it, or click any page to see which queries drive traffic to it. A trend chart shows how clicks and impressions change over time, and a green badge highlights new queries that appeared this period. Pulse only requests read-only access to your Search Console data, encrypts your Google credentials, and lets you disconnect and fully remove all search data at any time.
- **Free plan now visible on the Pricing page.** The free tier is no longer hidden — it's displayed as the first option on the Pricing page so you can see exactly what you get before signing up: 1 site, 5,000 monthly pageviews, and 6 months of data retention, completely free.
- **Free plan limited to 1 site.** Free accounts are now limited to a single site. If you need more, you can upgrade to Solo or above from the Pricing page.

### Improved

- **Smaller, faster tracking script.** The tracking script is now about 20% smaller. Logic like page path cleaning, referrer filtering, error page detection, and input validation has been moved from your browser to the Pulse server. This means the script loads faster on every page, and Pulse can improve these features without needing you to update anything.
- **Automatic 404 page detection.** Pulse now detects error pages (404 / "Page Not Found") automatically on the server by reading your page title — no extra setup needed. Previously this ran in the browser and couldn't be improved without updating the script. Now Pulse can recognize more error page patterns over time, including pages in other languages, without any changes on your end.
- **Smarter bot filtering.** Pulse now catches more types of automated traffic that were slipping through — like headless browsers with default screen sizes, bot farms that rotate through different locations, and bots that fire duplicate events within milliseconds. Bot detection checks have also been moved from the tracking script to the server, making the script smaller and faster for real visitors.
- **Actionable empty states.** When a dashboard section has no data yet, you now get a direct action — like "Install tracking script" or "Build a UTM URL" — instead of just passive text. Gets you set up faster.
- **Animated numbers across the dashboard.** Stats like visitors, pageviews, bounce rate, and visit duration now smoothly count up or down when you switch date ranges, apply filters, or when real-time visitor counts change — instead of just jumping to the new value.
- **Inline bar charts on dashboard lists.** Pages, referrers, locations, technology, and campaigns now show subtle proportional bars behind each row, making it easier to compare values at a glance without reading numbers.
- **Redesigned Journeys page.** The Journeys page has been rebuilt — the depth slider now matches the rest of the UI and goes up to 10 steps, controls are integrated into the chart card, and Top Paths uses a clean compact list with inline bars instead of bulky cards.
- **More reliable visit duration tracking.** Visit duration was silently dropping to 0s for visitors who only viewed one page — especially on mobile or when closing a tab quickly. The tracking script now captures time-on-page more reliably across all browsers, and sessions where duration couldn't be measured are excluded from the average instead of counting as 0s. This makes the Visit Duration metric, Journeys, and Top Paths much more accurate.
- **More accurate rage click detection.** Rage clicks no longer fire when you triple-click to select text on a page. Previously, selecting a paragraph (a normal 3-click action) was being counted as a rage click, which inflated frustration metrics. Only genuinely frustrated rapid clicking is tracked now.
- **Fresher CDN data.** BunnyCDN statistics now refresh every 3 hours instead of once a day, so your CDN tab shows much more current bandwidth, request, and cache data.
- **More accurate dead click detection.** Dead clicks were being reported on elements that actually worked — like close buttons on cart drawers, modal dismiss buttons, and page content areas. Three fixes make dead clicks much more reliable:
  - Buttons that trigger changes elsewhere on the page (closing a drawer, opening a modal) are no longer flagged as dead.
  - Page content areas that aren't actually clickable (like `<main>` containers) are no longer treated as interactive elements.
  - Single-page app navigations are now properly detected, so links that use client-side routing aren't mistakenly reported as broken.
- **Journeys page now shows data on low-traffic sites.** The Journeys page previously required at least 2–3 sessions following the same path before showing any data. It now shows all navigation flows immediately, so you can see how visitors move through your site from day one.
- **European date and time formatting.** All dates across Pulse now use day-first ordering (14 Mar 2025) and 24-hour time (14:30) instead of the US-style month-first format. This applies everywhere — dashboard charts, exports, billing dates, invoices, uptime checks, audit logs, and more.
- **Sites now show their verification status.** Each site on your dashboard now displays either a green "Active" badge (if verified) or an amber "Unverified" badge. The Settings page also shows a green confirmation bar once verified. When you verify your tracking script installation, the status is saved permanently — no more showing "Active" for sites that haven't been set up yet.
- **Cleaner page paths in your reports.** Pages like `/products?_t=123456` or `/about?session=abc` now correctly show as `/products` and `/about`. Trailing slashes are also normalized — `/about/` and `/about` count as the same page. Only marketing attribution parameters (like UTM tags) are preserved for traffic source tracking — all other junk parameters are automatically removed, so your Top Pages and Journeys stay clean.
- **Easier to hover country dots on the map.** The orange location markers on the world map are now much easier to interact with — you no longer need pixel-perfect aim to see the tooltip.
- **Smoother chart curves and filled area.** The dashboard chart line now flows with natural curves instead of sharp flat tops at peaks. The area beneath the line is filled with a soft transparent orange gradient that fades toward the bottom, making trends easier to read at a glance.
- **Smoother loading transitions.** When your data finishes loading, the page now fades in smoothly instead of appearing all at once. This applies across Dashboard, Journeys, Funnels, Behavior, Uptime, Settings, Notifications, and shared dashboards. If your data was already cached from a previous visit, it still loads instantly with no animation — the fade only kicks in when you're actually waiting for fresh data.
- **Faster tab switching across the board.** Switching between Settings, Funnels, Uptime, and other tabs now shows your data instantly instead of flashing a loading skeleton every time. Previously visited tabs remember their data and show it right away, while quietly refreshing in the background so you always see the latest numbers without the wait.

### Removed

- **Performance insights removed.** The Performance tab, Core Web Vitals tracking (LCP, CLS, INP), and the "Enable performance insights" toggle in Settings have been removed. The tracking script no longer collects Web Vitals data. Visit duration tracking continues to work as before.

### Fixed

- **Your BunnyCDN API key is no longer visible in network URLs.** When loading pull zones, the API key was previously sent as a URL parameter. It's now sent securely in the request body, just like when connecting.
- **No more "Site not found" when switching back to Pulse.** If you left Pulse in the background and came back, you could see a wall of errors and a blank page. This happened because the browser fired several requests at once when the tab regained focus, and if any failed, they all retried repeatedly — flooding the connection and making it worse. Failed requests now back off gracefully instead of retrying in a loop.
- **No more random errors when switching tabs.** Navigating between Dashboard, Funnels, Uptime, and Settings no longer shows "Invalid credentials", "Something went wrong", or "Site not found" errors. This was caused by a timing issue when your login session refreshed in the background while multiple pages were loading at the same time — all those requests now wait for the refresh to finish and retry cleanly.
- **More accurate pageview counts.** Refreshing a page no longer inflates your pageview numbers. The tracking script now detects when the same page is loaded again within a few seconds and skips the duplicate, so metrics like total pageviews, pages per session, and visit duration reflect real navigation instead of reload habits.
- **Self-referrals no longer pollute your traffic sources.** Internal navigation within your own site (e.g. clicking from your homepage to your about page) no longer shows your own domain as a referrer. Only external traffic sources appear in your Referrers panel now.
- **Screen size fallback now works correctly.** A variable naming issue prevented the fallback screen dimensions from being read when the primary value wasn't available. Screen size data is now reliably captured on all browsers.
- **Browser back/forward no longer double-counts pageviews.** Pressing the back or forward button could occasionally register two pageviews instead of one. The tracking script now correctly deduplicates these navigations.
- **Preloaded pages no longer count as visits.** Modern browsers sometimes preload pages in the background before you actually visit them. These ghost visits no longer inflate your pageview counts — only pages the visitor actually sees are tracked.
- **Marketing parameters no longer fragment your pages.** Pages like `/about?utm_source=google` and `/about?utm_campaign=spring` now correctly show as just `/about` in your Top Pages. UTM tags, Facebook click IDs, Google click IDs, and other tracking parameters are stripped from the page path so all visits to the same page are grouped together.
- **Traffic sources are no longer over-counted.** When a visitor arrived from Facebook (or any external source) and browsed multiple pages, every page was credited to Facebook instead of just the first. Now only the landing page shows the referrer, giving you accurate traffic source numbers.
- **UTM attribution now works correctly.** Visitors arriving via campaign links (e.g. from Facebook Ads, Google Ads, or email campaigns) now have their traffic source, medium, and campaign properly recorded. Previously, this data was accidentally lost before it reached the server.
- **Outbound links and file downloads now show the URL.** Previously you could only see how many outbound clicks or downloads happened. Now you can see exactly which external links visitors clicked and which files they downloaded.
- **Dead click detection no longer triggers on form fields.** Clicking on a text input, dropdown, or text area to interact with it is normal — it no longer gets flagged as a dead click.

## [0.15.0-alpha] - 2026-03-13

### Added

- **User Journeys tab.** A new "Journeys" tab on your site dashboard visualizes how visitors navigate through your site. A Sankey flow diagram shows the most common paths users take — from landing page through to exit — so you can see where traffic flows and where it drops off. Filter by entry page, adjust the depth (2-10 steps), and click any page in the diagram to drill into paths through it. Below the diagram, a "Top Paths" table ranks the most common full navigation sequences with session counts and average duration.

### Removed

- **Realtime visitors detail page.** The page that showed individual active visitors and their page-by-page session journey has been removed. The live visitor count on your dashboard still works — it just no longer links to a separate page.

### Added

- **Rage click detection.** Pulse now detects when visitors rapidly click the same element 3 or more times — a strong signal of UI frustration. Rage clicks are tracked automatically (no setup required) and surfaced in the new Behavior tab with the element, page, click count, and number of affected sessions.
- **Dead click detection.** Clicks on buttons, links, and other interactive elements that produce no visible result (no navigation, no DOM change, no network request) are now detected and reported. This helps you find broken buttons, disabled links, and unresponsive UI elements your visitors are struggling with.
- **Behavior tab.** A new tab in your site dashboard — alongside Dashboard, Uptime, and Funnels — dedicated to user behavior signals. Houses rage clicks, dead clicks, a by-page frustration breakdown, and scroll depth (moved from the main dashboard for a cleaner layout).
- **Frustration summary cards.** The Behavior tab opens with three at-a-glance cards: total rage clicks, total dead clicks, and total frustration signals with the most affected page — each with a percentage change compared to the previous period.
- **Scheduled Reports.** You can now get your analytics delivered automatically — set up daily, weekly, or monthly reports sent straight to your email, Slack, Discord, or any webhook. Each report includes your key stats (visitors, pageviews, bounce rate), top pages, and traffic sources, all in a clean branded format. Set them up in your site settings under the new "Reports" tab, and hit "Test" to preview before going live. You can create up to 10 schedules per site.
- **Time-of-day report scheduling.** Choose when your reports arrive — pick the hour, day of week (for weekly), or day of month (for monthly). Schedule cards show a human-readable description like "Every Monday at 9:00 AM (UTC)."

### Changed

- **Scroll depth moved to Behavior tab.** The scroll depth radar chart has been relocated from the main dashboard to the new Behavior tab, where it fits more naturally alongside other user behavior metrics.

### Fixed

- **Region names now display correctly.** Some regions were showing as cryptic codes like "14" (Poland), "KKC" (Thailand), or "IDF" (France) instead of their actual names. The Locations panel now shows proper region names like "Masovian", "Khon Kaen", and "Île-de-France."

## [0.14.0-alpha] - 2026-03-12

### Improved

- **Smarter referrer attribution.** Traffic that arrives without a referrer on a deep page (like a blog post) is now shown as "Shared Link" instead of "Direct." Real direct traffic — visitors who land on your homepage — still shows as "Direct." This gives you a much clearer picture of where your traffic actually comes from, since most unattributed deep-page visits are people clicking links shared in messaging apps or AI chatbots that strip the referrer header.
- **More in-app browsers detected.** Pulse now recognises visits from WhatsApp, Telegram, Snapchat, Pinterest, Reddit, and Threads in-app browsers and attributes them correctly instead of lumping them into "Direct."
- **Dashboard blocks are now consistent in height.** The Goals & Events and Scroll Depth panels now match the height of every other block on the dashboard.
- **Cleaner period picker.** The date range dropdown now has visual separators between the rolling windows (Today, Last 7 days, Last 30 days), the calendar periods (This week, This month), and Custom — so it's easy to tell them apart at a glance.
- **New date range options.** The period selector now includes "This week" (Monday to today) and "This month" (1st to today) alongside the existing rolling windows. Your selection is remembered between sessions.
- **Smarter comparison labels.** The "vs …" label under each stat now matches the period you're viewing — "vs yesterday" for today, "vs last week" for this week, "vs last month" for this month, and "vs previous N days" for rolling windows.
- **Refreshed stat headers.** The Unique Visitors, Total Pageviews, Bounce Rate, and Visit Duration stats at the top of the chart have a new look — uppercase labels, the percentage change shown inline next to the number, and an orange underline on whichever metric you're currently graphing.
- **Consistent green and red colors.** The up/down percentage indicators now use the same green and red as the rest of the app, instead of slightly different shades.
- **Scroll Depth is now a radar chart.** The Scroll Depth panel has been redesigned from a bar chart into a radar chart. The four scroll milestones (25%, 50%, 75%, 100%) are plotted as axes, with the filled shape showing how far visitors are getting through your pages at a glance.
- **Polished Goals & Events panel.** The Goals & Events block on your dashboard got a visual refresh to match the style of the Pages, Referrers, and Locations panels. Counts are shown in a consistent style, and hovering any row reveals what percentage of total events that action accounts for — sliding in smoothly from the right.
- **Smarter bot protection.** The security checks on shared dashboard access and organization settings now use action-specific tokens tied to each page. A token earned on one page can't be reused on another, making it harder for automated tools to bypass the captcha.
- **More resilient under Redis outages.** If the caching layer goes down temporarily, Pulse now continues enforcing rate limits using an in-memory fallback instead of letting all traffic through unchecked. This prevents one infrastructure hiccup from snowballing into a bigger problem.
- **Better handling of traffic bursts.** The system can now absorb 5x larger spikes of incoming events before applying backpressure. When events are dropped during extreme bursts, the system now tracks and logs exactly how many — so we can detect and respond to sustained overload before it affects your data.
- **Faster map and globe loading.** The interactive 3D globe and dotted map in the Locations panel now only load when you scroll down to them, instead of rendering immediately on page load. This makes the initial dashboard load faster and saves battery on mobile devices.
- **Real-time updates work across all servers.** If Pulse runs on multiple servers behind a load balancer, real-time visitor updates now stay in sync no matter which server you're connected to. Previously, you might miss live visitor changes if your connection landed on a different server than the one fetching data.
- **Lighter memory usage in long sessions.** If you manage many sites and keep Pulse open for hours, the app now automatically clears out old cached data for sites you're no longer viewing. This keeps the tab responsive and prevents it from slowly using more and more memory over time.
- **Cleaner login storage.** Temporary data left behind by abandoned sign-in attempts is now cleaned up automatically when the app loads. This prevents clutter from building up in your browser's storage over time.
- **Tidier annotation display.** If you've added a lot of annotations to your chart, only the 20 most recent are shown as lines on the chart to keep it readable. A "+N more" label lets you know there are additional annotations.
- **Even faster dashboard loading.** Your dashboard now fetches all its data — pages, locations, devices, referrers, performance, and goals — in a single request instead of seven separate ones. This means the entire dashboard appears at once rather than sections loading one by one, and puts much less strain on the server when many people are viewing their analytics at the same time.
- **Smoother real-time updates.** The real-time visitors page now streams updates instantly from the server instead of checking for new data every few seconds. Visitors appear and disappear in real-time with no delay, and the page uses far fewer server resources — especially when many people are watching their live traffic at the same time.
- **More reliable under heavy load.** Database queries now have automatic time limits so a single slow query can never lock up the system. If your dashboard or stats take too long to load, the request is gracefully cancelled instead of hanging forever — keeping everything responsive even during traffic spikes.
- **Smarter caching for dashboard data.** Your dashboard stats are now cached for longer and shared more efficiently between requests. When the cache refreshes, only one request does the work while others wait for the result — so your dashboard loads consistently fast even when lots of people are viewing their analytics at the same time.
- **Faster filtered views.** When you filter your dashboard by country, browser, page, or any other dimension, the results are now cached so repeat views load instantly. If multiple people apply the same filter, only one lookup runs and the result is shared — making filtered views much snappier under heavy use.
- **Faster entry and exit page stats.** The queries that figure out which pages visitors land on and leave from have been rewritten to be much more efficient. Instead of sorting through every single event, they now look up just the first and last page per visit — so your Entry Pages and Exit Pages panels load noticeably faster, especially on high-traffic sites.
- **Faster goal stats.** The Goals panel on your dashboard now loads faster, especially for sites with many custom events. Goal names are now looked up in a single step instead of one at a time.
- **Fairer performance under heavy traffic.** One busy site can no longer slow down dashboards for everyone else. Each site now gets its own dedicated share of server resources, so your analytics stay fast and responsive even when other sites on the platform are experiencing traffic spikes.
- **Smoother exports.** Exporting your data to PDF, Excel, or CSV no longer freezes the page. You'll see a clear "Exporting..." indicator while your file is being prepared, and the rest of the dashboard stays fully interactive.
- **Smoother "View All" popups.** Opening the expanded view for Pages, Locations, Technology, Referrers, or Campaigns now scrolls smoothly even with hundreds of items. Only the rows you can see are rendered, so the popup opens instantly on any device.
- **Faster daily stats processing.** Behind the scenes, the system that calculates your daily visitor stats now automatically scales up when there are more sites to process — so your dashboard numbers stay accurate and up to date even as the platform grows.
- **More reliable background processing.** When multiple servers are running, long-running background tasks like daily stats calculations no longer risk being interrupted or duplicated. The system now keeps its coordination lock active for as long as the task is running.

### Added

- **Peak Hours heatmap.** A new panel on your dashboard shows a 7×24 grid of when your visitors are most active — every day of the week against every hour of the day. Cells glow brighter in brand orange the busier that hour is. Hover any cell to see the exact pageview count. No other indie analytics tool surfaces this on the main dashboard.
- **Interactive 3D Globe.** The Locations panel now has a "Globe" tab showing your visitor locations on a beautiful, interactive 3D globe. Drag to rotate, and orange markers highlight where your visitors are — sized by how much traffic each country sends. The globe slowly auto-rotates and adapts to light and dark mode.
- **Dotted world map.** The "Map" tab in Locations now uses a sleek dotted map style instead of the old filled map. Country markers glow in brand orange and show a tooltip with the country name and pageview count when you hover.
- **Hide unknown locations.** New toggle in Site Settings under Data & Privacy to hide "Unknown" entries from your Locations panel. When geographic data can't be determined for a visitor, it normally shows as "Unknown" in countries, cities, and regions. Turn this on to keep your location stats clean and only show resolved locations.
- **Chart annotations.** Mark events on your dashboard timeline — like deploys, campaigns, or incidents — so you always know why traffic changed. Click the + button on the chart to add a note on any date. Annotations appear as colored markers on the chart: blue for deploys, green for campaigns, red for incidents. Hover to see the details. Team owners and admins can add, edit, and delete annotations; everyone else (including public dashboard viewers) can see them.

### Improved

- **Beautiful funnel visualization.** Funnel reports now show a smooth, animated funnel shape instead of a plain bar chart. Each step flows into the next with curved segments, hover effects, and labels showing visitor counts and conversion percentages at a glance.
- **Tidier dashboard layout.** The tab navigation (Dashboard, Uptime, Funnels, Settings) now sits above your site name and controls, keeping the tabs front and center.
- **Instant tab switching.** Clicking between Dashboard, Uptime, Funnels, and Settings now feels instant — the tab bar stays in place while the page content loads below it, instead of the whole screen flashing with a loading skeleton.
- **Smooth tab animations.** Switching tabs now plays a sliding indicator animation on the active tab and a subtle crossfade on the page content, making navigation feel polished and responsive.
- **Cleaner focus styles.** Buttons, tabs, and links no longer show an orange outline when you click them — the focus ring now only appears when navigating with the keyboard, keeping the interface clean.
- **Faster dashboard loading.** Switching to the Dashboard and Map tabs is now instant — no more brief lag or delay when navigating between sections.
- **Expand icon for data panels.** Pages, Referrers, Locations, Technology, and Campaigns panels now show a small expand icon next to the title when there's more data to see, replacing the old "View all" button at the bottom.
- **Better expanded views.** When you expand a data panel, the popup is now wider and taller so you can see more at once. Each row shows a percentage on hover, clicking a row filters your dashboard, and there's a search bar at the top to quickly find what you're looking for.
- **Smoother theme switching.** Toggling between light and dark mode now plays a satisfying circular reveal animation that expands from the toggle button, instead of everything just flipping instantly.
- **Cleaner site navigation.** Dashboard, Uptime, Funnels, and Settings now use an underline tab bar instead of floating buttons. The active section is highlighted with an orange underline, making it easy to see where you are and switch between views.
- **Consistent icon style.** All dashboard icons now use a single, unified icon set for a cleaner look across Technology, Locations, Campaigns, and Referrers panels.

### Fixed

- **Correct Instagram attribution.** Visits from Instagram's in-app browser were showing as "Facebook" because Instagram routes shared links through Facebook's URL redirector. Pulse now checks the User-Agent to detect the real source app.
- **Android and iOS now show up in OS stats.** A bug in the User-Agent parsing order meant Android was always classified as "Linux" (because Android UAs contain "Linux") and iOS as "macOS" (because iPhone UAs contain "like Mac OS X"). Both are now detected correctly.
- **Charts no longer show tomorrow's date.** The visitor chart on 7-day and 30-day views could display the next day with zero traffic, making it look like a sudden drop. The chart now ends on today.
- **Capitalized technology labels.** Device types, browsers, and OS names in the Technology panel now display with a capital first letter (e.g. "Desktop" instead of "desktop").
- **Login no longer gets stuck after updates.** If you happened to have Pulse open when a new version was deployed, logging back in could get stuck on a loading screen. The app now automatically refreshes itself to pick up the latest version.
- **City and region data is now accurate.** Location data was incorrectly showing the CDN server's location (e.g. Paris, Villeurbanne) instead of the visitor's actual city. Fixed by reading the correct visitor IP header from Bunny CDN.
- **"Reset Data" now clears everything.** Previously, resetting a site's data in Settings only removed pageviews and daily stats. Uptime check history, uptime daily stats, and cached dashboard data were left behind. All collected data is now properly cleared when you reset, while your site configuration, goals, funnels, and uptime monitors are kept.

## [0.13.0-alpha] - 2026-03-07

### Added

- **Dashboard filtering.** Filter your entire dashboard by any dimension — browser, country, page, device, OS, referrer, or UTM parameters. A single "Filter" button lets you browse dimensions, see real values from your data with visitor counts, search or type a custom value, and apply — all in a quick dropdown. Active filters appear as removable pills above your charts. Stack multiple filters to narrow things down. Filters are saved in the URL so you can bookmark or share a filtered view.
- **Click any item to filter.** Click a referrer, browser, country, page, or any other item in your dashboard panels to instantly filter the entire dashboard to just that traffic.
- **Hover percentages.** Hover over any item in Pages, Locations, Technology, or Referrers to see what percentage of total traffic it represents.
- **Custom event properties.** Your custom events can now carry extra context — for example, `pulse.track('signup', { plan: 'pro', source: 'landing' })`. Click any event in Goals & Events to see a breakdown of its properties and values, no setup needed.
- **AI traffic source identification.** Pulse recognizes visitors from ChatGPT, Perplexity, Claude, Gemini, Copilot, DeepSeek, Grok, Meta AI, You.com, and Phind. These appear in Referrers with proper icons and names instead of raw URLs.
- **Automatic outbound link tracking.** Tracks when visitors click links to other websites. Shows up as "outbound link" events in Goals & Events — no setup needed.
- **Automatic file download tracking.** Downloads of PDFs, ZIPs, Excel, Word, MP3s, and 20+ other formats are recorded as "file download" events automatically.
- **Automatic 404 detection.** Detects when visitors land on pages that don't exist and records "404" events so you can find and fix broken links.
- **Automatic scroll depth tracking.** Tracks how far visitors scroll — at 25%, 50%, 75%, and 100% — helping you understand which content keeps people reading.

### Improved

- **Chart rebuilt from scratch.** Cleaner stat cards, wider Y-axis that no longer clips labels, whole-number ticks for visitor and pageview counts, lighter grid lines, streamlined toolbar, and a properly positioned live indicator.
- **Campaigns panel redesigned.** Clean row-based layout with UTM medium and campaign always visible below the source name. Now sits in a half-width grid next to Goals & Events.
- **Better filter design.** Solid brand-colored filter pills that are easy to spot in light and dark mode. A funnel icon on the filter button. Click any pill to remove it.
- **Underline tab switchers.** Pages, Locations, and Technology panels now use clean underline tabs instead of pill-style switchers.
- **"View all" at the bottom.** The expand action on each panel is now a subtle "View all" link at the bottom of the list instead of an icon in the header.
- **Faster dashboard loading.** Each section loads independently with smart caching. Data refreshes in the background, and switching tabs pauses updates to save resources — resuming when you return.
- **Smoother navigation.** Switching pages, changing organizations, or signing in no longer triggers unnecessary background requests.
- **Loading screen while redirecting to sign-in.** The login page now shows the Pulse logo and a message instead of a blank white screen.
- **More reliable billing.** Plan changes, cancellations, and invoice views now handle session expiry and errors gracefully.
- **Stronger browser security.** Your browser now only loads scripts, styles, and images from trusted sources, adding protection against cross-site scripting.
- **More resilient analytics processing.** The system that processes your events now recovers automatically from unexpected errors instead of stopping silently.
- **Dashboard stays responsive under heavy traffic.** Parallel queries are limited during peak usage, and in-progress queries are cancelled when you navigate away.
- **Cleaner error messages.** Invalid form submissions show a simple message instead of exposing internal details.

### Fixed

- **Tracking script now works on all tracked websites.** Page views were silently failing due to two separate issues. Both are fixed — your dashboard receives visits from all registered domains as expected.
- **Rate limiting works correctly.** A bug was treating all visitors as the same person, so one heavy user could block everyone. Each visitor is now identified individually.
- **Real-time visitor count no longer stops updating.** The live counter would hit a rate limit and stop refreshing. It now has enough headroom for normal usage.
- **Team members can view real-time data.** Previously only the site creator could see live visitors. Now any team member in the same organization has access.
- **Funnel details load correctly.** Opening a funnel previously showed an error. Funnels now display step-by-step conversion data as expected.
- **Consistent date handling.** Funnels now use the same date format as the rest of Pulse, so date pickers and bookmarked links work correctly everywhere.
- **Deleting a site cleans up all data.** Orphaned analytics events are now removed automatically before the site is deleted.
- **App switcher and site icons load correctly.** Logos and favicons were blocked by a security policy. Fixed by allowing images from Ciphera and Google's favicon service.
- **Current session highlighted in settings.** The active session marker now works correctly.
- **Notifications load on sign-in.** The notification bell no longer errors briefly after signing in.
- **Duplicate filters no longer stack.** Clicking the same item twice no longer adds the same filter again.
- **Campaigns respect active filters.** The Campaigns panel now filters along with everything else instead of always showing all campaigns.
- **No duplicate "Direct" in referrer filter.** The referrer suggestions no longer show "Direct" twice.
- **Filter dropdowns show all your data.** Previously limited to 10 items — now loads up to 100 values.
- **Chart Y-axis shows whole numbers.** Visitor and pageview counts no longer show fractional values like "0.75 visitors".
- **Duplicate goal names detected reliably.** Goal name uniqueness checks now work correctly regardless of your setup.
- **Health checks stay accurate.** The backend health check no longer falsely reports the service as unhealthy after sustained traffic.

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
[0.13.0-alpha]: https://github.com/ciphera-net/pulse/releases/tag/v0.13.0-alpha
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
