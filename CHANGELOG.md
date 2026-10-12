# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-10-12

### Changed

- Rebuilt on Effect 4.0 (stable): the API is an Effect `HttpApi` shared with a typed browser client, persistence uses Effect SQL on libSQL, and UI state lives in Effect atoms
- Upgraded Astro 7, React 19.3, Vitest 5, TypeScript 6, Biome 2.5, Tailwind 4.3, Playwright 1.64
- Production image runs on Node 24 (built with Bun); migrations run on startup, no entrypoint script
- Spotify token refresh happens on the server, so images no longer need the client ID at build time
- The OAuth callback hands the token over in the URL fragment instead of the query string
- Stats use the browser's time zone for days, weeks, and streaks
- The timer measures elapsed time from the clock, so throttled background tabs stay accurate
- Browser tracing is only forwarded when `OTEL_COLLECTOR_URL` is set
- `staging` branch with `:staging` images; releases are PRs from `staging` into `main`

### Fixed

- Longest streak was computed from unsorted, unpadded date keys
- Contribution graph and stats mixed UTC and local dates
- Completing an unknown pomodoro returned 500 instead of 404
- Login could redirect to another site through the `return` parameter

### Removed

- Drizzle ORM and drizzle-kit (existing databases are adopted as-is)
- Unused components and the `db:*` scripts

## [1.4.0] - 2025-12-15

### Added

- Structured logging using Effect's built-in logging system (#17)
- Configurable log level via `PUBLIC_LOG_LEVEL` environment variable
- Configurable log format via `PUBLIC_LOG_FORMAT` (pretty/json)
- Debug logging for all Effect services (Timer, SessionRepository, SpotifyClient, SpotifyAuth, Auth, AudioNotification)
- Debug logging for all API routes with request context
- `ServerLayer` for API routes combining SessionRepository with logging

### Technical

- Centralized logging configuration in `src/effect/logging.ts`
- `Effect.annotateLogs` for structured log context
- `Effect.withLogSpan` for operation duration tracking
- Pretty logger in development, JSON logger in production (configurable)

## [1.3.0] - 2025-12-11

### Added

