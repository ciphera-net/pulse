# Changelog

All notable changes to Pulse (frontend and product) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Pulse uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with a **0.x.y** version scheme while in initial development. The leading `0` indicates that the public API and behaviour may change until we release **1.0.0**.

## [0.5.0-alpha] - 2026-02-11

### Changed

- **Analytics chart improvements.** Clearer labels (including what the chart measures), compare mode shows which period you're comparing against, mini trend lines on each stat, export chart as image, and a better experience on mobile.

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

[Unreleased]: https://github.com/ciphera-net/pulse/compare/v0.5.0-alpha...HEAD
[0.5.0-alpha]: https://github.com/ciphera-net/pulse/compare/v0.4.0-alpha...v0.5.0-alpha
[0.4.0-alpha]: https://github.com/ciphera-net/pulse/compare/v0.3.0-alpha...v0.4.0-alpha
[0.3.0-alpha]: https://github.com/ciphera-net/pulse/compare/v0.2.0-alpha...v0.3.0-alpha
[0.2.0-alpha]: https://github.com/ciphera-net/pulse/compare/v0.1.0-alpha...v0.2.0-alpha
[0.1.0-alpha]: https://github.com/ciphera-net/pulse/releases/tag/v0.1.0-alpha
