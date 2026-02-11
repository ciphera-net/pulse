# Changelog

All notable changes to Pulse (frontend and product) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Pulse uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with a **0.x.y** version scheme while in initial development. The leading `0` indicates that the public API and behaviour may change until we release **1.0.0**.

## [0.3.0-alpha] - 2026-02-11

### Changed

- **Campaigns block improvements.** The Campaigns card now supports sortable columns (Source, Medium, Campaign, Visitors, Pageviews), source favicons with display names (matching Top Referrers), a Pageviews column, and em-dash (—) for empty Medium/Campaign. Loading state uses a skeleton instead of a spinner. Rows use stable keys for better React reconciliation. An Export button exports campaigns to CSV; the main dashboard Export (PDF/Excel) also includes campaigns when available.
- **Top Referrers favicons (PULSE-52).** The Top Referrers card now shows real site favicons (e.g. Google, ChatGPT, Instagram) when the referrer is a domain or URL. “Direct” and “Unknown” keep the globe icon; if a favicon fails to load, the previous icon is shown as fallback.
- **Referrer display names.** Referrers now show friendly names (e.g. “Google”, “Kagi”) using a heuristic from the hostname plus a small override map for famous brands (ChatGPT, LinkedIn, X, etc.). New sites get a sensible name without being added to a list.
- **Top Referrers merged by name.** Rows that map to the same display name (e.g. `chatgpt.com` and `https://chatgpt.com/...`) are merged into one row with combined pageviews, so the same source no longer appears twice.

## [0.2.0-alpha] - 2026-02-11

### Added

- **Smarter unique visitor counts.** If someone opens your site in several tabs or windows, they’re now counted as one visitor by default, so your stats better reflect real people.
- **Control over how visitors are counted.** You can switch back to “one visitor per tab” (more private, no lasting identifier) by adding an option to your script embed. The dashboard shows the right snippet for both options.
- **Optional expiry for the visitor ID.** You can set how long the cross-tab visitor ID is kept (e.g. 24 hours); after that it’s refreshed automatically.

## [0.1.0-alpha] - 2026-02-09

### Added

- Initial changelog and release process.
- Release documentation in `docs/releasing.md` and optional changelog check script.

---

[Unreleased]: https://github.com/ciphera-net/pulse/compare/v0.3.0-alpha...HEAD
[0.3.0-alpha]: https://github.com/ciphera-net/pulse/compare/v0.2.0-alpha...v0.3.0-alpha
[0.2.0-alpha]: https://github.com/ciphera-net/pulse/compare/v0.1.0-alpha...v0.2.0-alpha
[0.1.0-alpha]: https://github.com/ciphera-net/pulse/releases/tag/v0.1.0-alpha
