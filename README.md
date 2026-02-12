# Pulse

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-green.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Built with Next.js](https://img.shields.io/badge/Built%20with-Next.js-blue.svg?logo=next.js&logoColor=white)](https://nextjs.org/)
[![Hosted in Switzerland](https://img.shields.io/badge/Hosted%20in-Switzerland-red.svg)](https://en.wikipedia.org/wiki/Switzerland)

**Pulse** is a privacy-first analytics platform by Ciphera. Use it as a hosted service—no self-hosting required.

## Get Pulse

Pulse is available as a commercial product. Hosted in Switzerland, it gives you real-time analytics and insights without compromising your visitors' privacy.

**[Try Pulse Free →](https://pulse.ciphera.net)**

## Features

- **Privacy-First Dashboard**: Simple, clean interface for viewing analytics
- **Site Management**: Create, edit, and delete sites
- **Real-time Stats**: Live visitor counts and real-time updates
- **Analytics Views**: Pageviews, visitors, top pages, referrers, countries
- **Dark Mode**: Full dark mode support
- **Responsive Design**: Works on desktop and mobile

## Technology Stack

- **Framework**: Next.js 16+ (App Router)
- **Styling**: Tailwind CSS with Ciphera design tokens
- **Charts**: Recharts for data visualization
- **Authentication**: OAuth flow with ciphera-auth
- **UI Components**: @ciphera-net/ui for shared components
- **Hosting**: Swiss infrastructure

## Contributing

This repository is open source. If you want to contribute (bug fixes, features, docs), see [CONTRIBUTING.md](CONTRIBUTING.md) for setup and workflow.

## Releasing

Changelog and release process (who updates it, when, how to tag, deploy) are documented in [docs/releasing.md](docs/releasing.md). Versions use **0.x.y** while in initial development; the single product changelog is [CHANGELOG.md](CHANGELOG.md).

## Design System

The frontend follows the Ciphera design language:

- **Brand Color**: Orange (#FD5E0F) - used as accent only
- **Neutral Colors**: Full scale (50-900) for UI elements
- **Dark Mode**: Full support with class-based switching
- **Font**: Plus Jakarta Sans
- **Design Patterns**:
  - Rounded corners (rounded-xl, rounded-3xl)
  - Smooth transitions (duration-200, duration-300)
  - Shadow effects with brand-orange accents

## License

AGPL-3.0