- GitHub-style contribution graph showing daily pomodoro activity (#22)
- Year selector to view historical data across multiple years
- Time period tabs: Today, Week, Month, Year, All
- Seed script for testing stats with multi-year data

### Changed

- Stats now show full historical data (removed 365-day limit)
- Consistent calculation across all time periods

## [1.2.0] - 2025-12-11

### Added

- Stop button to end pomodoro without auto-transitioning (#19)

### Changed

- Keybinds updated: B=start break, F=start focus, E=end pomodoro
- Removed timer pause functionality (simpler UX)

## [1.1.0] - 2025-12-11

### Added

- Optional authentication for VPS deployments (#15)
- Login page with lofi aesthetic
- Stateless signed cookie authentication (HMAC-SHA256)
- Auth middleware protecting all routes when enabled
- 13 unit tests for Auth service (60 total)
- Docker convenience scripts (`bun run docker:dev`, `docker:down`, `docker:logs`)
- Playback error toast when Spotify device is unavailable
- robots.txt disallowing all crawlers

### Fixed

- Session recording now uses imperative API calls instead of reactive useEffect, eliminating duplicate entries in React StrictMode
- Stats now count completed pomodoros (after break ends) instead of completed focus sessions
- Environment variables now work in both dev (`import.meta.env`) and Docker production (`process.env`)

### Security

- Timing-safe credential comparison prevents timing attacks
- HttpOnly cookies prevent XSS token theft
- Cookie signature verification prevents tampering

### Configuration

New optional environment variables:
- `AUTH_ENABLED` - Enable authentication (default: false)
- `AUTH_PASSWORD` - Login password (username is always "admin")
- `AUTH_SECRET` - Secret for signing cookies

## [1.0.0] - 2025-12-10

### Added

- Timer presets: Short (15/3), Classic (25/5), Long (50/10)
- Docker Compose deployment for self-hosting
- Health check endpoint (`/api/health`) for container monitoring
- Coolify-compatible deployment
- Server-side OAuth PKCE flow for HTTP compatibility on local networks
- Astro sessions for secure PKCE state management
- PR template with CONTRIBUTING.md checklist

### Changed

- README rewritten for Docker-first deployment with local/HTTPS setup options
- Removed custom timer configuration (replaced with presets)
- Improved timer hint text clarity ("end early", "begin" instead of "skip")
- Switched from better-sqlite3 to libsql for cross-runtime compatibility

### Fixed

- DialogContent accessibility warning (added aria-describedby)
- OAuth flow works on HTTP for localhost/127.0.0.1 (Spotify requirement)

### Technical

- Multi-stage Dockerfile with `oven/bun:1-slim` base
- Production and development compose files
- SQLite persistence via Docker volume
- Server-side PKCE using Node crypto (bypasses browser secure context requirement)
- libsql client for Bun runtime compatibility

## [0.2.0] - 2025-12-10

### Added

- Session statistics dashboard with metrics (pomodoros, focus time, streaks, overtime)
- SQLite database for session persistence (Drizzle ORM)
- End early / skip workflow (removed pause functionality)
- REST API endpoints for session recording
- Unit tests with Vitest and @effect/vitest (49 tests)
- Database management scripts (db:migrate, db:clean, db:studio)

### Changed

- Timer flow: press E to end early, S to skip (no more pause)
- Astro now runs in SSR mode with Node adapter
- Help text shows contextual hints based on timer state

### Technical

- SessionRepository service for database operations
- Automatic session recording on phase transitions
- better-sqlite3 for Node.js compatibility

## [0.1.0] - 2025-12-10

### Fixed

- PKCE challenge not found error on initial Spotify authentication (#7)
- Spotify autoplay not working when Spotify app is already open but paused (#8)
- AudioContext autoplay policy warning in browser console

### Changed

- Development server now runs on port 2500
- AudioContext is lazy-initialized on first timer completion instead of on page load

### Dependencies

- Updated lucide-react

## [0.0.2] - 2025-12-07

### Fixed

- Vinyl record now spins immediately on first play (previously required double click)
- CSS `@import` order warning from PostCSS (moved Google Fonts import to top of file)
- README documentation now uses `127.0.0.1` instead of `localhost` for Spotify redirect URI

### Changed

- New lofi-style favicon (vinyl record with tomato/pomodoro center)

## [0.0.1] - 2025-12-07

### Added

- Pomodoro timer with configurable focus and break durations
- Overtime mode - timer counts up after completion so you decide when to take a break
- Spotify OAuth integration (PKCE flow)
- Playlist selection with auto-shuffle and repeat
- Phase badges (FOCUS/BREAK/OVERTIME) above timer display
- Light/dark theme toggle
- Keyboard controls (Space/Enter to start/pause, R to reset, S to switch phase)
- Audio notification when timer ends
- Lofi aesthetic UI design

### Technical

- Built with Astro, React, Tailwind CSS v4, and shadcn/ui
- State management with Effect-TS services
- Spotify Web API integration for playback control
- JSDoc documentation throughout codebase

[1.4.0]: https://github.com/davidlbowman/spotify-pomodoro/compare/1.3.0...1.4.0
[1.3.0]: https://github.com/davidlbowman/spotify-pomodoro/compare/1.2.0...1.3.0
[1.2.0]: https://github.com/davidlbowman/spotify-pomodoro/compare/1.1.0...1.2.0
[1.1.0]: https://github.com/davidlbowman/spotify-pomodoro/compare/1.0.0...1.1.0
[1.0.0]: https://github.com/davidlbowman/spotify-pomodoro/compare/0.2.0...1.0.0
[0.2.0]: https://github.com/davidlbowman/spotify-pomodoro/compare/0.1.0...0.2.0
[0.1.0]: https://github.com/davidlbowman/spotify-pomodoro/compare/0.0.2...0.1.0
[0.0.2]: https://github.com/davidlbowman/spotify-pomodoro/compare/0.0.1...0.0.2
[0.0.1]: https://github.com/davidlbowman/spotify-pomodoro/releases/tag/0.0.1
